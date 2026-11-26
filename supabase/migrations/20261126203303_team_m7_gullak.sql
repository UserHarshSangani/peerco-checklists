-- =========================================================
-- Daybook Team — Milestone 7: Gullak (daily attendance streak)
--
-- Same rules as lib/team/engines/gullak.ts:
--  * Each attended rostered day (present or half day) adds one to the
--    streak and credits that level's amount (gullak.level_start_days /
--    gullak.level_amounts_paise; the top level only with
--    gullak.top_level_enabled). Weekly offs, approved leave and unrostered
--    days leave the streak alone.
--  * An unapproved absence drops ONE level: the next attended day is the
--    first day of the level below (Day 64 → Day 7; from ₹20 back to Day 1).
--    It is settled only after gullak.absence_wait_days, so a manager can
--    still fix a missed check-in first.
--  * gullak.monthly_cap_paise (0 = no limit): after the cap, days still
--    count but credit ₹0.
--  * Each credit is two ledger rows: credit_payable (gullak.payable_share_bps,
--    paid with that month's pay) and credit_locked.
--  * Locked money unlocks at gullak.unlock_months of service from the
--    joining date (3, 6, 12), then every 12 months: an `unlock` row moves the
--    locked balance up to that date into that month's payable.
--  * Balances always come from gullak_ledger; gullak_streaks is a cache of
--    where the count stands. Streaks start at go-live (Day 1 from the first
--    attended day), service months from the real joining date.
--  * Days needing a manager's confirmation, and rostered days whose shift
--    hasn't ended, hold the count until they're settled.
--  * private.team_gullak_sweep every 5 minutes via pg_cron.
-- =========================================================

-- Integer list setting (e.g. [1, 7, 30, 90]); default when unset or malformed.
create or replace function private.team_setting_int_list(p_outlet uuid, p_key text, p_default int[])
returns int[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_value jsonb;
  v_out int[];
begin
  select os.value into v_value from public.outlet_settings os
   where os.outlet_id = p_outlet and os.key = p_key;
  if v_value is null or jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) = 0 then
    return p_default;
  end if;
  select array_agg((e.value #>> '{}')::int order by e.n) into v_out
    from jsonb_array_elements(v_value) with ordinality as e(value, n);
  return v_out;
exception when others then
  return p_default;
end
$$;

-- The level lists in use: [starts, amounts], both the same length.
create or replace function private.team_gullak_levels(p_outlet uuid, out starts int[], out amounts int[])
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_n int;
begin
  starts := private.team_setting_int_list(p_outlet, 'gullak.level_start_days', '{1,7,30,90}');
  amounts := private.team_setting_int_list(p_outlet, 'gullak.level_amounts_paise', '{2000,3000,4000,5000}');
  if coalesce(array_length(starts, 1), 0) <> coalesce(array_length(amounts, 1), 0) or array_length(starts, 1) is null then
    starts := '{1,7,30,90}';
    amounts := '{2000,3000,4000,5000}';
  end if;
  v_n := array_length(starts, 1);
  if v_n > 1 and not private.team_setting_bool(p_outlet, 'gullak.top_level_enabled', true) then
    starts := starts[1:v_n - 1];
    amounts := amounts[1:v_n - 1];
  end if;
end
$$;

-- Level (1-based) for a streak day.
create or replace function private.team_gullak_level(p_starts int[], p_day int)
returns int
language sql immutable set search_path = ''
as $$
  select coalesce(max(i), 1) from generate_subscripts(p_starts, 1) i where p_starts[i] <= greatest(p_day, 1)
$$;

-- Unlock dates up to p_until: the set months, then every 12 after the last.
create or replace function private.team_gullak_milestones(p_join date, p_months int[], p_until date)
returns table (months int, at date)
language plpgsql immutable set search_path = ''
as $$
declare
  v_sorted int[];
  v_n int;
  v_m int;
  v_i int := 0;
begin
  if p_join is null then return; end if;
  select array_agg(distinct m order by m) into v_sorted from unnest(p_months) m where m > 0;
  v_n := coalesce(array_length(v_sorted, 1), 0);
  if v_n = 0 then return; end if;
  loop
    v_i := v_i + 1;
    v_m := case when v_i <= v_n then v_sorted[v_i] else v_sorted[v_n] + 12 * (v_i - v_n) end;
    months := v_m;
    at := (p_join + make_interval(months => v_m))::date;
    exit when at > p_until or v_i > 1200;
    return next;
  end loop;
end
$$;

-- Locked money as of a date (credits up to then, less what already unlocked or was forfeited).
create or replace function private.team_gullak_locked(p_staff uuid, p_upto date default null)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(case
           when g.kind = 'credit_locked' and (p_upto is null or g.business_date <= p_upto) then g.amount_paise
           when g.kind = 'unlock' then -g.amount_paise
           when g.kind = 'forfeit' then g.amount_paise
           else 0 end), 0)::bigint
    from public.gullak_ledger g where g.staff_id = p_staff
$$;

-- ---------- One person: count every settled day since the last run ----------
create or replace function private.team_gullak_run(p_staff uuid, p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Asia/Kolkata')::date;
  v_outlet uuid;
  v_join date;
  v_streak public.gullak_streaks%rowtype;
  v_starts int[];
  v_amounts int[];
  v_cap bigint;
  v_bps int;
  v_wait int;
  v_months int[];
  v_d date;
  v_last date;
  v_dayrow public.attendance_days%rowtype;
  v_has boolean;
  v_work boolean;
  v_kind text;
  v_day int;
  v_level int;
  v_amount bigint;
  v_payable bigint;
  v_used bigint;
  v_count int := 0;
  v_unlock bigint;
  m record;
begin
  select s.outlet_id, sp.joining_date into v_outlet, v_join
    from public.staff s
    left join public.staff_profiles sp on sp.staff_id = s.id
   where s.id = p_staff and s.active and coalesce(sp.employment_status, 'active') in ('active', 'on_notice');
  if v_outlet is null then return 0; end if;

  select * into v_streak from public.gullak_streaks gs where gs.staff_id = p_staff for update;
  if not found then
    insert into public.gullak_streaks (staff_id, outlet_id, current_day, current_level, last_counted_date)
    values (p_staff, v_outlet, 0, 1, greatest(v_today, coalesce(v_join, v_today)) - 1)
    returning * into v_streak;
  end if;

  if not private.team_setting_bool(v_outlet, 'gullak.enabled', true) then
    -- Off: time passes without counting; the streak stays where it was.
    update public.gullak_streaks gs set last_counted_date = greatest(gs.last_counted_date, v_today), updated_at = p_now
     where gs.staff_id = p_staff;
    return 0;
  end if;

  select l.starts, l.amounts into v_starts, v_amounts from private.team_gullak_levels(v_outlet) l;
  v_cap := greatest(private.team_setting_int(v_outlet, 'gullak.monthly_cap_paise', 150000), 0);
  v_bps := least(greatest(private.team_setting_int(v_outlet, 'gullak.payable_share_bps', 5000), 0), 10000);
  v_wait := greatest(private.team_setting_int(v_outlet, 'gullak.absence_wait_days', 1), 0);
  v_months := private.team_setting_int_list(v_outlet, 'gullak.unlock_months', '{3,6,12}');

  v_day := v_streak.current_day;
  v_last := v_streak.last_counted_date;
  v_d := v_last + 1;
  while v_d <= v_today loop
    v_work := exists (select 1 from public.roster_entries re
                       where re.staff_id = p_staff and re.business_date = v_d and re.kind = 'work');
    select * into v_dayrow from public.attendance_days ad where ad.staff_id = p_staff and ad.business_date = v_d;
    v_has := found;
    if not v_has and v_work and v_d < v_today then
      perform private.team_recompute_day(p_staff, v_d, p_now);
      select * into v_dayrow from public.attendance_days ad where ad.staff_id = p_staff and ad.business_date = v_d;
      v_has := found;
    end if;
    v_kind := case
      when v_has and v_dayrow.status in ('present', 'half_day') and v_work then 'attended'
      when v_has and v_dayrow.status = 'needs_confirmation' then 'wait'
      when v_has and v_dayrow.status = 'absent_unapproved' then 'absent'
      when not v_has and v_work then 'wait'              -- the shift isn't over yet
      else 'neutral' end;
    exit when v_d = v_today and v_kind <> 'attended';     -- today counts once they're in
    exit when v_kind = 'wait';
    exit when v_kind = 'absent' and v_d + v_wait >= v_today;

    if v_kind = 'attended' then
      v_day := v_day + 1;
      v_level := private.team_gullak_level(v_starts, v_day);
      v_amount := v_amounts[v_level];
      if v_cap > 0 then
        select coalesce(sum(g.amount_paise), 0) into v_used from public.gullak_ledger g
         where g.staff_id = p_staff and g.kind in ('credit_payable', 'credit_locked')
           and date_trunc('month', g.business_date) = date_trunc('month', v_d);
        v_amount := greatest(0, least(v_amount, v_cap - v_used));
      end if;
      v_payable := round(v_amount * v_bps / 10000.0)::bigint;
      if v_payable > 0 then
        insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise, streak_day, level)
        values (p_staff, v_outlet, v_d, 'credit_payable', v_payable, v_day, v_level)
        on conflict do nothing;
      end if;
      if v_amount - v_payable > 0 then
        insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise, streak_day, level)
        values (p_staff, v_outlet, v_d, 'credit_locked', v_amount - v_payable, v_day, v_level)
        on conflict do nothing;
      end if;
    elsif v_kind = 'absent' then
      v_level := private.team_gullak_level(v_starts, v_day);
      v_day := case when v_level >= 2 then v_starts[v_level - 1] - 1 else 0 end;
    end if;
    v_last := v_d;
    v_count := v_count + 1;
    v_d := v_d + 1;
  end loop;

  update public.gullak_streaks gs
     set current_day = v_day, current_level = private.team_gullak_level(v_starts, v_day),
         last_counted_date = v_last, updated_at = p_now
   where gs.staff_id = p_staff;

  -- Unlocks for every milestone the count has reached.
  for m in select * from private.team_gullak_milestones(v_join, v_months, v_last) loop
    continue when exists (select 1 from public.gullak_ledger g
                           where g.staff_id = p_staff and g.kind = 'unlock' and g.milestone_months = m.months);
    v_unlock := private.team_gullak_locked(p_staff, m.at);
    continue when v_unlock <= 0;
    insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise, milestone_months, note)
    values (p_staff, v_outlet, m.at, 'unlock', v_unlock, m.months, m.months || ' months of service');
    perform private.team_notify_staff(p_staff, 'gullak_unlocked',
      jsonb_build_object('amount_paise', v_unlock, 'months', m.months, 'date', m.at),
      'gullak_unlocked:' || p_staff || ':' || m.months);
  end loop;
  return v_count;
