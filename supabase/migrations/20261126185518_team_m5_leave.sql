-- =========================================================
-- Daybook Team — Milestone 5: leave
--
--  * Default leave types for every outlet (and every new outlet):
--      CL 8 days/yr, SL 7 days/yr, EL 15 days/yr (carries up to 30, paid at
--      exit), comp-off (earned by covering, M6) and unpaid. All numbers are
--      editable per outlet and marked "Verify with CA" on screen.
--  * Balances stay a sum of leave_ledger (minutes; one day = the outlet's
--    standard shift, half a day = half of it).
--  * private.team_leave_run, daily via pg_cron:
--      - on the first run of a month, credits 1/12 of each paid type's yearly
--        days for the month just finished, once probation (leave.probation_months)
--        was over by that month's first day. Twelve credits add up to the
--        yearly number exactly.
--      - in the first month of the leave year (leave.year_start), lapses
--        anything above each type's carry-forward cap, once per outlet.
--  * Staff ask from their phone (public.team_request_leave): leave.notice_days
--    ahead unless the type allows same-day (sick leave); sick leave longer
--    than its proof_after_days needs a photo in staff-documents.
--  * The manager approves or rejects (reason required). Approval takes what
--    the balance covers as paid and the rest as unpaid, and stores the
--    staffing impact the manager was shown.
--  * Approved leave shows in attendance_days as 'leave' (or 'half_day'
--    when they leave early) through private.team_recompute_day, and the
--    no-show alert skips people on leave.
-- =========================================================

-- ---------- Ledger and request columns ----------
alter table public.leave_ledger add column period date;
alter table public.leave_ledger drop constraint leave_ledger_reason_check;
alter table public.leave_ledger add constraint leave_ledger_reason_check
  check (reason in ('accrual', 'approval', 'cancellation', 'comp_off', 'encashment', 'adjustment', 'opening', 'lapse'));
-- One accrual / lapse per person, type and period.
create unique index leave_ledger_period_once on public.leave_ledger (staff_id, leave_type_id, reason, period)
  where period is not null;
create index on public.leave_ledger (ref_id) where ref_id is not null;

alter table public.leave_requests add column requested_minutes int check (requested_minutes > 0);
alter table public.leave_requests add column decision_note text check (char_length(decision_note) <= 500);
alter table public.leave_requests add constraint leave_requests_reason_length check (char_length(reason) <= 300);
create index on public.leave_requests (leave_type_id);
create index on public.leave_requests (decided_by);

alter table public.leave_types add constraint leave_types_accrual_object check (jsonb_typeof(accrual) = 'object');

-- Which outlet years have been closed (lapse done), so it happens once.
create table public.leave_year_closes (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  year_start date not null,
  closed_at timestamptz not null default now(),
  primary key (outlet_id, year_start)
);
alter table public.leave_year_closes enable row level security;
revoke all on public.leave_year_closes from anon, authenticated;

-- Staff see their own outlet's leave types (names, rules) to ask for leave.
create policy leave_types_staff_select on public.leave_types for select to authenticated
  using (outlet_id = private.staff_outlet(private.my_staff_id()));

-- ---------- Leave year ----------
create or replace function private.team_leave_year_start(p_outlet uuid, p_date date)
returns date
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_month int := case private.team_setting_text(p_outlet, 'leave.year_start', 'april') when 'january' then 1 else 4 end;
  v_start date := make_date(extract(year from p_date)::int, v_month, 1);
begin
  if v_start > p_date then v_start := (v_start - interval '1 year')::date; end if;
  return v_start;
end
$$;

