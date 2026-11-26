-- =========================================================
-- Daybook Team — Milestone 4: attendance
--
--  * public.team_device_today: the outlet tablet's list of today's people
--    (name, rostered times, checked in or not). Nothing else.
--  * public.team_check_in_out: tablet check-in/out with PIN and photo.
--    Uses the same PIN lockout as everything else. A check-out after
--    midnight closes the shift it belongs to.
--  * private.team_recompute_day: the one place a person's day is worked out
--    (present / absent / weekly off / needs confirmation, first in, last
--    out, late minutes, payable minutes). Payable time is only time inside
--    the rostered shift, minus an unpaid break, rounded per the outlet
--    setting — so attendance never creates overtime (cover does, in M6).
--  * private.team_attendance_sweep, every 5 minutes via pg_cron:
--      - closes forgotten check-outs at the rostered end (never later) once
--        attendance.auto_close_after_minutes have passed, marked
--        needs_confirmation for the manager;
--      - alerts managers about no-shows after attendance.no_show_alert_minutes;
--      - marks finished rostered days with no check-in as absent.
--  * Manager fixes (confirm / correct / add / void), all audited, note required.
--  * notifications.dedupe_key so an alert is sent once.
-- =========================================================

-- ---------- Settings helpers ----------
create or replace function private.team_setting_bool(p_outlet uuid, p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (os.value)::boolean from public.outlet_settings os
                    where os.outlet_id = p_outlet and os.key = p_key and jsonb_typeof(os.value) = 'boolean'),
                  p_default)
$$;

create or replace function private.team_setting_text(p_outlet uuid, p_key text, p_default text)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce((select os.value #>> '{}' from public.outlet_settings os
                    where os.outlet_id = p_outlet and os.key = p_key and jsonb_typeof(os.value) = 'string'),
                  p_default)
$$;

-- ---------- Notifications ----------
alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_key on public.notifications (recipient_profile_id, dedupe_key)
  where dedupe_key is not null;

