-- =========================================================
-- Daybook Team — Milestone 6: cover requests and overtime
--
--  * A manager asks for cover (date, skill, slot). The screen works out who
--    is eligible with the same rules as the roster (lib/team/engines/
--    eligibility.ts): right skill, free, not on leave, no new hours or
--    women's late-shift warning, fewest overtime hours this month first.
--    public.team_create_cover stores that order as offers in waves of
--    cover.offer_batch_size and sends the first wave. The database checks
--    each person again (outlet, skill, leave, availability, free slot).
--  * Each wave waits cover.offer_expiry_minutes; then the next wave goes
--    out; when nobody is left the managers are alerted (escalated).
--  * First to accept gets it (cover.award_mode = first_accept), or the
--    manager picks among those who accepted (manager_pick). The roster is
--    changed (shift extended, extra segment, or a new day) and a planned
--    overtime entry is written. Cancelling puts the roster back.
--  * Overtime pay = hourly rate × cover.ot_multiplier_bps. Hourly rate:
--    daily wage ÷ standard shift hours; monthly: (basic + DA, or gross per
--    cover.ot_rate_basis) ÷ working days (hours.working_days_basis) ÷
--    standard shift hours. Staff may take comp-off instead
--    (cover.staff_may_choose_comp_off); cover.comp_off_instead_of_pay
--    makes comp-off the only option.
--  * private.team_cover_sweep, every minute via pg_cron: next waves,
--    expiry once the slot starts, and settling finished cover from
--    attendance (worked minutes inside the slot): pay, or comp-off minutes
--    in leave_ledger, plus cover.points_per_cover points in staff_points.
--    Nobody turned up → the overtime is cancelled.
--  * Payable minutes in attendance_days include cover time (the shift got
--    longer). Payroll pays overtime from overtime_entries only and must not
--    count those minutes twice.
--  * Pay amounts are hidden from managers who can't see pay: column grants
--    leave offered_ot_paise / hourly_rate_paise / amount_paise out, and
--    public.team_cover_pay returns them to pay viewers only.
--  * private.team_push_kick asks the app to send phone pushes for new
--    notifications (pg_net + two vault secrets); without them it does nothing.
-- =========================================================

-- ---------- Columns ----------
alter table public.cover_requests
  add column note text check (char_length(note) <= 300),
  add column wave int not null default 0,
  add column roster_before jsonb,
  add column decided_at timestamptz,
  add column cancel_note text check (char_length(cancel_note) <= 300),
  add constraint cover_requests_role_skill_format check (role_skill ~ '^[a-z][a-z0-9_]*$');
create index on public.cover_requests (status) where status in ('open', 'escalated');
create index on public.cover_requests (filled_by_staff_id);
create index on public.cover_requests (requested_by);

-- Later waves wait with no sent_at.
alter table public.cover_offers alter column sent_at drop not null;
alter table public.cover_offers alter column sent_at drop default;
create index on public.cover_offers (outlet_id);

-- One live overtime entry per cover request.
create unique index overtime_entries_one_per_cover on public.overtime_entries (cover_request_id)
  where cover_request_id is not null and status <> 'cancelled';
create index on public.overtime_entries (status) where status = 'planned';

-- Cover requests change only through the functions below.
drop policy cover_requests_write on public.cover_requests;
revoke insert, update, delete on public.cover_requests from authenticated;

-- Pay columns are left out for everyone; pay viewers use team_cover_pay.
revoke select on public.cover_offers, public.overtime_entries from authenticated;
grant select (id, cover_request_id, staff_id, outlet_id, wave, sent_at, responded_at, response,
              chose_comp_off, selected)
  on public.cover_offers to authenticated;
grant select (id, staff_id, outlet_id, business_date, cover_request_id, planned_minutes, actual_minutes,
              multiplier_bps, comp_off, status, payroll_run_id, created_at)
  on public.overtime_entries to authenticated;

