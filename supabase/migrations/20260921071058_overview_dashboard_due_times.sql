
-- Optional due time (IST) for each checklist; drives "due soon" and "overdue" on the dashboard
alter table public.checklist_templates add column due_time time;

-- Per outlet and day: how many checklists were expected/done and how many items were done/not done
create or replace function private.overview_day(p_outlet uuid, p_date date, p_now time, p_is_today boolean)
returns table (x_expected int, x_done int, x_items_total int, x_items_done int, x_photos int)
language sql stable security definer set search_path = ''
as $$
  with tpl as (
    select t.id, t.due_time
      from public.checklist_templates t
     where t.outlet_id = p_outlet and t.active
       and (t.created_at at time zone 'Asia/Kolkata')::date <= p_date
  ),
  subs as (
    select distinct on (s.template_id) s.id, s.template_id
      from public.checklist_submissions s
     where s.outlet_id = p_outlet and s.business_date = p_date
     order by s.template_id, s.submitted_at desc
  ),
  ans as (
    select a.done as is_done, (a.photo_path is not null) as has_photo
      from public.submission_answers a
      join subs on subs.id = a.submission_id
  )
  select
    (select count(*) from tpl
      where not p_is_today
         or exists (select 1 from subs where subs.template_id = tpl.id)
         or (tpl.due_time is not null and tpl.due_time <= p_now))::int,
    (select count(*) from subs join tpl on tpl.id = subs.template_id)::int,
    (select count(*) from ans)::int,
    (select count(*) from ans where is_done)::int,
    (select count(*) from ans where has_photo)::int
$$;

revoke execute on function private.overview_day(uuid, date, time, boolean) from public, anon, authenticated;