-- Managers of the outlet plus owners of its organisation.
create or replace function private.team_outlet_managers(p_outlet uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
    join public.outlet_users ou on ou.profile_id = p.id
   where ou.outlet_id = p_outlet and p.role = 'manager'
  union
  select p.id from public.profiles p
    join public.outlets o on o.organization_id = p.organization_id
   where o.id = p_outlet and p.role = 'owner'
$$;

create or replace function private.team_notify_managers(p_outlet uuid, p_kind text, p_payload jsonb, p_dedupe text)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.notifications (recipient_profile_id, outlet_id, kind, payload, dedupe_key)
  select m, p_outlet, p_kind, p_payload, p_dedupe from private.team_outlet_managers(p_outlet) m
  on conflict (recipient_profile_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ---------- Shift time ranges ----------
-- Rostered segments on a business date as real timestamps (IST wall clock).
-- Same rules as segmentsToIntervals() + presence() in lib/team/engines.
create or replace function private.team_shift_range(p_date date, p_segments jsonb, p_extended time)
returns tstzmultirange
language plpgsql stable set search_path = ''
as $$
declare
  v_seg jsonb;
  v_starts int[] := '{}';
  v_ends int[] := '{}';
  v_start int;
  v_end int;
  v_prev_end int := -1;
  v_ext int;
  v_n int;
  v_out tstzmultirange := '{}'::tstzmultirange;
  v_base timestamp := p_date::timestamp;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) = 0 then
    return v_out;
  end if;
  for v_seg in select e.value from jsonb_array_elements(p_segments) with ordinality as e(value, n) order by e.n loop
    v_start := split_part(v_seg ->> 'start', ':', 1)::int * 60 + split_part(v_seg ->> 'start', ':', 2)::int;
    v_end := split_part(v_seg ->> 'end', ':', 1)::int * 60 + split_part(v_seg ->> 'end', ':', 2)::int;
    if v_end <= v_start then v_end := v_end + 1440; end if;
    while v_start < v_prev_end loop
      v_start := v_start + 1440;
      v_end := v_end + 1440;
    end loop;
    v_starts := v_starts || v_start;
    v_ends := v_ends || v_end;
    v_prev_end := v_end;
  end loop;
  v_n := array_length(v_starts, 1);
  if p_extended is not null then
    v_ext := extract(hour from p_extended)::int * 60 + extract(minute from p_extended)::int;
    while v_ext < v_starts[v_n] loop v_ext := v_ext + 1440; end loop;
    v_ends[v_n] := greatest(v_ends[v_n], v_ext);
  end if;
  for i in 1 .. v_n loop
    v_out := v_out + tstzmultirange(tstzrange(
      (v_base + make_interval(mins => v_starts[i])) at time zone 'Asia/Kolkata',
      (v_base + make_interval(mins => v_ends[i])) at time zone 'Asia/Kolkata', '[)'));
  end loop;
  return v_out;
end
$$;

create or replace function private.team_range_minutes(p tstzmultirange)
returns int
language sql immutable set search_path = ''
as $$
  select coalesce(floor(sum(extract(epoch from upper(r) - lower(r))) / 60), 0)::int from unnest(p) as r
$$;

-- ---------- Day summary ----------
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
    elsif v_rostered_work and upper(v_shift) <= p_now then
      v_status := 'absent_unapproved';
    else
      delete from public.attendance_days ad where ad.staff_id = p_staff and ad.business_date = p_date;
      return;
    end if;
  else
    v_status := case when v_needs then 'needs_confirmation' else 'present' end;
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
    (staff_id, outlet_id, business_date, status, first_in, last_out, late_minutes, payable_minutes, computed_at)
  values (p_staff, v_outlet, p_date, v_status, v_first_in, v_last_out, v_late, v_payable, p_now)
  on conflict (staff_id, business_date) do update
     set status = excluded.status, first_in = excluded.first_in, last_out = excluded.last_out,
         late_minutes = excluded.late_minutes, payable_minutes = excluded.payable_minutes,
         computed_at = excluded.computed_at
   where (ad.status, ad.first_in, ad.last_out, ad.late_minutes, ad.payable_minutes)
         is distinct from (excluded.status, excluded.first_in, excluded.last_out, excluded.late_minutes, excluded.payable_minutes);
end
$$;

-- A roster change re-works that day (if it has started).
create or replace function private.team_roster_recompute()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.business_date <= (now() at time zone 'Asia/Kolkata')::date then
    perform private.team_recompute_day(old.staff_id, old.business_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.business_date <= (now() at time zone 'Asia/Kolkata')::date then
    perform private.team_recompute_day(new.staff_id, new.business_date);
  end if;
  return null;
end
$$;
create trigger roster_entries_recompute after insert or update or delete on public.roster_entries
  for each row execute function private.team_roster_recompute();

-- ---------- Tablet ----------
create or replace function public.team_device_today(p_outlet uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not private.can_access_outlet(p_outlet) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'staff_id', s.id,
             'name', s.name,
             'roster_kind', re.kind,
             'segments', re.segments,
             'extended_until', to_char(re.extended_until, 'HH24:MI'),
             'state', case when last.kind = 'in' then 'in' when last.kind = 'out' and last.business_date = v_today then 'out' else 'none' end,
             'last_at', last.at) order by s.name)
      from public.staff s
      left join public.staff_profiles sp on sp.staff_id = s.id
      left join public.roster_entries re on re.staff_id = s.id and re.business_date = v_today
      left join lateral (
        select ae.kind, ae.at, ae.business_date from public.attendance_events ae
         where ae.staff_id = s.id and ae.status <> 'void' and ae.business_date >= v_today - 1
         order by ae.at desc limit 1) last on true
     where s.outlet_id = p_outlet and s.active
       and coalesce(sp.employment_status, 'active') not in ('exited', 'absconded')), '[]'::jsonb);
end
$$;

