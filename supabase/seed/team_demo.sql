-- =========================================================
-- Daybook Team demo data — DEVELOPMENT / STAGING ONLY.
-- Never run against the production project.
--
-- Creates "Demo Kitchen" (org + one outlet in Maharashtra) with 8 staff,
-- shift templates, staffing minimums, leave types, salary structures,
-- the last 14 days of roster and attendance, and a draft payroll run
-- for last month. Safe to re-run: it does nothing if the outlet exists.
--
-- Staff have no phone logins (those need real auth users); tablet PINs
-- are 1111, 2222, … 8888 in the order below.
-- =========================================================
do $$
declare
  v_org uuid := 'de000000-0000-0000-0000-000000000001';
  v_outlet uuid := 'de100000-0000-0000-0000-000000000001';
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_day date;
  v_i int;
  v_d int;
  v_staff record;
  v_shift record;
  v_in timestamptz;
  v_out timestamptz;
  v_jitter int;
  v_t_day uuid := gen_random_uuid();
  v_t_late uuid := gen_random_uuid();
  v_t_split uuid := gen_random_uuid();
  v_t_kitchen uuid := gen_random_uuid();
begin
  if exists (select 1 from public.outlets where id = v_outlet) then
    raise notice 'Demo outlet already exists — skipping seed.';
    return;
  end if;

  insert into public.organizations (id, name) values (v_org, 'Demo Kitchen');
  insert into public.outlets (id, organization_id, name, city) values (v_outlet, v_org, 'Demo Kitchen — Baner', 'Pune');

  -- idx, name, pin, gender, role, wage_type, basic, hra, other, daily rate, template, joined (days ago)
  create temporary table demo_staff (
    idx int, id uuid, name text, pin text, gender text, skill text, wage_type text,
    basic bigint, hra bigint, other bigint, daily bigint, template text, joined_days_ago int
  ) on commit drop;
  insert into demo_staff values
    (1, gen_random_uuid(), 'Rishabh', '1111', 'male',   'steward', 'monthly', 1300000, 250000, 100000, null, 'day',     400),
    (2, gen_random_uuid(), 'Rajeev',  '2222', 'male',   'steward', 'monthly', 1250000, 250000, 100000, null, 'late',    200),
    (3, gen_random_uuid(), 'Priya',   '3333', 'female', 'captain', 'monthly', 1700000, 400000, 200000, null, 'day',     95),
    (4, gen_random_uuid(), 'Sanjay',  '4444', 'male',   'chef',    'monthly', 2200000, 600000, 300000, null, 'kitchen', 800),
    (5, gen_random_uuid(), 'Imran',   '5555', 'male',   'tandoor', 'monthly', 1500000, 300000, 100000, null, 'split',   60),
    (6, gen_random_uuid(), 'Neha',    '6666', 'female', 'cashier', 'monthly', 1400000, 250000, 100000, null, 'day',     30),
    (7, gen_random_uuid(), 'Arjun',   '7777', 'male',   'commis',  'monthly', 1200000, 200000,  50000, null, 'kitchen', 120),
    (8, gen_random_uuid(), 'Vikas',   '8888', 'male',   'helper',  'daily',         0,      0,      0, 60000, 'late',  45);

  insert into public.shift_templates (id, outlet_id, name, segments, break_minutes) values
    (v_t_day,     v_outlet, 'Day 12–21',   '[{"start":"12:00","end":"21:00"}]', 60),
    (v_t_late,    v_outlet, 'Late 14–23',  '[{"start":"14:00","end":"23:00"}]', 60),
    (v_t_split,   v_outlet, 'Split',       '[{"start":"11:00","end":"15:00"},{"start":"18:00","end":"23:00"}]', 0),
    (v_t_kitchen, v_outlet, 'Kitchen 10–19', '[{"start":"10:00","end":"19:00"}]', 60);

  insert into public.staffing_minimums (outlet_id, role_skill, slot_start, slot_end, min_count) values
    (v_outlet, 'steward', '12:00', '23:00', 2),
    (v_outlet, 'chef',    '10:00', '19:00', 1),
    (v_outlet, 'cashier', '12:00', '21:00', 1);

  insert into public.leave_types (outlet_id, code, name, paid, needs_proof, accrual) values
    (v_outlet, 'paid',     'Paid leave',  true,  false, '{"per_year_days":12,"accrual":"monthly"}'),
    (v_outlet, 'sick',     'Sick leave',  true,  true,  '{"per_year_days":7,"accrual":"yearly"}'),
    (v_outlet, 'unpaid',   'Unpaid leave', false, false, '{}'),
    (v_outlet, 'comp_off', 'Comp-off',    true,  false, '{}');

  insert into public.outlet_settings (outlet_id, key, value, updated_by) values
    (v_outlet, 'payroll.pt_state', '"MH"', null);

  for v_staff in select * from demo_staff order by idx loop
    insert into public.staff (id, outlet_id, name, pin_hash)
    values (v_staff.id, v_outlet, v_staff.name, extensions.crypt(v_staff.pin, extensions.gen_salt('bf')));

    insert into public.staff_profiles (staff_id, outlet_id, mobile, gender, joining_date, wage_type,
                                       late_shift_consent, transport_note)
    values (v_staff.id, v_outlet, '98765' || lpad(v_staff.idx::text, 5, '0'), v_staff.gender,
            v_today - v_staff.joined_days_ago, v_staff.wage_type,
            v_staff.gender = 'female', case when v_staff.gender = 'female' then 'Cab home after 21:00' end);

    insert into public.staff_skills (staff_id, outlet_id, skill) values (v_staff.id, v_outlet, v_staff.skill);

    insert into public.salary_structures (staff_id, outlet_id, effective_from, wage_type, basic_paise, hra_paise,
                                          other_allowances, daily_rate_paise, created_by)
    values (v_staff.id, v_outlet, v_today - v_staff.joined_days_ago, v_staff.wage_type, v_staff.basic, v_staff.hra,
            case when v_staff.other > 0
                 then jsonb_build_array(jsonb_build_object('code', 'special', 'label', 'Special allowance',
                                                           'paise', v_staff.other, 'excluded_from_wages', true))
                 else '[]'::jsonb end,
            v_staff.daily, null);

    -- Two weeks of roster + attendance, ending today.
    for v_d in 0..13 loop
      v_day := v_today - 13 + v_d;
      select id, segments into v_shift from public.shift_templates
       where id = case v_staff.template when 'day' then v_t_day when 'late' then v_t_late
                                        when 'split' then v_t_split else v_t_kitchen end;

      -- Weekly off rotates by person so the floor is never empty on one day.
      if extract(dow from v_day)::int = v_staff.idx % 7 then
        insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments, source, created_by)
        values (v_outlet, v_staff.id, v_day, 'weekly_off', '[]', 'seed', null);
        continue;  -- the roster trigger records the weekly off
      end if;

      insert into public.roster_entries (outlet_id, staff_id, business_date, shift_template_id, segments,
                                         role_skill, source, created_by)
      values (v_outlet, v_staff.id, v_day, v_shift.id, v_shift.segments, v_staff.skill, 'seed', null);

      if v_day = v_today then
        continue; -- today's attendance is left for the tablet demo
      end if;

      -- Rishabh never misses; others miss one day in roughly eleven.
      -- (No events: the roster trigger records the day as absent.)
      if v_staff.idx <> 1 and (v_staff.idx * 3 + v_d) % 11 = 0 then
        continue;
      end if;

      v_jitter := ((v_staff.idx * 7 + v_d * 5) % 19) - 6;  -- −6 … +12 minutes
      v_in := (v_day + (v_shift.segments -> 0 ->> 'start')::time) at time zone 'Asia/Kolkata'
              + make_interval(mins => v_jitter);
      v_out := (v_day + (v_shift.segments -> (jsonb_array_length(v_shift.segments) - 1) ->> 'end')::time)
               at time zone 'Asia/Kolkata' + make_interval(mins => (v_d % 4) * 5);

      insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, source, recorded_by)
      values (v_outlet, v_staff.id, v_day, 'in', v_in, 'device', null),
             (v_outlet, v_staff.id, v_day, 'out', v_out, 'device', null);

      perform private.team_recompute_day(v_staff.id, v_day);
    end loop;
  end loop;

  insert into public.payroll_runs (outlet_id, period_month, status, created_by)
  values (v_outlet, date_trunc('month', v_today - interval '1 month')::date, 'draft', null);

  raise notice 'Seeded Demo Kitchen with 8 staff.';
end
$$;
