
-- =====================================================================
-- Phase D: forecasting, order drafts, vendor-wise split
-- =====================================================================

create table public.order_drafts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'dismissed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  dismissed_at timestamptz,
  notes text
);

-- Only one OPEN draft per outlet per day; an approved or dismissed draft does not block a new one
create unique index order_drafts_one_open on public.order_drafts (outlet_id, business_date) where status = 'draft';

create table public.order_draft_lines (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.order_drafts(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name text not null default 'No vendor assigned',
  current_stock numeric(14,3),
  last_count_date date,
  daily_forecast numeric(14,3),
  forecast_basis text check (forecast_basis is null or forecast_basis in ('same_weekday', 'recent_days')),
  forecast_samples int,
  par_level numeric(12,3),
  lead_time_days int not null default 1,
  target_qty numeric(14,3),
  order_unit text,
  order_unit_size numeric(12,3) not null default 1,
  suggested_units numeric(12,3),
  suggested_qty numeric(14,3) not null default 0,
  order_qty numeric(14,3) not null default 0 check (order_qty >= 0),
  include boolean not null default false,
  reason text not null check (reason in ('shortage', 'sufficient_stock', 'no_recent_count', 'no_par_no_forecast')),
  note text,
  unique (draft_id, item_id)
);

create index on public.order_drafts (outlet_id, business_date);
create index on public.order_drafts (created_by);
create index on public.order_drafts (approved_by);
create index on public.order_draft_lines (outlet_id);
create index on public.order_draft_lines (item_id);
create index on public.order_draft_lines (vendor_id);

-- ---------- Demand forecast: same-weekday average, falling back to a recent-days average ----------
create or replace function private.forecast_item_usage(p_outlet uuid, p_item uuid, p_target_date date)
returns table (avg_qty numeric, basis text, samples int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_dow int := extract(dow from p_target_date)::int;
  v_vals numeric[];
  v_n int;
begin
  select array_agg(x.actual_usage_qty order by x.business_date desc) into v_vals
    from (
      select v.actual_usage_qty, v.business_date
        from public.variance_results v
       where v.outlet_id = p_outlet and v.item_id = p_item
         and v.actual_usage_qty is not null and v.business_date < p_target_date
         and extract(dow from v.business_date)::int = v_dow
       order by v.business_date desc limit 8
    ) x;
  v_n := coalesce(array_length(v_vals, 1), 0);
  if v_n >= 3 then
    return query select round((select avg(u) from unnest(v_vals) u), 3), 'same_weekday'::text, v_n;
    return;
  end if;

  select array_agg(x.actual_usage_qty order by x.business_date desc) into v_vals
    from (
      select v.actual_usage_qty, v.business_date
        from public.variance_results v
       where v.outlet_id = p_outlet and v.item_id = p_item
         and v.actual_usage_qty is not null and v.business_date < p_target_date
       order by v.business_date desc limit 21
    ) x;
  v_n := coalesce(array_length(v_vals, 1), 0);
  if v_n >= 3 then
    return query select round((select avg(u) from unnest(v_vals) u), 3), 'recent_days'::text, v_n;
    return;
  end if;

  return query select null::numeric, null::text, v_n;
end
$$;

revoke execute on function private.forecast_item_usage(uuid, uuid, date) from public, anon, authenticated;

-- ---------- Table privileges ----------
revoke all on public.order_drafts, public.order_draft_lines from anon;
revoke truncate, references, trigger on public.order_drafts, public.order_draft_lines from authenticated;
revoke insert, update, delete on public.order_drafts, public.order_draft_lines from authenticated;

-- ---------- Row-level security ----------
alter table public.order_drafts enable row level security;
alter table public.order_draft_lines enable row level security;

create policy order_drafts_select on public.order_drafts for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy order_draft_lines_select on public.order_draft_lines for select to authenticated
  using (private.can_manage_outlet(outlet_id));

-- ---------- Generate (or regenerate) the open draft for an outlet and day ----------
create or replace function public.generate_order_draft(p_outlet_id uuid, p_business_date date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_date date := coalesce(p_business_date, (now() at time zone 'Asia/Kolkata')::date);
  v_draft_id uuid;
  v_lines int;
  v_shortages int;
begin
  if not private.can_manage_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_date < v_today - 1 or v_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select id into v_draft_id from public.order_drafts
   where outlet_id = p_outlet_id and business_date = v_date and status = 'draft';

  if v_draft_id is null then
    insert into public.order_drafts (outlet_id, business_date, created_by)
    values (p_outlet_id, v_date, (select auth.uid()))
    returning id into v_draft_id;
  else
    delete from public.order_draft_lines where draft_id = v_draft_id;
  end if;

  with items as (
    select oi.item_id, i.name as item_name, i.count_unit, i.vendor_id,
           coalesce(ve.name, 'No vendor assigned') as vendor_name,
           oi.par_level, oi.lead_time_days, i.order_unit, i.order_unit_size
      from public.outlet_items oi
      join public.inventory_items i on i.id = oi.item_id
      left join public.vendors ve on ve.id = i.vendor_id
     where oi.outlet_id = p_outlet_id and oi.active and i.active
  ),
  latest_count as (
    select distinct on (l.item_id) l.item_id, l.quantity, c.business_date
      from public.stock_count_lines l
      join public.stock_counts c on c.id = l.count_id
     where c.outlet_id = p_outlet_id and l.item_id is not null
     order by l.item_id, c.business_date desc, c.submitted_at desc
  ),
  calc as (
    select it.item_id, it.item_name, it.count_unit, it.vendor_id, it.vendor_name,
           it.par_level, it.lead_time_days, it.order_unit, it.order_unit_size,
           lc.quantity as current_stock, lc.business_date as last_count_date,
           fc.avg_qty as daily_forecast, fc.basis as forecast_basis, fc.samples as forecast_samples,
           (it.lead_time_days + 1) as coverage_days
      from items it
      left join latest_count lc on lc.item_id = it.item_id
      left join lateral private.forecast_item_usage(p_outlet_id, it.item_id, v_date) fc on true
  ),
  calc2 as (
    select calc.*,
           case when daily_forecast is not null
                then greatest(coalesce(par_level, 0), daily_forecast * coverage_days)
                else par_level end as target_qty
      from calc
  ),
  calc3 as (
    select calc2.*,
           case when current_stock is null or target_qty is null then null
                else target_qty - current_stock end as order_needed
      from calc2
  ),
  calc4 as (
    select calc3.*,
           case when current_stock is null then 'no_recent_count'
                when target_qty is null then 'no_par_no_forecast'
                when order_needed <= 0 then 'sufficient_stock'
                else 'shortage' end as reason,
           case when order_needed is not null and order_needed > 0
                then ceil(order_needed / order_unit_size) end as suggested_units
      from calc3
  )
  insert into public.order_draft_lines
    (draft_id, outlet_id, item_id, item_name, unit, vendor_id, vendor_name,
     current_stock, last_count_date, daily_forecast, forecast_basis, forecast_samples,
     par_level, lead_time_days, target_qty, order_unit, order_unit_size,
     suggested_units, suggested_qty, order_qty, include, reason)
  select v_draft_id, p_outlet_id, item_id, item_name, count_unit, vendor_id, vendor_name,
         current_stock, last_count_date, daily_forecast, forecast_basis, forecast_samples,
         par_level, lead_time_days, target_qty, order_unit, order_unit_size,
         suggested_units,
         coalesce(suggested_units * order_unit_size, 0),
         coalesce(suggested_units * order_unit_size, 0),
         coalesce(suggested_units, 0) > 0,
         reason
    from calc4;

  get diagnostics v_lines = row_count;
  select count(*) into v_shortages from public.order_draft_lines
   where draft_id = v_draft_id and reason = 'shortage';

  return jsonb_build_object('ok', true, 'draft_id', v_draft_id, 'lines', v_lines, 'shortages', v_shortages);
end
$$;

-- ---------- Manager edits one line before approving ----------
create or replace function public.update_order_draft_line(
  p_line_id uuid, p_order_qty numeric, p_include boolean default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_status text;
begin
  select d.outlet_id, d.status into v_outlet, v_status
    from public.order_draft_lines l join public.order_drafts d on d.id = l.draft_id
   where l.id = p_line_id;

  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_editable');
  end if;
  if p_order_qty is null or p_order_qty < 0 or p_order_qty > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_quantity');
  end if;

  update public.order_draft_lines
     set order_qty = p_order_qty,
         include = coalesce(p_include, include),
         note = case when p_note is null then note else nullif(btrim(p_note), '') end
   where id = p_line_id;

  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Approve / dismiss ----------
create or replace function public.approve_order_draft(p_draft_id uuid, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_status text;
  v_name text;
begin
  select outlet_id, status into v_outlet, v_status from public.order_drafts where id = p_draft_id;
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_draft');
  end if;
  select p.full_name into v_name from public.profiles p where p.id = (select auth.uid());
  update public.order_drafts
     set status = 'approved', approved_by = (select auth.uid()), approved_by_name = v_name,
         approved_at = now(), notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end
   where id = p_draft_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.dismiss_order_draft(p_draft_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_status text;
begin
  select outlet_id, status into v_outlet, v_status from public.order_drafts where id = p_draft_id;
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v_status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_draft');
  end if;
  update public.order_drafts
     set status = 'dismissed', dismissed_at = now(),
         notes = case when p_reason is null then notes else nullif(btrim(p_reason), '') end
   where id = p_draft_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.generate_order_draft(uuid, date) from public, anon;
revoke execute on function public.update_order_draft_line(uuid, numeric, boolean, text) from public, anon;
revoke execute on function public.approve_order_draft(uuid, text) from public, anon;
revoke execute on function public.dismiss_order_draft(uuid, text) from public, anon;
grant execute on function public.generate_order_draft(uuid, date) to authenticated;
grant execute on function public.update_order_draft_line(uuid, numeric, boolean, text) to authenticated;
grant execute on function public.approve_order_draft(uuid, text) to authenticated;
grant execute on function public.dismiss_order_draft(uuid, text) to authenticated;