create or replace function public.team_check_in_out(
  p_outlet uuid, p_staff uuid, p_pin text, p_kind text, p_photo_path text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
  v_check jsonb;
  v_last_kind text;
  v_last_date date;
  v_date date;
  v_late int;
  v_name text;
begin
  if p_kind is null or p_kind not in ('in', 'out') then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if not private.can_access_outlet(p_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if exists (select 1 from public.staff_profiles sp
              where sp.staff_id = p_staff and sp.employment_status in ('exited', 'absconded')) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_staff');
  end if;

  v_check := private.verify_staff_pin(p_outlet, p_staff, p_pin, null);
  if (v_check ->> 'ok')::boolean is not true then
    return v_check;
  end if;

  if btrim(coalesce(p_photo_path, '')) = '' then
    if private.team_setting_bool(p_outlet, 'attendance.photo_required', true) then
      return jsonb_build_object('ok', false, 'reason', 'missing_photo');
    end if;
    p_photo_path := null;
  elsif not (p_photo_path like p_outlet::text || '/' || p_staff::text || '/%'
             and exists (select 1 from storage.objects o
                          where o.bucket_id = 'attendance-photos' and o.name = p_photo_path)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo');
  end if;

  select ae.kind, ae.business_date into v_last_kind, v_last_date
    from public.attendance_events ae
   where ae.staff_id = p_staff and ae.status <> 'void' and ae.business_date >= v_today - 1
   order by ae.at desc limit 1;

  if p_kind = 'in' then
    if v_last_kind = 'in' and v_last_date = v_today then
      return jsonb_build_object('ok', false, 'reason', 'already_in');
    end if;
    v_date := v_today;
  else
    if v_last_kind is distinct from 'in' then
      return jsonb_build_object('ok', false, 'reason', 'not_checked_in');
    end if;
    v_date := v_last_date;   -- a check-out after midnight closes yesterday's shift
  end if;

  insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, photo_path, source, status)
  values (p_outlet, p_staff, v_date, p_kind, v_now, p_photo_path, 'device', 'ok');
  perform private.team_recompute_day(p_staff, v_date, v_now);

  select ad.late_minutes into v_late from public.attendance_days ad
   where ad.staff_id = p_staff and ad.business_date = v_date;
  v_late := coalesce(v_late, 0);
  if p_kind = 'in' and v_late > 0 and private.team_setting_bool(p_outlet, 'attendance.late_alerts', true) then
    select s.name into v_name from public.staff s where s.id = p_staff;
    perform private.team_notify_managers(p_outlet, 'attendance_late',
      jsonb_build_object('staff_id', p_staff, 'name', v_name, 'date', v_date, 'late_minutes', v_late),
      'late:' || p_staff || ':' || v_date);
  end if;

  return jsonb_build_object('ok', true, 'kind', p_kind, 'at', v_now, 'business_date', v_date, 'late_minutes', v_late);
end
$$;

-- ---------- Manager fixes ----------
create or replace function private.team_event_guard(p_event uuid)
returns public.attendance_events
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.attendance_events%rowtype;
begin
  select * into v_event from public.attendance_events ae where ae.id = p_event for update;
  if not found or not private.can_manage_outlet(v_event.outlet_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return v_event;
end
$$;

-- Confirm an event as it is (p_at null), or correct its time (note needed).
create or replace function public.team_confirm_attendance_event(p_event uuid, p_at timestamptz default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.attendance_events%rowtype := private.team_event_guard(p_event);
begin
  if v_event.status = 'void' then
    return jsonb_build_object('ok', false, 'reason', 'void');
  end if;
  if p_at is null then
    update public.attendance_events set status = 'ok' where id = p_event;
  else
    if btrim(coalesce(p_note, '')) = '' then
      return jsonb_build_object('ok', false, 'reason', 'note_required');
    end if;
    if p_at < (v_event.business_date::timestamp at time zone 'Asia/Kolkata')
       or p_at > ((v_event.business_date + 2)::timestamp at time zone 'Asia/Kolkata') then
      return jsonb_build_object('ok', false, 'reason', 'bad_time');
    end if;
    update public.attendance_events set at = p_at, status = 'edited', note = btrim(p_note) where id = p_event;
  end if;
  perform private.team_recompute_day(v_event.staff_id, v_event.business_date);
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.team_void_attendance_event(p_event uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_event public.attendance_events%rowtype := private.team_event_guard(p_event);
begin
  if btrim(coalesce(p_note, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;
  update public.attendance_events set status = 'void', note = btrim(p_note) where id = p_event;
  perform private.team_recompute_day(v_event.staff_id, v_event.business_date);
  return jsonb_build_object('ok', true);
end
$$;

-- Add a missed check-in or check-out.
create or replace function public.team_add_attendance_event(
  p_staff uuid, p_date date, p_kind text, p_at timestamptz, p_note text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid := private.staff_outlet(p_staff);
begin
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('in', 'out') then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if btrim(coalesce(p_note, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;
  if p_at is null or p_at > now()
     or p_at < (p_date::timestamp at time zone 'Asia/Kolkata')
     or p_at > ((p_date + 2)::timestamp at time zone 'Asia/Kolkata') then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;
  insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, source, status, note)
  values (v_outlet, p_staff, p_date, p_kind, p_at, 'manager', 'edited', btrim(p_note));
  perform private.team_recompute_day(p_staff, p_date);
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Sweep (pg_cron, every 5 minutes) ----------
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

  -- 2. No-shows: shift started more than the alert minutes ago, not over, nobody checked in.
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
    v_alerts := v_alerts + private.team_notify_managers(r.outlet_id, 'attendance_no_show',
      jsonb_build_object('staff_id', r.staff_id, 'name', r.name, 'date', r.business_date,
                         'start', to_char(lower(v_shift) at time zone 'Asia/Kolkata', 'HH24:MI')),
      'noshow:' || r.staff_id || ':' || r.business_date);
  end loop;

  -- 3. Rostered days in the last three that have no summary yet (absences, weekly offs).
  for r in
    select re.staff_id, re.business_date from public.roster_entries re
     where re.business_date between v_today - 2 and v_today
       and not exists (select 1 from public.attendance_days ad
                        where ad.staff_id = re.staff_id and ad.business_date = re.business_date)
  loop
    perform private.team_recompute_day(r.staff_id, r.business_date, p_now);
  end loop;

  return jsonb_build_object('closed', v_closed, 'notifications', v_alerts);
end
$$;

-- ---------- Privileges ----------
revoke execute on function private.team_setting_bool(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function private.team_setting_text(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.team_outlet_managers(uuid) from public, anon, authenticated;
revoke execute on function private.team_notify_managers(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function private.team_shift_range(date, jsonb, time) from public, anon, authenticated;
revoke execute on function private.team_range_minutes(tstzmultirange) from public, anon, authenticated;
revoke execute on function private.team_recompute_day(uuid, date, timestamptz) from public, anon, authenticated;
revoke execute on function private.team_roster_recompute() from public, anon, authenticated;
revoke execute on function private.team_event_guard(uuid) from public, anon, authenticated;
revoke execute on function private.team_attendance_sweep(timestamptz) from public, anon, authenticated;

revoke execute on function public.team_device_today(uuid) from public, anon;
revoke execute on function public.team_check_in_out(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.team_confirm_attendance_event(uuid, timestamptz, text) from public, anon;
revoke execute on function public.team_void_attendance_event(uuid, text) from public, anon;
revoke execute on function public.team_add_attendance_event(uuid, date, text, timestamptz, text) from public, anon;
grant execute on function public.team_device_today(uuid) to authenticated;
grant execute on function public.team_check_in_out(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.team_confirm_attendance_event(uuid, timestamptz, text) to authenticated;
grant execute on function public.team_void_attendance_event(uuid, text) to authenticated;
grant execute on function public.team_add_attendance_event(uuid, date, text, timestamptz, text) to authenticated;

-- ---------- Schedule ----------
-- pg_cron exists on Supabase; the local test database doesn't have it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('team-attendance-sweep', '*/5 * * * *', 'select private.team_attendance_sweep()');
  end if;
end
$$;