end
$$;

-- One unlock per milestone per person.
create unique index gullak_one_unlock_per_milestone on public.gullak_ledger (staff_id, milestone_months)
  where kind = 'unlock';

-- ---------- Everyone, every 5 minutes ----------
create or replace function private.team_gullak_sweep(p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_people int := 0;
  v_days int := 0;
  r record;
begin
  for r in select s.id from public.staff s where s.active loop
    v_days := v_days + private.team_gullak_run(r.id, p_now);
    v_people := v_people + 1;
  end loop;
  perform private.team_push_kick();
  return jsonb_build_object('people', v_people, 'days', v_days);
end
$$;

-- ---------- Summary for one person (staff card and manager board) ----------
create or replace function private.team_gullak_summary(p_staff uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_outlet uuid;
  v_join date;
  v_streak public.gullak_streaks%rowtype;
  v_starts int[];
  v_amounts int[];
  v_day int;
  v_level int;
  v_next_day int;
  v_after date;
  v_unlock_at date;
  v_unlock_months int;
begin
  select s.outlet_id, sp.joining_date into v_outlet, v_join
    from public.staff s left join public.staff_profiles sp on sp.staff_id = s.id where s.id = p_staff;
  if v_outlet is null then return null; end if;
  select l.starts, l.amounts into v_starts, v_amounts from private.team_gullak_levels(v_outlet) l;
  select * into v_streak from public.gullak_streaks gs where gs.staff_id = p_staff;
  v_day := coalesce(v_streak.current_day, 0);
  v_level := private.team_gullak_level(v_starts, v_day);
  v_next_day := case when v_level < array_length(v_starts, 1) then v_starts[v_level + 1] end;
  v_after := coalesce(v_streak.last_counted_date, v_today - 1);
  select mm.at, mm.months into v_unlock_at, v_unlock_months from private.team_gullak_milestones(v_join,
           private.team_setting_int_list(v_outlet, 'gullak.unlock_months', '{3,6,12}'), v_after + 800) mm
   where mm.at > v_after order by mm.at limit 1;

  return jsonb_build_object(
    'staff_id', p_staff,
    'enabled', private.team_setting_bool(v_outlet, 'gullak.enabled', true),
    'day', v_day,
    'level', v_level,
    'level_amount_paise', v_amounts[private.team_gullak_level(v_starts, v_day + 1)],
    'next_level_day', v_next_day,
    'next_level_amount_paise', case when v_next_day is not null then v_amounts[v_level + 1] end,
    'last_counted_date', v_streak.last_counted_date,
    'today_paise', (select coalesce(sum(g.amount_paise), 0) from public.gullak_ledger g
                     where g.staff_id = p_staff and g.business_date = v_today
                       and g.kind in ('credit_payable', 'credit_locked')),
    'month_paise', (select coalesce(sum(g.amount_paise), 0) from public.gullak_ledger g
                     where g.staff_id = p_staff and g.kind in ('credit_payable', 'credit_locked')
                       and date_trunc('month', g.business_date) = date_trunc('month', v_today)),
    'cap_paise', greatest(private.team_setting_int(v_outlet, 'gullak.monthly_cap_paise', 150000), 0),
    'payable_month_paise', (select coalesce(sum(g.amount_paise), 0) from public.gullak_ledger g
                             where g.staff_id = p_staff and g.kind in ('credit_payable', 'unlock')
                               and date_trunc('month', g.business_date) = date_trunc('month', v_today)),
    'total_paise', (select coalesce(sum(g.amount_paise), 0) from public.gullak_ledger g
                     where g.staff_id = p_staff and g.kind <> 'unlock'),
    'locked_paise', private.team_gullak_locked(p_staff),
    'next_unlock_date', v_unlock_at,
    'next_unlock_months', v_unlock_months,
    'joining_known', v_join is not null);
end
$$;

-- Staff phone: own Gullak card and the last few entries.
create or replace function public.team_my_gullak()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.my_staff_id() is null then null else
    private.team_gullak_summary(private.my_staff_id()) || jsonb_build_object(
      'history', coalesce((
        select jsonb_agg(jsonb_build_object('date', h.business_date, 'kind', h.kind, 'amount_paise', h.amount_paise,
                                            'day', h.streak_day, 'months', h.milestone_months)
                         order by h.business_date desc, h.kind)
          from (select g.business_date, case when g.kind like 'credit%' then 'credit' else g.kind end as kind,
                       sum(g.amount_paise) as amount_paise, max(g.streak_day) as streak_day,
                       max(g.milestone_months) as milestone_months
                  from public.gullak_ledger g where g.staff_id = private.my_staff_id()
                 group by 1, 2
                 order by 1 desc, 2 limit 20) h), '[]'::jsonb)) end
$$;

-- Manager: everyone at the outlet.
create or replace function public.team_gullak_board(p_outlet uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not private.can_manage_outlet(p_outlet) then null else coalesce((
    select jsonb_agg(private.team_gullak_summary(s.id) || jsonb_build_object('name', s.name) order by s.name)
      from public.staff s
      left join public.staff_profiles sp on sp.staff_id = s.id
     where s.outlet_id = p_outlet and s.active
       and coalesce(sp.employment_status, 'active') in ('active', 'on_notice')), '[]'::jsonb) end
$$;

-- ---------- Privileges ----------
revoke execute on function private.team_setting_int_list(uuid, text, int[]) from public, anon, authenticated;
revoke execute on function private.team_gullak_levels(uuid) from public, anon, authenticated;
revoke execute on function private.team_gullak_level(int[], int) from public, anon, authenticated;
revoke execute on function private.team_gullak_milestones(date, int[], date) from public, anon, authenticated;
revoke execute on function private.team_gullak_locked(uuid, date) from public, anon, authenticated;
revoke execute on function private.team_gullak_run(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function private.team_gullak_sweep(timestamptz) from public, anon, authenticated;
revoke execute on function private.team_gullak_summary(uuid) from public, anon, authenticated;
revoke execute on function public.team_my_gullak() from public, anon;
revoke execute on function public.team_gullak_board(uuid) from public, anon;
grant execute on function public.team_my_gullak() to authenticated;
grant execute on function public.team_gullak_board(uuid) to authenticated;

-- ---------- Schedule: every 5 minutes ----------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('team-gullak-sweep', '*/5 * * * *', 'select private.team_gullak_sweep()');
  end if;
end
$$;