-- ---------- Default types ----------
create or replace function private.team_default_leave_types(p_outlet uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.leave_types (outlet_id, code, name, paid, needs_proof, counts_for_streak, accrual) values
    (p_outlet, 'cl', 'Casual leave', true, false, true,
     '{"per_year_days": 8, "carry_forward_max_days": 0, "encashable": false, "same_day": false}'),
    (p_outlet, 'sl', 'Sick leave', true, true, true,
     '{"per_year_days": 7, "carry_forward_max_days": 0, "encashable": false, "same_day": true, "proof_after_days": 2}'),
    (p_outlet, 'el', 'Earned leave', true, false, true,
     '{"per_year_days": 15, "carry_forward_max_days": 30, "encashable": true, "same_day": false}'),
    (p_outlet, 'comp_off', 'Comp-off', true, false, true,
     '{"per_year_days": 0, "carry_forward_max_days": null, "encashable": false, "same_day": false}'),
    (p_outlet, 'unpaid', 'Unpaid leave', false, false, true,
     '{"per_year_days": 0, "same_day": false}')
  on conflict (outlet_id, code) do nothing;
  -- A new outlet starts mid-year: never lapse opening balances entered this year.
  insert into public.leave_year_closes (outlet_id, year_start)
  values (p_outlet, private.team_leave_year_start(p_outlet, (now() at time zone 'Asia/Kolkata')::date))
  on conflict do nothing;
$$;

create or replace function private.team_outlet_leave_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.team_default_leave_types(new.id);
  return null;
end
$$;
create trigger outlets_leave_defaults after insert on public.outlets
  for each row execute function private.team_outlet_leave_defaults();

select private.team_default_leave_types(o.id) from public.outlets o;

-- ---------- Helpers ----------
create or replace function private.team_leave_balance(p_staff uuid, p_type uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(l.delta_minutes), 0)::int from public.leave_ledger l
   where l.staff_id = p_staff and l.leave_type_id = p_type
$$;

-- Minutes a request takes: each day in the range that isn't a rostered
-- weekly off counts as one standard shift (half of it for a half day).
create or replace function private.team_leave_minutes(p_staff uuid, p_from date, p_to date, p_half boolean)
returns int
language sql stable security definer set search_path = ''
as $$
  select (count(*) * private.team_setting_int(private.staff_outlet(p_staff), 'hours.standard_shift_minutes', 480)
          / case when p_half then 2 else 1 end)::int
    from generate_series(p_from, p_to, interval '1 day') g
   where not exists (select 1 from public.roster_entries re
                      where re.staff_id = p_staff and re.business_date = g::date and re.kind = 'weekly_off')
$$;

create or replace function private.team_recompute_range(p_staff uuid, p_from date, p_to date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare d date;
begin
  for d in select g::date from generate_series(p_from, least(p_to, (now() at time zone 'Asia/Kolkata')::date), interval '1 day') g loop
    perform private.team_recompute_day(p_staff, d);
  end loop;
end
$$;

create or replace function private.team_notify_staff(p_staff uuid, p_kind text, p_payload jsonb, p_dedupe text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (recipient_profile_id, outlet_id, kind, payload, dedupe_key)
  select sp.auth_user_id, sp.outlet_id, p_kind, p_payload, p_dedupe from public.staff_profiles sp
   where sp.staff_id = p_staff and sp.login_enabled and sp.auth_user_id is not null
  on conflict do nothing
$$;

-- What a staff member's phone needs to know to ask for leave (they can't
-- read outlet_settings).
create or replace function public.team_my_leave_settings()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when s.id is null then null else jsonb_build_object(
    'notice_days', private.team_setting_int(s.outlet_id, 'leave.notice_days', 2),
    'day_minutes', private.team_setting_int(s.outlet_id, 'hours.standard_shift_minutes', 480)) end
    from (select private.my_staff_id() as id) me
    left join public.staff s on s.id = me.id
$$;

-- ---------- Requests ----------
create or replace function public.team_request_leave(
  p_type uuid, p_from date, p_to date, p_leaving_at time default null,
  p_reason text default null, p_proof_path text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid := private.my_staff_id();
  v_outlet uuid;
  v_name text;
  v_type public.leave_types%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_notice int;
  v_minutes int;
  v_id uuid;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  select s.outlet_id, s.name into v_outlet, v_name from public.staff s where s.id = v_staff;
  select * into v_type from public.leave_types lt where lt.id = p_type and lt.outlet_id = v_outlet and lt.active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 59
     or (p_leaving_at is not null and p_from <> p_to) then
    return jsonb_build_object('ok', false, 'reason', 'bad_dates');
  end if;
  if p_from < v_today then
    return jsonb_build_object('ok', false, 'reason', 'past_date');
  end if;
  v_notice := private.team_setting_int(v_outlet, 'leave.notice_days', 2);
  if not coalesce((v_type.accrual ->> 'same_day')::boolean, false) and p_from < v_today + v_notice then
    return jsonb_build_object('ok', false, 'reason', 'short_notice', 'notice_days', v_notice);
  end if;
  p_reason := nullif(btrim(p_reason), '');
  if char_length(p_reason) > 300 then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  if v_type.needs_proof and p_leaving_at is null and p_proof_path is null
     and p_to - p_from + 1 > coalesce((v_type.accrual ->> 'proof_after_days')::int, 0) then
    return jsonb_build_object('ok', false, 'reason', 'proof_required');
  end if;
  if p_proof_path is not null and not (
       split_part(p_proof_path, '/', 1) = v_outlet::text
       and split_part(p_proof_path, '/', 2) = v_staff::text
       and exists (select 1 from storage.objects o where o.bucket_id = 'staff-documents' and o.name = p_proof_path)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_proof');
  end if;
  if exists (select 1 from public.leave_requests lr
              where lr.staff_id = v_staff and lr.status in ('pending', 'approved')
                and lr.from_date <= p_to and lr.to_date >= p_from) then
    return jsonb_build_object('ok', false, 'reason', 'overlaps');
  end if;
  v_minutes := private.team_leave_minutes(v_staff, p_from, p_to, p_leaving_at is not null);
  if v_minutes = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_working_days');
  end if;

  insert into public.leave_requests
    (staff_id, leave_type_id, from_date, to_date, leaving_at, reason, proof_path, requested_minutes)
  values (v_staff, v_type.id, p_from, p_to, p_leaving_at, p_reason, p_proof_path, v_minutes)
  returning id into v_id;

  perform private.team_notify_managers(v_outlet, 'leave_requested',
    jsonb_build_object('request_id', v_id, 'staff_id', v_staff, 'name', v_name, 'type', v_type.name,
                       'from', p_from, 'to', p_to, 'half_day', p_leaving_at is not null),
    'leave:' || v_id);
  return jsonb_build_object('ok', true, 'request_id', v_id);
end
$$;

create or replace function public.team_decide_leave(
  p_request uuid, p_approve boolean, p_note text default null, p_impact jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.leave_requests%rowtype;
  v_paid_type boolean;
  v_total int;
  v_paid int := 0;
begin
  select * into r from public.leave_requests lr where lr.id = p_request for update;
  if not found or not private.can_manage_outlet(r.outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  p_note := nullif(btrim(p_note), '');
  if char_length(p_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_note');
  end if;
  if not p_approve and p_note is null then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;

  if p_approve then
    select lt.paid into v_paid_type from public.leave_types lt where lt.id = r.leave_type_id;
    -- Weekly offs may have been rostered since the request: count again.
    v_total := greatest(private.team_leave_minutes(r.staff_id, r.from_date, r.to_date, r.leaving_at is not null), 0);
    if v_paid_type then
      v_paid := least(v_total, greatest(private.team_leave_balance(r.staff_id, r.leave_type_id), 0));
      if v_paid > 0 then
        insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, ref_id)
        values (r.staff_id, r.leave_type_id, -v_paid, 'approval', r.id);
      end if;
    end if;
    update public.leave_requests
       set status = 'approved', requested_minutes = nullif(v_total, 0), paid_minutes = v_paid,
           unpaid_minutes = v_total - v_paid, impact_snapshot = p_impact,
           decided_by = (select auth.uid()), decided_at = now(), decision_note = p_note
     where id = r.id;
    perform private.team_recompute_range(r.staff_id, r.from_date, r.to_date);
  else
    update public.leave_requests
       set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), decision_note = p_note
     where id = r.id;
  end if;

  update public.notifications set read_at = now()
   where kind = 'leave_requested' and dedupe_key = 'leave:' || r.id and read_at is null;
  perform private.team_notify_staff(r.staff_id, 'leave_decided',
    jsonb_build_object('request_id', r.id, 'approved', p_approve, 'from', r.from_date, 'to', r.to_date, 'note', p_note),
    'leave-decided:' || r.id);
  return jsonb_build_object('ok', true, 'paid_minutes', v_paid, 'unpaid_minutes', coalesce(v_total, 0) - v_paid);
end
$$;

-- The person can cancel a pending request, or approved leave that hasn't
-- started. A manager can cancel either at any time (approved needs a reason).
create or replace function public.team_cancel_leave(p_request uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.leave_requests%rowtype;
  v_mine boolean;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_name text;
begin
  select * into r from public.leave_requests lr where lr.id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  v_mine := coalesce(r.staff_id = private.my_staff_id(), false);
  if not (v_mine or private.can_manage_outlet(r.outlet_id)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if r.status not in ('pending', 'approved') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  p_note := nullif(btrim(p_note), '');
  if char_length(p_note) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_note');
  end if;
  if r.status = 'approved' then
    if v_mine and not private.can_manage_outlet(r.outlet_id) and r.from_date <= v_today then
      return jsonb_build_object('ok', false, 'reason', 'already_started');
    end if;
    if not v_mine and p_note is null then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
    if coalesce(r.paid_minutes, 0) > 0 then
      insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, ref_id, note)
      values (r.staff_id, r.leave_type_id, r.paid_minutes, 'cancellation', r.id, p_note);
    end if;
  end if;

  update public.leave_requests
     set status = 'cancelled', decided_by = (select auth.uid()), decided_at = now(),
         decision_note = coalesce(p_note, decision_note)
   where id = r.id;
  update public.notifications set read_at = now()
   where kind = 'leave_requested' and dedupe_key = 'leave:' || r.id and read_at is null;

  if r.status = 'approved' then
    perform private.team_recompute_range(r.staff_id, r.from_date, r.to_date);
    if v_mine then
      select s.name into v_name from public.staff s where s.id = r.staff_id;
      perform private.team_notify_managers(r.outlet_id, 'leave_cancelled',
        jsonb_build_object('request_id', r.id, 'staff_id', r.staff_id, 'name', v_name, 'from', r.from_date, 'to', r.to_date),
        'leave-cancelled:' || r.id);
    else
      perform private.team_notify_staff(r.staff_id, 'leave_cancelled',
        jsonb_build_object('request_id', r.id, 'from', r.from_date, 'to', r.to_date, 'note', p_note),
        'leave-cancelled:' || r.id);
    end if;
  end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Opening balances and corrections. Always with a reason.
create or replace function public.team_adjust_leave(p_staff uuid, p_type uuid, p_delta_minutes int, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid := private.staff_outlet(p_staff);
  v_day int;
begin
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if not exists (select 1 from public.leave_types lt where lt.id = p_type and lt.outlet_id = v_outlet and lt.paid) then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;
  v_day := private.team_setting_int(v_outlet, 'hours.standard_shift_minutes', 480);
  if p_delta_minutes is null or p_delta_minutes = 0 or abs(p_delta_minutes) > 366 * v_day then
    return jsonb_build_object('ok', false, 'reason', 'bad_amount');
  end if;
  p_note := nullif(btrim(p_note), '');
  if p_note is null or char_length(p_note) > 300 then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;
  if private.team_leave_balance(p_staff, p_type) + p_delta_minutes < 0 then
    return jsonb_build_object('ok', false, 'reason', 'below_zero');
  end if;
  insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, note)
  values (p_staff, p_type, p_delta_minutes, 'adjustment', p_note);
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Accrual and year end ----------
create or replace function private.team_leave_run(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_month date := (date_trunc('month', v_today) - interval '1 month')::date;  -- the month just finished
  v_credits int := 0;
  v_lapses int := 0;
  v_year date;
  v_k int;
  v_total int;
  v_amount int;
  v_cap int;
  r record;
  o record;
begin
  -- 1. Monthly credit for the month just finished.
  for r in
    select s.id as staff_id, s.outlet_id, sp.joining_date, lt.id as type_id,
           (lt.accrual ->> 'per_year_days')::numeric as per_year
      from public.staff s
      join public.staff_profiles sp on sp.staff_id = s.id
      join public.leave_types lt on lt.outlet_id = s.outlet_id and lt.active and lt.paid
     where s.active and sp.employment_status in ('active', 'on_notice') and sp.joining_date is not null
       and coalesce((lt.accrual ->> 'per_year_days')::numeric, 0) > 0
  loop
    continue when (r.joining_date
                   + make_interval(months => private.team_setting_int(r.outlet_id, 'leave.probation_months', 3)))::date > v_month;
    v_year := private.team_leave_year_start(r.outlet_id, v_month);
    v_k := (extract(year from age(v_month, v_year)) * 12 + extract(month from age(v_month, v_year)))::int + 1;
    v_total := round(r.per_year * private.team_setting_int(r.outlet_id, 'hours.standard_shift_minutes', 480))::int;
    -- Month k of 12 gets floor(T*k/12) - floor(T*(k-1)/12): the year adds up to T exactly.
    v_amount := (v_total * v_k) / 12 - (v_total * (v_k - 1)) / 12;
    continue when v_amount <= 0;
    insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, period, note, created_by)
    values (r.staff_id, r.type_id, v_amount, 'accrual', v_month, 'Monthly credit', null)
    on conflict (staff_id, leave_type_id, reason, period) where period is not null do nothing;
    if found then v_credits := v_credits + 1; end if;
  end loop;

  -- 2. Year end, once per outlet, during the first month of the new leave year.
  for o in select ou.id from public.outlets ou loop
    v_year := private.team_leave_year_start(o.id, v_today);
    continue when v_today >= (v_year + interval '1 month')::date;
    insert into public.leave_year_closes (outlet_id, year_start) values (o.id, v_year) on conflict do nothing;
    continue when not found;
    for r in
      select l.staff_id, l.leave_type_id, sum(l.delta_minutes)::int as balance,
             (lt.accrual ->> 'carry_forward_max_days')::numeric as carry_days
        from public.leave_ledger l
        join public.leave_types lt on lt.id = l.leave_type_id
       where lt.outlet_id = o.id and lt.paid
       group by l.staff_id, l.leave_type_id, lt.accrual
    loop
      continue when r.carry_days is null;  -- carries in full (comp-off)
      v_cap := round(r.carry_days * private.team_setting_int(o.id, 'hours.standard_shift_minutes', 480))::int;
      v_amount := r.balance - v_cap;
      continue when v_amount <= 0;
      insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, period, note, created_by)
      values (r.staff_id, r.leave_type_id, -v_amount, 'lapse', v_year, 'Year end', null)
      on conflict (staff_id, leave_type_id, reason, period) where period is not null do nothing;
      if found then v_lapses := v_lapses + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('credits', v_credits, 'lapses', v_lapses);
end
$$;

-- ---------- Day summary: now knows about approved leave ----------
create or replace function private.team_recompute_day(p_staff uuid, p_date date, p_now timestamptz default now())
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_roster public.roster_entries%rowtype;
  v_rostered_work boolean := false;
  v_has_roster boolean;
  v_shift tstzmultirange := '{}'::tstzmultirange;
  v_worked tstzmultirange := '{}'::tstzmultirange;
  v_open timestamptz;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_any boolean := false;
  v_needs boolean := false;
  v_break int := 0;
  v_late int := 0;
  v_payable int;
  v_step int;
  v_mode text;
  v_status text;
  v_leave_id uuid;
  v_leave_half boolean;
  e record;
begin
  select s.outlet_id into v_outlet from public.staff s where s.id = p_staff;
  if v_outlet is null then return; end if;

  select * into v_roster from public.roster_entries re where re.staff_id = p_staff and re.business_date = p_date;
  v_has_roster := found;
  if v_has_roster and v_roster.kind = 'work' then
    v_rostered_work := true;
    v_shift := private.team_shift_range(p_date, v_roster.segments, v_roster.extended_until);
    if v_roster.shift_template_id is not null then
      select case when st.paid_break then 0 else st.break_minutes end into v_break
        from public.shift_templates st where st.id = v_roster.shift_template_id;
      v_break := coalesce(v_break, 0);
    end if;
  end if;

  select lr.id, lr.leaving_at is not null into v_leave_id, v_leave_half
    from public.leave_requests lr
   where lr.staff_id = p_staff and lr.status = 'approved' and p_date between lr.from_date and lr.to_date
   order by lr.decided_at desc nulls last
   limit 1;

  for e in
    select ae.kind, ae.at, ae.status from public.attendance_events ae
     where ae.staff_id = p_staff and ae.business_date = p_date and ae.status <> 'void'
     order by ae.at, ae.kind
  loop
    v_any := true;
    if e.status = 'needs_confirmation' then v_needs := true; end if;
    if e.kind = 'in' then
      v_first_in := coalesce(v_first_in, e.at);
      v_open := coalesce(v_open, e.at);
    else
      v_last_out := e.at;
      if v_open is not null and e.at > v_open then
        v_worked := v_worked + tstzmultirange(tstzrange(v_open, e.at, '[)'));
      end if;
      v_open := null;
    end if;
  end loop;

  if not v_any then
    if v_has_roster and v_roster.kind = 'weekly_off' then
      v_status := 'weekly_off';
    elsif v_leave_id is not null and not v_leave_half then
      v_status := 'leave';
    elsif v_rostered_work and upper(v_shift) <= p_now then
      v_status := 'absent_unapproved';
    else
      delete from public.attendance_days ad where ad.staff_id = p_staff and ad.business_date = p_date;
      return;
    end if;
  elsif v_needs then
    v_status := 'needs_confirmation';
  elsif v_leave_id is not null and v_leave_half then
    v_status := 'half_day';
  else
    v_status := 'present';
  end if;

  -- Only rostered time is payable; unrostered days count what was worked.
  v_payable := private.team_range_minutes(case when v_rostered_work then v_worked * v_shift else v_worked end);
  if v_payable > 0 then v_payable := greatest(0, v_payable - v_break); end if;
  v_step := greatest(private.team_setting_int(v_outlet, 'attendance.rounding_minutes', 15), 1);
  v_mode := private.team_setting_text(v_outlet, 'attendance.rounding_mode', 'nearest');
  v_payable := (case v_mode
                  when 'down' then floor(v_payable::numeric / v_step)
                  when 'up' then ceil(v_payable::numeric / v_step)
                  else round(v_payable::numeric / v_step)
                end * v_step)::int;

  if v_rostered_work and v_first_in is not null then
    v_late := greatest(0, floor(extract(epoch from v_first_in - lower(v_shift)) / 60)::int);
    if v_late <= private.team_setting_int(v_outlet, 'attendance.grace_minutes', 10) then v_late := 0; end if;
  end if;

  insert into public.attendance_days as ad
    (staff_id, outlet_id, business_date, status, first_in, last_out, late_minutes, payable_minutes, leave_request_id, computed_at)
  values (p_staff, v_outlet, p_date, v_status, v_first_in, v_last_out, v_late, v_payable, v_leave_id, p_now)
  on conflict (staff_id, business_date) do update
     set status = excluded.status, first_in = excluded.first_in, last_out = excluded.last_out,
         late_minutes = excluded.late_minutes, payable_minutes = excluded.payable_minutes,
         leave_request_id = excluded.leave_request_id, computed_at = excluded.computed_at
   where (ad.status, ad.first_in, ad.last_out, ad.late_minutes, ad.payable_minutes, ad.leave_request_id)
         is distinct from (excluded.status, excluded.first_in, excluded.last_out, excluded.late_minutes,
                           excluded.payable_minutes, excluded.leave_request_id);
end
$$;

-- ---------- Sweep: skip people on leave; fill in leave days ----------
create or replace function private.team_attendance_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_closed int := 0;
  v_alerts int := 0;
  v_shift tstzmultirange;
  v_end timestamptz;
  v_out timestamptz;
  v_roster public.roster_entries%rowtype;
  r record;
begin
  -- 1. Forgotten check-outs.
  for r in
    select distinct on (ae.staff_id) ae.id, ae.staff_id, ae.outlet_id, ae.business_date, ae.kind, ae.at, s.name
      from public.attendance_events ae
      join public.staff s on s.id = ae.staff_id
     where ae.status <> 'void' and ae.business_date >= v_today - 2
     order by ae.staff_id, ae.at desc
  loop
    continue when r.kind <> 'in';
    select * into v_roster from public.roster_entries re
     where re.staff_id = r.staff_id and re.business_date = r.business_date and re.kind = 'work';
    if found then
      v_end := upper(private.team_shift_range(r.business_date, v_roster.segments, v_roster.extended_until));
    else
      v_end := r.at + make_interval(mins => private.team_setting_int(r.outlet_id, 'hours.standard_shift_minutes', 480));
    end if;
    v_out := greatest(v_end, r.at);
    continue when v_out + make_interval(mins => private.team_setting_int(r.outlet_id, 'attendance.auto_close_after_minutes', 120)) > p_now;

    insert into public.attendance_events
      (outlet_id, staff_id, business_date, kind, at, source, status, recorded_by, note)
    values (r.outlet_id, r.staff_id, r.business_date, 'out', v_out, 'auto', 'needs_confirmation', null,
            'No check-out: closed at the rostered end');
    perform private.team_recompute_day(r.staff_id, r.business_date, p_now);
    v_alerts := v_alerts + private.team_notify_managers(r.outlet_id, 'attendance_auto_closed',
      jsonb_build_object('staff_id', r.staff_id, 'name', r.name, 'date', r.business_date, 'at', v_out),
      'autoclose:' || r.id);
    v_closed := v_closed + 1;
  end loop;

  -- 2. No-shows: shift started more than the alert minutes ago, not over, nobody
  --    checked in, and not on approved full-day leave.
  for r in
    select re.staff_id, re.outlet_id, re.business_date, re.segments, re.extended_until, s.name
      from public.roster_entries re
      join public.staff s on s.id = re.staff_id and s.active
     where re.kind = 'work' and re.business_date between v_today - 1 and v_today
  loop
    v_shift := private.team_shift_range(r.business_date, r.segments, r.extended_until);
    continue when lower(v_shift) + make_interval(mins => private.team_setting_int(r.outlet_id, 'attendance.no_show_alert_minutes', 30)) > p_now;
    continue when upper(v_shift) <= p_now;
    continue when exists (select 1 from public.attendance_events ae
                           where ae.staff_id = r.staff_id and ae.business_date = r.business_date and ae.status <> 'void');
    continue when exists (select 1 from public.leave_requests lr
                           where lr.staff_id = r.staff_id and lr.status = 'approved' and lr.leaving_at is null
                             and r.business_date between lr.from_date and lr.to_date);
    v_alerts := v_alerts + private.team_notify_managers(r.outlet_id, 'attendance_no_show',
      jsonb_build_object('staff_id', r.staff_id, 'name', r.name, 'date', r.business_date,
                         'start', to_char(lower(v_shift) at time zone 'Asia/Kolkata', 'HH24:MI')),
      'noshow:' || r.staff_id || ':' || r.business_date);
  end loop;

  -- 3. Rostered or on-leave days in the last three that have no summary yet.
  for r in
    select re.staff_id, re.business_date from public.roster_entries re
     where re.business_date between v_today - 2 and v_today
       and not exists (select 1 from public.attendance_days ad
                        where ad.staff_id = re.staff_id and ad.business_date = re.business_date)
    union
    select lr.staff_id, g::date from public.leave_requests lr
     cross join lateral generate_series(greatest(lr.from_date, v_today - 2), least(lr.to_date, v_today), interval '1 day') g
     where lr.status = 'approved' and lr.to_date >= v_today - 2 and lr.from_date <= v_today
       and not exists (select 1 from public.attendance_days ad
                        where ad.staff_id = lr.staff_id and ad.business_date = g::date)
  loop
    perform private.team_recompute_day(r.staff_id, r.business_date, p_now);
  end loop;

  return jsonb_build_object('closed', v_closed, 'notifications', v_alerts);
end
$$;

-- ---------- Privileges ----------
revoke execute on function private.team_leave_year_start(uuid, date) from public, anon, authenticated;
revoke execute on function private.team_default_leave_types(uuid) from public, anon, authenticated;
revoke execute on function private.team_outlet_leave_defaults() from public, anon, authenticated;
revoke execute on function private.team_leave_balance(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.team_leave_minutes(uuid, date, date, boolean) from public, anon, authenticated;
revoke execute on function private.team_recompute_range(uuid, date, date) from public, anon, authenticated;
revoke execute on function private.team_notify_staff(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function private.team_leave_run(timestamptz) from public, anon, authenticated;
revoke execute on function private.team_recompute_day(uuid, date, timestamptz) from public, anon, authenticated;
revoke execute on function private.team_attendance_sweep(timestamptz) from public, anon, authenticated;

revoke execute on function public.team_my_leave_settings() from public, anon;
revoke execute on function public.team_request_leave(uuid, date, date, time, text, text) from public, anon;
revoke execute on function public.team_decide_leave(uuid, boolean, text, jsonb) from public, anon;
revoke execute on function public.team_cancel_leave(uuid, text) from public, anon;
revoke execute on function public.team_adjust_leave(uuid, uuid, int, text) from public, anon;
grant execute on function public.team_my_leave_settings() to authenticated;
grant execute on function public.team_request_leave(uuid, date, date, time, text, text) to authenticated;
grant execute on function public.team_decide_leave(uuid, boolean, text, jsonb) to authenticated;
grant execute on function public.team_cancel_leave(uuid, text) to authenticated;
grant execute on function public.team_adjust_leave(uuid, uuid, int, text) to authenticated;

-- ---------- Schedule: 00:30 IST every day ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('team-leave-run', '0 19 * * *', 'select private.team_leave_run()');
  end if;
end
$$;