-- Everything the Overview dashboard needs, in one call, limited to outlets the caller may manage
create or replace function public.get_overview(p_date date default null, p_outlet_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_now time := (now() at time zone 'Asia/Kolkata')::time;
  v_date date := coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date);
  v_role public.user_role := private.my_role();
  v_outlets jsonb;
  v_kpi jsonb;
  v_last jsonb;
  v_trend jsonb;
  v_top jsonb;
  v_alerts jsonb := '[]'::jsonb;
  v_activity jsonb;
  v_staff int;
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_role is null or v_role = 'device' then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_date > v_today or v_date < v_today - 400 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;
  if p_outlet_id is not null and not private.can_manage_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  v_from := ((v_date - 2)::timestamp) at time zone 'Asia/Kolkata';
  v_to := ((v_date + 1)::timestamp) at time zone 'Asia/Kolkata';

  -- per outlet
  select coalesce(jsonb_agg(jsonb_build_object(
      'outlet_id', x.id, 'name', x.name, 'brand', x.brand, 'organization_id', x.org,
      'expected', x.x_expected, 'done', x.x_done,
      'completion_pct', case when x.x_expected > 0 then round(100.0 * x.x_done / x.x_expected) end,
      'overdue', greatest(x.x_expected - x.x_done, 0),
      'items_total', x.x_items_total, 'missed_items', x.x_items_total - x.x_items_done,
      'photos', x.x_photos, 'open_variance_flags', x.flags, 'outside_location', x.outside,
      'status', case
        when x.x_expected = 0 and x.x_done = 0 then 'not_started'
        when x.x_expected - x.x_done > 0
             or (x.x_expected > 0 and 100.0 * x.x_done / x.x_expected < 70) then 'needs_action'
        when x.x_items_total - x.x_items_done > 0
             or (x.x_expected > 0 and 100.0 * x.x_done / x.x_expected < 90) then 'attention'
        else 'on_track' end
    ) order by x.brand, x.name), '[]'::jsonb)
    into v_outlets
    from (
      select o.id, o.name, g.name as brand, o.organization_id as org,
             d.x_expected, d.x_done, d.x_items_total, d.x_items_done, d.x_photos,
             (select count(*) from public.variance_results v
               where v.outlet_id = o.id and v.ack_status = 'open'
                 and v.business_date between v_date - 6 and v_date) as flags,
             ((select count(*) from public.checklist_submissions s
                where s.outlet_id = o.id and s.business_date = v_date and s.location_status = 'outside')
            + (select count(*) from public.stock_counts c
                where c.outlet_id = o.id and c.business_date = v_date and c.location_status = 'outside')
            + (select count(*) from public.stock_receipts r
                where r.outlet_id = o.id and r.business_date = v_date and r.location_status = 'outside')
            + (select count(*) from public.wastage_entries w
                where w.outlet_id = o.id and w.business_date = v_date and w.location_status = 'outside')) as outside
        from public.outlets o
        join public.organizations g on g.id = o.organization_id
        cross join lateral private.overview_day(o.id, v_date, v_now, v_date = v_today) d
       where o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
    ) x;

  -- headline numbers
  select jsonb_build_object(
      'outlets', count(*),
      'expected', coalesce(sum(r.expected), 0), 'done', coalesce(sum(r.done), 0),
      'completion_pct', case when coalesce(sum(r.expected), 0) > 0 then round(100.0 * sum(r.done) / sum(r.expected)) end,
      'overdue', coalesce(sum(r.overdue), 0), 'missed_items', coalesce(sum(r.missed_items), 0),
      'photos', coalesce(sum(r.photos), 0), 'open_variance_flags', coalesce(sum(r.open_variance_flags), 0),
      'outside_location', coalesce(sum(r.outside_location), 0))
    into v_kpi
    from jsonb_to_recordset(v_outlets)
      as r(expected int, done int, overdue int, missed_items int, photos int, open_variance_flags int, outside_location int);

  select count(*) into v_staff from public.staff s
   where s.active and private.can_manage_outlet(s.outlet_id) and (p_outlet_id is null or s.outlet_id = p_outlet_id);

  -- same weekday last week, for the "vs last week" arrows
  select jsonb_build_object(
      'completion_pct', case when coalesce(sum(d.x_expected), 0) > 0 then round(100.0 * sum(d.x_done) / sum(d.x_expected)) end,
      'missed_items', coalesce(sum(d.x_items_total - d.x_items_done), 0))
    into v_last
    from public.outlets o
    cross join lateral private.overview_day(o.id, v_date - 7, v_now, false) d
   where o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id);

  v_kpi := v_kpi || jsonb_build_object('active_staff', v_staff, 'last_week', v_last);

  -- seven-day completion trend
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', t.day, 'expected', t.e, 'done', t.n,
      'completion_pct', case when t.e > 0 then round(100.0 * t.n / t.e) end) order by t.day), '[]'::jsonb)
    into v_trend
    from (
      select g.day::date as day, coalesce(sum(od.x_expected), 0) as e, coalesce(sum(od.x_done), 0) as n
        from generate_series((v_date - 6)::timestamp, v_date::timestamp, interval '1 day') as g(day)
        cross join public.outlets o
        cross join lateral private.overview_day(o.id, g.day::date, v_now, g.day::date = v_today) od
       where o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
       group by g.day
    ) t;

  -- biggest open variances over the last seven days
  select coalesce(jsonb_agg(jsonb_build_object(
      'item', a.item_name, 'outlet', a.outlet_name, 'unit', a.unit,
      'variance_qty', a.qty, 'variance_value', a.val,
      'variance_pct', case when a.exp_qty > 0 then round(100.0 * a.qty / a.exp_qty, 1) end,
      'days_flagged', a.days_flagged, 'series', a.series)
      order by abs(coalesce(a.val, 0)) desc, abs(a.qty) desc), '[]'::jsonb)
    into v_top
    from (
      select v.item_name, o.name as outlet_name, v.unit,
             sum(v.variance_qty) as qty, sum(v.variance_value) as val,
             sum(v.sold_usage_qty + v.wastage_qty) as exp_qty, count(*) as days_flagged,
             jsonb_agg(jsonb_build_object('date', v.business_date, 'qty', v.variance_qty)
                       order by v.business_date) as series
        from public.variance_results v
        join public.outlets o on o.id = v.outlet_id
       where v.business_date between v_date - 6 and v_date
         and v.status in ('shortage', 'surplus')
         and o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
       group by v.item_name, o.name, v.unit
       order by abs(coalesce(sum(v.variance_value), 0)) desc, abs(sum(v.variance_qty)) desc
       limit 5
    ) a;

  -- checklists overdue or due within the hour (today only)
  if v_date = v_today then
    select coalesce(jsonb_agg(jsonb_build_object(
        'kind', case when t.due_time <= v_now then 'overdue' else 'upcoming' end,
        'outlet_id', o.id, 'outlet', o.name, 'template', t.name, 'due_time', t.due_time,
        'minutes', round(extract(epoch from (t.due_time - v_now)) / 60)) order by t.due_time), '[]'::jsonb)
      into v_alerts
      from public.checklist_templates t
      join public.outlets o on o.id = t.outlet_id
     where t.active and t.due_time is not null and o.active
       and (t.created_at at time zone 'Asia/Kolkata')::date <= v_date
       and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
       and not exists (select 1 from public.checklist_submissions s
                        where s.template_id = t.id and s.business_date = v_date)
       and (t.due_time <= v_now or extract(epoch from (t.due_time - v_now)) <= 3600);
  end if;

  -- recent activity across checklists, counts, deliveries and wastage
  select coalesce(jsonb_agg(e.ev order by e.ts desc), '[]'::jsonb)
    into v_activity
    from (
      select u.ts, u.ev from (
        select s.submitted_at as ts, jsonb_build_object(
            'type', 'checklist', 'id', s.id, 'ts', s.submitted_at, 'outlet', o.name, 'staff', st.name,
            'title', t.name,
            'items_done', (select count(*) from public.submission_answers a where a.submission_id = s.id and a.done),
            'items_total', (select count(*) from public.submission_answers a where a.submission_id = s.id),
            'photo_count', (select count(*) from public.submission_answers a where a.submission_id = s.id and a.photo_path is not null),
            'photos', coalesce((select jsonb_agg(p.photo_path)
                                  from (select a.photo_path from public.submission_answers a
                                         where a.submission_id = s.id and a.photo_path is not null
                                         order by a.id limit 4) p), '[]'::jsonb),
            'location_status', s.location_status) as ev
          from public.checklist_submissions s
          join public.outlets o on o.id = s.outlet_id
          join public.staff st on st.id = s.staff_id
          join public.checklist_templates t on t.id = s.template_id
         where s.submitted_at >= v_from and s.submitted_at < v_to
           and o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
        union all
        select c.submitted_at, jsonb_build_object(
            'type', 'stock_count', 'id', c.id, 'ts', c.submitted_at, 'outlet', o.name, 'staff', st.name,
            'title', c.kind::text || ' stock count',
            'items_total', (select count(*) from public.stock_count_lines l where l.count_id = c.id),
            'photos', '[]'::jsonb, 'location_status', c.location_status)
          from public.stock_counts c
          join public.outlets o on o.id = c.outlet_id
          join public.staff st on st.id = c.staff_id
         where c.submitted_at >= v_from and c.submitted_at < v_to
           and o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
        union all
        select r.submitted_at, jsonb_build_object(
            'type', 'receipt', 'id', r.id, 'ts', r.submitted_at, 'outlet', o.name, 'staff', st.name,
            'title', r.vendor_name,
            'items_total', (select count(*) from public.stock_receipt_lines l where l.receipt_id = r.id),
            'photos', case when r.photo_path is not null then jsonb_build_array(r.photo_path) else '[]'::jsonb end,
            'location_status', r.location_status)
          from public.stock_receipts r
          join public.outlets o on o.id = r.outlet_id
          join public.staff st on st.id = r.staff_id
         where r.submitted_at >= v_from and r.submitted_at < v_to
           and o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
        union all
        select w.logged_at, jsonb_build_object(
            'type', 'wastage', 'id', w.id, 'ts', w.logged_at, 'outlet', o.name, 'staff', st.name,
            'title', w.item_name, 'detail', w.quantity::text || ' ' || w.unit || ' - ' || w.reason::text,
            'photos', case when w.photo_path is not null then jsonb_build_array(w.photo_path) else '[]'::jsonb end,
            'location_status', w.location_status)
          from public.wastage_entries w
          join public.outlets o on o.id = w.outlet_id
          join public.staff st on st.id = w.staff_id
         where w.logged_at >= v_from and w.logged_at < v_to
           and o.active and private.can_manage_outlet(o.id) and (p_outlet_id is null or o.id = p_outlet_id)
      ) u
      order by u.ts desc
      limit 20
    ) e;

  return jsonb_build_object('ok', true, 'date', v_date, 'is_today', v_date = v_today,
    'kpis', v_kpi, 'outlets', v_outlets, 'trend', v_trend, 'top_variances', v_top,
    'alerts', v_alerts, 'activity', v_activity);
end
$$;

revoke execute on function public.get_overview(date, uuid) from public, anon;
grant execute on function public.get_overview(date, uuid) to authenticated;