-- ---------- Points (no money; shown on the staff phone) ----------
create table public.staff_points (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  points int not null check (points <> 0),
  reason text not null check (reason in ('cover', 'adjustment')),
  ref_id uuid,
  note text check (char_length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index staff_points_once on public.staff_points (reason, ref_id) where ref_id is not null;
create index on public.staff_points (staff_id);
create index on public.staff_points (outlet_id);
create index on public.staff_points (created_by);
alter table public.staff_points enable row level security;
revoke all on public.staff_points from anon, authenticated;
grant select on public.staff_points to authenticated;
create policy staff_points_select on public.staff_points for select to authenticated
  using (private.team_can_read(outlet_id, staff_id));
create trigger staff_points_fill_outlet before insert or update of staff_id on public.staff_points
  for each row execute function private.fill_outlet_from_staff();
create trigger staff_points_audit after insert or update or delete on public.staff_points
  for each row execute function private.audit_row();
create trigger cover_requests_audit after insert or update or delete on public.cover_requests
  for each row execute function private.audit_row();

-- ---------- Fitting a slot into someone's day ----------
-- Same rules as addSlot() in lib/team/engines/eligibility.ts: fold any
-- extension into the last segment, add the slot (read as after midnight
-- when the shift runs past midnight and the slot falls in that tail),
-- merge touching segments. Null when it overlaps or won't fit 3 segments
-- within 24 hours.
create or replace function private.team_roster_with_slot(p_segments jsonb, p_extended time, p_start time, p_end time)
returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_seg jsonb;
  v_starts int[] := '{}';
  v_ends int[] := '{}';
  v_s int;
  v_e int;
  v_prev int := -1;
  v_n int;
  v_ext int;
  v_ss int := extract(hour from p_start)::int * 60 + extract(minute from p_start)::int;
  v_se int := extract(hour from p_end)::int * 60 + extract(minute from p_end)::int;
  v_os int[] := '{}';
  v_oe int[] := '{}';
  v_k int := 0;
  v_out jsonb := '[]'::jsonb;
  r record;
begin
  if p_start is null or p_end is null or v_se <= v_ss then return null; end if;
  if p_segments is not null and jsonb_typeof(p_segments) = 'array' then
    for v_seg in select e.value from jsonb_array_elements(p_segments) with ordinality as e(value, n) order by e.n loop
      v_s := split_part(v_seg ->> 'start', ':', 1)::int * 60 + split_part(v_seg ->> 'start', ':', 2)::int;
      v_e := split_part(v_seg ->> 'end', ':', 1)::int * 60 + split_part(v_seg ->> 'end', ':', 2)::int;
      if v_e <= v_s then v_e := v_e + 1440; end if;
      while v_s < v_prev loop
        v_s := v_s + 1440;
        v_e := v_e + 1440;
      end loop;
      v_starts := v_starts || v_s;
      v_ends := v_ends || v_e;
      v_prev := v_e;
    end loop;
  end if;
  v_n := coalesce(array_length(v_starts, 1), 0);
  if v_n > 0 and p_extended is not null then
    v_ext := extract(hour from p_extended)::int * 60 + extract(minute from p_extended)::int;
    while v_ext < v_starts[v_n] loop v_ext := v_ext + 1440; end loop;
    v_ends[v_n] := greatest(v_ends[v_n], v_ext);
  end if;
  if v_n > 0 and v_ends[v_n] > 1440 and v_ss + 1440 >= v_starts[1] then
    v_ss := v_ss + 1440;
    v_se := v_se + 1440;
  end if;

  for r in
    select x.s, x.e from (
      select unnest(v_starts) as s, unnest(v_ends) as e
      union all select v_ss, v_se
    ) x order by x.s
  loop
    if v_k > 0 and r.s < v_oe[v_k] then
      return null;                         -- overlaps
    elsif v_k > 0 and r.s = v_oe[v_k] then
      v_oe[v_k] := r.e;                    -- touching: one segment
    else
      v_k := v_k + 1;
      v_os[v_k] := r.s;
      v_oe[v_k] := r.e;
    end if;
  end loop;
  if v_k > 3 or v_oe[v_k] - v_os[1] > 1440 then return null; end if;
  for i in 1 .. v_k loop
    v_out := v_out || jsonb_build_object(
      'start', lpad(((v_os[i] % 1440) / 60)::text, 2, '0') || ':' || lpad((v_os[i] % 60)::text, 2, '0'),
      'end', lpad(((v_oe[i] % 1440) / 60)::text, 2, '0') || ':' || lpad((v_oe[i] % 60)::text, 2, '0'));
  end loop;
  if not private.team_valid_segments(v_out) then return null; end if;
  return v_out;
end
$$;

-- Can this person take this slot? Null = yes, else the reason.
create or replace function private.team_cover_blocker(p_staff uuid, p_outlet uuid, p_date date, p_skill text, p_start time, p_end time)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_roster public.roster_entries%rowtype;
begin
  if not exists (select 1 from public.staff s
                   left join public.staff_profiles sp on sp.staff_id = s.id
                  where s.id = p_staff and s.outlet_id = p_outlet and s.active
                    and coalesce(sp.employment_status, 'active') in ('active', 'on_notice')) then
    return 'not_staff';
  end if;
  if not exists (select 1 from public.staff_skills sk where sk.staff_id = p_staff and sk.skill = p_skill) then
    return 'no_skill';
  end if;
  if exists (select 1 from public.leave_requests lr
              where lr.staff_id = p_staff and lr.status = 'approved' and p_date between lr.from_date and lr.to_date) then
    return 'on_leave';
  end if;
  if exists (select 1 from public.staff_availability sa
              where sa.staff_id = p_staff and sa.business_date = p_date and not sa.available) then
    return 'unavailable';
  end if;
  select * into v_roster from public.roster_entries re where re.staff_id = p_staff and re.business_date = p_date;
  if found and v_roster.kind = 'work'
     and private.team_roster_with_slot(v_roster.segments, v_roster.extended_until, p_start, p_end) is null then
    return 'busy';
  end if;
  return null;
end
$$;

-- ---------- Overtime pay ----------
-- Unrounded paise per hour on that date; null when no salary is on file.
create or replace function private.team_ot_hourly(p_staff uuid, p_date date)
returns numeric
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_outlet uuid := private.staff_outlet(p_staff);
  v_ss public.salary_structures%rowtype;
  v_std int;
  v_days int;
  v_wages numeric;
  v_month date := date_trunc('month', p_date)::date;
begin
  select * into v_ss from public.salary_structures ss
   where ss.staff_id = p_staff and ss.effective_from <= p_date
   order by ss.effective_from desc limit 1;
  if not found then return null; end if;
  v_std := greatest(private.team_setting_int(v_outlet, 'hours.standard_shift_minutes', 480), 60);
  if v_ss.wage_type = 'daily' then
    return v_ss.daily_rate_paise::numeric * 60 / v_std;
  end if;
  v_wages := v_ss.basic_paise + v_ss.da_paise;
  if private.team_setting_text(v_outlet, 'cover.ot_rate_basis', 'basic_da') = 'gross' then
    v_wages := v_wages + v_ss.hra_paise
      + coalesce((select sum((a ->> 'paise')::bigint) from jsonb_array_elements(v_ss.other_allowances) a), 0)
      + coalesce((select sum((a ->> 'paise')::bigint) from jsonb_array_elements(v_ss.fixed_incentives) a), 0);
  end if;
  v_days := case private.team_setting_text(v_outlet, 'hours.working_days_basis', 'fixed_26')
    when 'calendar_days' then extract(day from (v_month + interval '1 month' - interval '1 day'))::int
    when 'rostered_days' then (select count(*)::int from public.roster_entries re
                                where re.staff_id = p_staff and re.kind = 'work'
                                  and re.business_date >= v_month and re.business_date < (v_month + interval '1 month')::date)
    else 26
  end;
  if coalesce(v_days, 0) <= 0 then v_days := 26; end if;
  return v_wages * 60 / (v_days * v_std);
end
$$;

create or replace function private.team_ot_amount(p_staff uuid, p_date date, p_minutes int, p_multiplier_bps int)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select round(private.team_ot_hourly(p_staff, p_date) * p_minutes / 60 * p_multiplier_bps / 10000)::bigint
$$;

-- ---------- Waves ----------
-- Send the next wave, or alert the managers when nobody is left.
create or replace function private.team_cover_release(p_request uuid, p_now timestamptz default now())
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.cover_requests%rowtype;
  v_next int;
  v_expiry int;
  v_skill_label text;
  o record;
begin
  select * into v_req from public.cover_requests cr where cr.id = p_request for update;
  if not found or v_req.status <> 'open' then return 'closed'; end if;

  -- Close what's still unanswered in the current wave.
  update public.cover_offers co set response = 'expired', responded_at = p_now
   where co.cover_request_id = p_request and co.sent_at is not null and co.response is null;

  -- Manager-pick: once someone has said yes, wait for the manager instead.
  if v_req.mode = 'manager_pick' and exists (
       select 1 from public.cover_offers co where co.cover_request_id = p_request and co.response = 'accepted') then
    update public.cover_requests cr set offer_expires_at = null where cr.id = p_request;
    return 'waiting_for_manager';
  end if;

  select min(co.wave) into v_next from public.cover_offers co
   where co.cover_request_id = p_request and co.sent_at is null;
  if v_next is null then
    update public.cover_requests cr
       set status = 'escalated', escalation_stage = 'manager', offer_expires_at = null
     where cr.id = p_request;
    perform private.team_notify_managers(v_req.outlet_id, 'cover_unfilled',
      jsonb_build_object('request_id', p_request, 'date', v_req.business_date, 'skill', v_req.role_skill,
                         'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
      'cover_unfilled:' || p_request);
    return 'escalated';
  end if;

  v_expiry := greatest(private.team_setting_int(v_req.outlet_id, 'cover.offer_expiry_minutes', 30), 1);
  update public.cover_requests cr
     set wave = v_next, offer_expires_at = p_now + make_interval(mins => v_expiry)
   where cr.id = p_request;
  for o in
    update public.cover_offers co set sent_at = p_now
     where co.cover_request_id = p_request and co.wave = v_next and co.sent_at is null
    returning co.id, co.staff_id, co.offered_ot_paise
  loop
    perform private.team_notify_staff(o.staff_id, 'cover_offer',
      jsonb_build_object('request_id', p_request, 'offer_id', o.id, 'date', v_req.business_date,
                         'skill', v_req.role_skill, 'start', to_char(v_req.slot_start, 'HH24:MI'),
                         'end', to_char(v_req.slot_end, 'HH24:MI'), 'amount_paise', o.offered_ot_paise,
                         'points', private.team_setting_int(v_req.outlet_id, 'cover.points_per_cover', 20),
                         'expires_at', p_now + make_interval(mins => v_expiry)),
      'cover_offer:' || o.id);
  end loop;
  return 'sent';
end
$$;

-- ---------- Award ----------
create or replace function private.team_cover_award(p_request uuid, p_staff uuid, p_comp_off boolean, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.cover_requests%rowtype;
  v_roster public.roster_entries%rowtype;
  v_has boolean;
  v_before jsonb;
  v_segments jsonb;
  v_minutes int;
  v_mult int;
  v_hourly numeric;
  v_blocker text;
  v_slot jsonb;
  v_name text;
  o record;
begin
  select * into v_req from public.cover_requests cr where cr.id = p_request for update;
  if not found or v_req.status not in ('open', 'escalated') then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  v_blocker := private.team_cover_blocker(p_staff, v_req.outlet_id, v_req.business_date, v_req.role_skill,
                                          v_req.slot_start, v_req.slot_end);
  if v_blocker is not null then
    return jsonb_build_object('ok', false, 'reason', v_blocker);
  end if;
  if private.team_setting_bool(v_req.outlet_id, 'cover.comp_off_instead_of_pay', false) then
    p_comp_off := true;
  elsif not private.team_setting_bool(v_req.outlet_id, 'cover.staff_may_choose_comp_off', true) then
    p_comp_off := false;
  end if;

  -- Roster: extend the shift, add a segment, or make it a working day.
  v_slot := jsonb_build_array(jsonb_build_object('start', to_char(v_req.slot_start, 'HH24:MI'),
                                                 'end', to_char(v_req.slot_end, 'HH24:MI')));
  select * into v_roster from public.roster_entries re
   where re.staff_id = p_staff and re.business_date = v_req.business_date for update;
  v_has := found;
  v_before := case when v_has then to_jsonb(v_roster) end;
  if not v_has then
    insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments, role_skill, source)
    values (v_req.outlet_id, p_staff, v_req.business_date, 'work', v_slot, v_req.role_skill, 'cover');
  elsif v_roster.kind = 'weekly_off' then
    update public.roster_entries re
       set kind = 'work', segments = v_slot, shift_template_id = null, extended_until = null,
           role_skill = v_req.role_skill, source = 'cover'
     where re.id = v_roster.id;
  else
    v_segments := private.team_roster_with_slot(v_roster.segments, v_roster.extended_until, v_req.slot_start, v_req.slot_end);
    update public.roster_entries re
       set segments = v_segments, extended_until = null
     where re.id = v_roster.id;
  end if;

  v_minutes := ((extract(epoch from v_req.slot_end - v_req.slot_start)) / 60)::int;
  v_mult := private.team_setting_int(v_req.outlet_id, 'cover.ot_multiplier_bps', 20000);
  v_hourly := private.team_ot_hourly(p_staff, v_req.business_date);
  insert into public.overtime_entries
    (staff_id, outlet_id, business_date, cover_request_id, planned_minutes, hourly_rate_paise, multiplier_bps,
     amount_paise, comp_off, status)
  values (p_staff, v_req.outlet_id, v_req.business_date, p_request, v_minutes, round(v_hourly)::bigint, v_mult,
          case when p_comp_off then 0 else round(v_hourly * v_minutes / 60 * v_mult / 10000)::bigint end,
          p_comp_off, 'planned');

  update public.cover_requests cr
     set status = 'filled', filled_by_staff_id = p_staff, decided_at = p_now, roster_before = v_before,
         offer_expires_at = null
   where cr.id = p_request;

  -- Offers: the chosen one is selected; everyone else still waiting is told it's gone.
  insert into public.cover_offers (cover_request_id, staff_id, outlet_id, wave, sent_at, responded_at, response, chose_comp_off, selected)
  values (p_request, p_staff, v_req.outlet_id, 0, p_now, p_now, 'accepted', p_comp_off, true)
  on conflict (cover_request_id, staff_id) do update
     set selected = true, chose_comp_off = excluded.chose_comp_off, response = 'accepted',
         responded_at = coalesce(public.cover_offers.responded_at, excluded.responded_at),
         sent_at = coalesce(public.cover_offers.sent_at, excluded.sent_at);
  for o in
    update public.cover_offers co
       set response = case when co.response is null and co.sent_at is not null then 'expired' else co.response end,
           responded_at = coalesce(co.responded_at, case when co.sent_at is not null then p_now end)
     where co.cover_request_id = p_request and co.staff_id <> p_staff and co.sent_at is not null
       and (co.response is null or co.response = 'accepted')
    returning co.staff_id
  loop
    perform private.team_notify_staff(o.staff_id, 'cover_taken',
      jsonb_build_object('request_id', p_request, 'date', v_req.business_date,
                         'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
      'cover_taken:' || p_request);
  end loop;

  select s.name into v_name from public.staff s where s.id = p_staff;
  perform private.team_notify_staff(p_staff, 'cover_awarded',
    jsonb_build_object('request_id', p_request, 'date', v_req.business_date, 'skill', v_req.role_skill,
                       'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI'),
                       'comp_off', p_comp_off),
    'cover_awarded:' || p_request);
  perform private.team_notify_managers(v_req.outlet_id, 'cover_filled',
    jsonb_build_object('request_id', p_request, 'staff_id', p_staff, 'name', v_name, 'date', v_req.business_date,
                       'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
    'cover_filled:' || p_request);
  return jsonb_build_object('ok', true, 'staff_id', p_staff, 'comp_off', p_comp_off);
end
$$;

-- ---------- Manager: ask for cover ----------
-- p_candidates: staff ids in the order the screen worked out (fair rotation).
create or replace function public.team_create_cover(
  p_outlet uuid, p_date date, p_skill text, p_start time, p_end time,
  p_candidates uuid[], p_mode text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_id uuid;
  v_batch int;
  v_mult int;
  v_comp_only boolean;
  v_rank int := 0;
  v_skipped int := 0;
  v_staff uuid;
  v_minutes int;
begin
  if p_outlet is null or not private.can_manage_outlet(p_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 60
     or p_start is null or p_end is null or p_end <= p_start
     or (p_date = v_today and (p_date + p_start) at time zone 'Asia/Kolkata' <= now()) then
    return jsonb_build_object('ok', false, 'reason', 'bad_slot');
  end if;
  if p_skill is null or p_skill !~ '^[a-z][a-z0-9_]*$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_skill');
  end if;
  p_mode := coalesce(p_mode, private.team_setting_text(p_outlet, 'cover.award_mode', 'first_accept'));
  if p_mode not in ('first_accept', 'manager_pick') then
    return jsonb_build_object('ok', false, 'reason', 'bad_mode');
  end if;
  p_note := nullif(btrim(p_note), '');
  if char_length(p_note) > 300 then
    return jsonb_build_object('ok', false, 'reason', 'bad_note');
  end if;
  if exists (select 1 from public.cover_requests cr
              where cr.outlet_id = p_outlet and cr.business_date = p_date and cr.role_skill = p_skill
                and cr.status in ('open', 'escalated')
                and cr.slot_start < p_end and cr.slot_end > p_start) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  insert into public.cover_requests (outlet_id, business_date, role_skill, slot_start, slot_end, mode, note)
  values (p_outlet, p_date, p_skill, p_start, p_end, p_mode, p_note)
  returning id into v_id;

  v_batch := greatest(private.team_setting_int(p_outlet, 'cover.offer_batch_size', 3), 1);
  v_mult := private.team_setting_int(p_outlet, 'cover.ot_multiplier_bps', 20000);
  v_comp_only := private.team_setting_bool(p_outlet, 'cover.comp_off_instead_of_pay', false);
  v_minutes := ((extract(epoch from p_end - p_start)) / 60)::int;
  foreach v_staff in array coalesce(p_candidates, '{}'::uuid[]) loop
    if private.team_cover_blocker(v_staff, p_outlet, p_date, p_skill, p_start, p_end) is not null
       or exists (select 1 from public.cover_offers co where co.cover_request_id = v_id and co.staff_id = v_staff) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.cover_offers (cover_request_id, staff_id, outlet_id, wave, offered_ot_paise, sent_at)
    values (v_id, v_staff, p_outlet, v_rank / v_batch + 1,
            case when v_comp_only then null else private.team_ot_amount(v_staff, p_date, v_minutes, v_mult) end,
            null);
    v_rank := v_rank + 1;
  end loop;

  return jsonb_build_object('ok', true, 'request_id', v_id, 'offers', v_rank, 'skipped', v_skipped,
                            'state', private.team_cover_release(v_id));
end
$$;

-- ---------- Staff: answer an offer ----------
create or replace function public.team_respond_cover(p_offer uuid, p_accept boolean, p_comp_off boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid := private.my_staff_id();
  v_offer public.cover_offers%rowtype;
  v_req public.cover_requests%rowtype;
  v_name text;
  v_result jsonb;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  select * into v_offer from public.cover_offers co where co.id = p_offer and co.staff_id = v_staff;
  if not found or v_offer.sent_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_req from public.cover_requests cr where cr.id = v_offer.cover_request_id for update;
  if v_req.status not in ('open', 'escalated') then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  if v_offer.response is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_answered');
  end if;
  if (v_req.business_date + v_req.slot_start) at time zone 'Asia/Kolkata' <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if not coalesce(p_accept, false) then
    update public.cover_offers co set response = 'declined', responded_at = now() where co.id = p_offer;
    -- Everyone in this wave said no: don't wait for the timer.
    if v_req.status = 'open' and not exists (
         select 1 from public.cover_offers co
          where co.cover_request_id = v_req.id and co.wave = v_req.wave
            and (co.response is null or co.response = 'accepted')) then
      perform private.team_cover_release(v_req.id);
    end if;
    return jsonb_build_object('ok', true, 'state', 'declined');
  end if;

  if v_req.mode = 'first_accept' then
    v_result := private.team_cover_award(v_req.id, v_staff, coalesce(p_comp_off, false));
    if not (v_result ->> 'ok')::boolean then
      return v_result;
    end if;
    return jsonb_build_object('ok', true, 'state', 'awarded', 'comp_off', v_result -> 'comp_off');
  end if;

  if private.team_cover_blocker(v_staff, v_req.outlet_id, v_req.business_date, v_req.role_skill,
                                v_req.slot_start, v_req.slot_end) is not null then
    return jsonb_build_object('ok', false, 'reason', 'busy');
  end if;
  update public.cover_offers co
     set response = 'accepted', responded_at = now(), chose_comp_off = coalesce(p_comp_off, false)
   where co.id = p_offer;
  select s.name into v_name from public.staff s where s.id = v_staff;
  perform private.team_notify_managers(v_req.outlet_id, 'cover_accepted',
    jsonb_build_object('request_id', v_req.id, 'staff_id', v_staff, 'name', v_name, 'date', v_req.business_date,
                       'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
    'cover_accepted:' || p_offer);
  return jsonb_build_object('ok', true, 'state', 'waiting_for_manager');
end
$$;

-- ---------- Manager: pick someone, or cancel ----------
create or replace function public.team_award_cover(p_request uuid, p_staff uuid, p_comp_off boolean default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_choice boolean;
begin
  select cr.outlet_id into v_outlet from public.cover_requests cr where cr.id = p_request;
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  -- Keep the person's own choice if they accepted with one.
  select co.chose_comp_off into v_choice from public.cover_offers co
   where co.cover_request_id = p_request and co.staff_id = p_staff and co.response = 'accepted';
  return private.team_cover_award(p_request, p_staff, coalesce(p_comp_off, v_choice, false));
end
$$;

create or replace function public.team_cancel_cover(p_request uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.cover_requests%rowtype;
  v_before jsonb;
  o record;
begin
  select * into v_req from public.cover_requests cr where cr.id = p_request for update;
  if not found or not private.can_manage_outlet(v_req.outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_req.status not in ('open', 'escalated', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  p_note := nullif(btrim(p_note), '');
  if char_length(p_note) > 300 then
    return jsonb_build_object('ok', false, 'reason', 'bad_note');
  end if;

  if v_req.status = 'filled' then
    if p_note is null then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
    if exists (select 1 from public.overtime_entries ot
                where ot.cover_request_id = p_request and ot.status = 'worked') then
      return jsonb_build_object('ok', false, 'reason', 'already_worked');
    end if;
    update public.overtime_entries ot set status = 'cancelled'
     where ot.cover_request_id = p_request and ot.status = 'planned';
    -- Put the roster back the way it was.
    v_before := v_req.roster_before;
    if v_before is null then
      delete from public.roster_entries re
       where re.staff_id = v_req.filled_by_staff_id and re.business_date = v_req.business_date;
    else
      update public.roster_entries re
         set kind = v_before ->> 'kind',
             segments = v_before -> 'segments',
             extended_until = (v_before ->> 'extended_until')::time,
             shift_template_id = (v_before ->> 'shift_template_id')::uuid,
             role_skill = v_before ->> 'role_skill',
             source = v_before ->> 'source'
       where re.staff_id = v_req.filled_by_staff_id and re.business_date = v_req.business_date;
    end if;
    perform private.team_notify_staff(v_req.filled_by_staff_id, 'cover_cancelled',
      jsonb_build_object('request_id', p_request, 'date', v_req.business_date,
                         'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
      'cover_cancelled:' || p_request);
  else
    for o in
      update public.cover_offers co set response = 'expired', responded_at = now()
       where co.cover_request_id = p_request and co.sent_at is not null and co.response is null
      returning co.staff_id
    loop
      perform private.team_notify_staff(o.staff_id, 'cover_cancelled',
        jsonb_build_object('request_id', p_request, 'date', v_req.business_date,
                           'start', to_char(v_req.slot_start, 'HH24:MI'), 'end', to_char(v_req.slot_end, 'HH24:MI')),
        'cover_cancelled:' || p_request);
    end loop;
  end if;

  update public.cover_requests cr
     set status = 'cancelled', cancel_note = p_note, offer_expires_at = null, decided_at = now()
   where cr.id = p_request;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Reading ----------
-- A staff member's offers (last 14 days and coming up) and points.
create or replace function public.team_my_cover_offers()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with me as (select private.my_staff_id() as id)
  select case when me.id is null then null else jsonb_build_object(
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'offer_id', co.id, 'request_id', cr.id, 'date', cr.business_date, 'skill', cr.role_skill,
               'start', to_char(cr.slot_start, 'HH24:MI'), 'end', to_char(cr.slot_end, 'HH24:MI'),
               'minutes', (extract(epoch from cr.slot_end - cr.slot_start) / 60)::int,
               'amount_paise', co.offered_ot_paise, 'response', co.response, 'chose_comp_off', co.chose_comp_off,
               'selected', co.selected, 'mode', cr.mode,
               'expires_at', case when cr.wave = co.wave then cr.offer_expires_at end,
               'state', case
                 when co.selected then 'yours'
                 when cr.status = 'cancelled' then 'cancelled'
                 when co.response = 'accepted' and cr.status in ('open', 'escalated') then 'waiting'
                 when co.response is null and cr.status in ('open', 'escalated')
                      and (cr.business_date + cr.slot_start) at time zone 'Asia/Kolkata' > now() then 'open'
                 when co.response = 'declined' then 'declined'
                 else 'closed' end,
               'note', cr.note)
             order by cr.business_date desc, cr.slot_start desc)
        from public.cover_offers co
        join public.cover_requests cr on cr.id = co.cover_request_id
       where co.staff_id = me.id and co.sent_at is not null
         and cr.business_date >= (now() at time zone 'Asia/Kolkata')::date - 14), '[]'::jsonb),
    'points', coalesce((select sum(p.points)::int from public.staff_points p where p.staff_id = me.id), 0),
    'points_per_cover', private.team_setting_int(s.outlet_id, 'cover.points_per_cover', 20),
    'can_choose_comp_off', private.team_setting_bool(s.outlet_id, 'cover.staff_may_choose_comp_off', true)
                           and not private.team_setting_bool(s.outlet_id, 'cover.comp_off_instead_of_pay', false),
    'comp_off_only', private.team_setting_bool(s.outlet_id, 'cover.comp_off_instead_of_pay', false)) end
    from me left join public.staff s on s.id = me.id
$$;

-- Overtime amounts for people who may see pay.
create or replace function public.team_cover_pay(p_outlet uuid, p_from date, p_to date)
returns table (overtime_id uuid, cover_request_id uuid, staff_id uuid, hourly_rate_paise bigint, amount_paise bigint)
language sql stable security definer set search_path = ''
as $$
  select ot.id, ot.cover_request_id, ot.staff_id, ot.hourly_rate_paise, ot.amount_paise
    from public.overtime_entries ot
   where ot.outlet_id = p_outlet and ot.business_date between p_from and p_to
     and private.can_see_pay(p_outlet)
$$;

-- ---------- Settling finished cover ----------
-- Time actually worked on a day, from check-ins and check-outs.
create or replace function private.team_worked_range(p_staff uuid, p_date date)
returns tstzmultirange
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_open timestamptz;
  v_out tstzmultirange := '{}'::tstzmultirange;
  e record;
begin
  for e in
    select ae.kind, ae.at from public.attendance_events ae
     where ae.staff_id = p_staff and ae.business_date = p_date and ae.status <> 'void'
     order by ae.at, ae.kind
  loop
    if e.kind = 'in' then
      v_open := coalesce(v_open, e.at);
    else
      if v_open is not null and e.at > v_open then
        v_out := v_out + tstzmultirange(tstzrange(v_open, e.at, '[)'));
      end if;
      v_open := null;
    end if;
  end loop;
  return v_out;
end
$$;

-- ---------- Phone push ----------
-- Asks the app (POST {team_push_flush_url}) to send pushes for new
-- notifications. Needs pg_net and the vault secrets team_push_flush_url and
-- team_push_flush_secret; without them nothing happens.
create or replace function private.team_push_kick()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.notifications n
                  where n.push_sent_at is null and n.created_at > now() - interval '10 minutes') then
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'team_push_flush_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'team_push_flush_secret';
  if v_url is null or v_secret is null then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, '{}'::jsonb,
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
  return true;
exception when others then
  raise warning 'team_push_kick: %', sqlerrm;
  return false;
end
$$;

-- ---------- Every minute ----------
create or replace function private.team_cover_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_waves int := 0;
  v_expired int := 0;
  v_settled int := 0;
  v_slot tstzrange;
  v_day public.attendance_days%rowtype;
  v_actual int;
  v_step int;
  v_mode text;
  v_type uuid;
  v_points int;
  r record;
begin
  -- 1. Slot has started and nobody took it: expired.
  for r in
    select cr.id, cr.outlet_id, cr.business_date, cr.role_skill, cr.slot_start, cr.slot_end from public.cover_requests cr
     where cr.status in ('open', 'escalated')
       and (cr.business_date + cr.slot_start) at time zone 'Asia/Kolkata' <= p_now
  loop
    update public.cover_offers co set response = 'expired', responded_at = p_now
     where co.cover_request_id = r.id and co.sent_at is not null and co.response is null;
    update public.cover_requests cr set status = 'expired', offer_expires_at = null where cr.id = r.id;
    v_expired := v_expired + 1;
  end loop;

  -- 2. A wave's time is up: the next wave (or the managers).
  for r in
    select cr.id from public.cover_requests cr
     where cr.status = 'open' and cr.offer_expires_at is not null and cr.offer_expires_at <= p_now
  loop
    perform private.team_cover_release(r.id, p_now);
    v_waves := v_waves + 1;
  end loop;

  -- 3. Finished cover: pay or comp-off for the minutes worked inside the slot.
  for r in
    select ot.id, ot.staff_id, ot.outlet_id, ot.business_date, ot.comp_off, ot.multiplier_bps,
           cr.slot_start, cr.slot_end
      from public.overtime_entries ot
      join public.cover_requests cr on cr.id = ot.cover_request_id
     where ot.status = 'planned' and ot.business_date between v_today - 7 and v_today
  loop
    v_slot := tstzrange((r.business_date + r.slot_start) at time zone 'Asia/Kolkata',
                        (r.business_date + r.slot_end) at time zone 'Asia/Kolkata', '[)');
    continue when upper(v_slot)
      + make_interval(mins => private.team_setting_int(r.outlet_id, 'attendance.auto_close_after_minutes', 120)) > p_now;
    select * into v_day from public.attendance_days ad where ad.staff_id = r.staff_id and ad.business_date = r.business_date;
    continue when found and v_day.status = 'needs_confirmation';   -- wait for the manager

    v_actual := 0;
    if found and v_day.status in ('present', 'half_day') then
      v_actual := private.team_range_minutes(private.team_worked_range(r.staff_id, r.business_date)
                                             * tstzmultirange(v_slot));
      v_step := greatest(private.team_setting_int(r.outlet_id, 'attendance.rounding_minutes', 15), 1);
      v_mode := private.team_setting_text(r.outlet_id, 'attendance.rounding_mode', 'nearest');
      v_actual := (case v_mode
                     when 'down' then floor(v_actual::numeric / v_step)
                     when 'up' then ceil(v_actual::numeric / v_step)
                     else round(v_actual::numeric / v_step)
                   end * v_step)::int;
      v_actual := least(v_actual, (extract(epoch from upper(v_slot) - lower(v_slot)) / 60)::int);
    end if;

    if v_actual <= 0 then
      update public.overtime_entries ot set status = 'cancelled', actual_minutes = 0 where ot.id = r.id;
    else
      update public.overtime_entries ot
         set status = 'worked', actual_minutes = v_actual,
             amount_paise = case when r.comp_off then 0
                                 else private.team_ot_amount(r.staff_id, r.business_date, v_actual, r.multiplier_bps) end
       where ot.id = r.id;
      if r.comp_off then
        select lt.id into v_type from public.leave_types lt where lt.outlet_id = r.outlet_id and lt.code = 'comp_off';
        if v_type is not null then
          insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason, ref_id, note, created_by)
          values (r.staff_id, v_type, v_actual, 'comp_off', r.id, 'Cover worked', null);
        end if;
      end if;
      v_points := private.team_setting_int(r.outlet_id, 'cover.points_per_cover', 20);
      if v_points > 0 then
        insert into public.staff_points (staff_id, points, reason, ref_id, note, created_by)
        values (r.staff_id, v_points, 'cover', r.id, 'Cover worked', null)
        on conflict (reason, ref_id) where ref_id is not null do nothing;
      end if;
    end if;
    v_settled := v_settled + 1;
  end loop;

  perform private.team_push_kick();
  return jsonb_build_object('waves', v_waves, 'expired', v_expired, 'settled', v_settled);
end
$$;

-- ---------- Privileges ----------
revoke execute on function private.team_roster_with_slot(jsonb, time, time, time) from public, anon, authenticated;
revoke execute on function private.team_cover_blocker(uuid, uuid, date, text, time, time) from public, anon, authenticated;
revoke execute on function private.team_ot_hourly(uuid, date) from public, anon, authenticated;
revoke execute on function private.team_ot_amount(uuid, date, int, int) from public, anon, authenticated;
revoke execute on function private.team_cover_release(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.team_cover_award(uuid, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke execute on function private.team_worked_range(uuid, date) from public, anon, authenticated;
revoke execute on function private.team_push_kick() from public, anon, authenticated;
revoke execute on function private.team_cover_sweep(timestamptz) from public, anon, authenticated;

revoke execute on function public.team_create_cover(uuid, date, text, time, time, uuid[], text, text) from public, anon;
revoke execute on function public.team_respond_cover(uuid, boolean, boolean) from public, anon;
revoke execute on function public.team_award_cover(uuid, uuid, boolean) from public, anon;
revoke execute on function public.team_cancel_cover(uuid, text) from public, anon;
revoke execute on function public.team_my_cover_offers() from public, anon;
revoke execute on function public.team_cover_pay(uuid, date, date) from public, anon;
grant execute on function public.team_create_cover(uuid, date, text, time, time, uuid[], text, text) to authenticated;
grant execute on function public.team_respond_cover(uuid, boolean, boolean) to authenticated;
grant execute on function public.team_award_cover(uuid, uuid, boolean) to authenticated;
grant execute on function public.team_cancel_cover(uuid, text) to authenticated;
grant execute on function public.team_my_cover_offers() to authenticated;
grant execute on function public.team_cover_pay(uuid, date, date) to authenticated;

-- ---------- Schedule: every minute ----------
-- pg_net lets team_push_kick call the app; Supabase ships it, the test database doesn't.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('team-cover-sweep', '* * * * *', 'select private.team_cover_sweep()');
  end if;
end
$$;

-- ---------- Audit log: pay rows only for pay viewers ----------
-- Overtime amounts (and salary, payroll, bank rows) are in the audit trail;
-- managers who can't see pay shouldn't read them there either.
drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.is_admin()
         or (outlet_id is not null and private.can_manage_outlet(outlet_id)
             and (table_name not in ('salary_structures', 'payroll_lines', 'payroll_adjustments',
                                     'staff_bank_accounts', 'overtime_entries')
                  or private.can_see_pay(outlet_id))));
