
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
  ),
  upserted as (
    insert into public.order_draft_lines
      (draft_id, outlet_id, item_id, item_name, unit, vendor_id, vendor_name,
       current_stock, last_count_date, daily_forecast, forecast_basis, forecast_samples,
       par_level, lead_time_days, target_qty, order_unit, order_unit_size,
       suggested_units, suggested_qty, order_qty, include, reason, note)
    select v_draft_id, p_outlet_id, item_id, item_name, count_unit, vendor_id, vendor_name,
           current_stock, last_count_date, daily_forecast, forecast_basis, forecast_samples,
           par_level, lead_time_days, target_qty, order_unit, order_unit_size,
           suggested_units,
           coalesce(suggested_units * order_unit_size, 0),
           coalesce(suggested_units * order_unit_size, 0),
           coalesce(suggested_units, 0) > 0,
           reason, null
      from calc4
    on conflict (draft_id, item_id) do update set
      item_name = excluded.item_name, unit = excluded.unit,
      vendor_id = excluded.vendor_id, vendor_name = excluded.vendor_name,
      current_stock = excluded.current_stock, last_count_date = excluded.last_count_date,
      daily_forecast = excluded.daily_forecast, forecast_basis = excluded.forecast_basis,
      forecast_samples = excluded.forecast_samples, par_level = excluded.par_level,
      lead_time_days = excluded.lead_time_days, target_qty = excluded.target_qty,
      order_unit = excluded.order_unit, order_unit_size = excluded.order_unit_size,
      suggested_units = excluded.suggested_units, suggested_qty = excluded.suggested_qty,
      order_qty = excluded.suggested_qty, include = excluded.include,
      reason = excluded.reason, note = null
    returning item_id
  )
  -- drop lines for items no longer stocked at this outlet (deactivated since the last generate)
  delete from public.order_draft_lines
   where draft_id = v_draft_id
     and item_id not in (select item_id from upserted);

  select count(*) into v_lines from public.order_draft_lines where draft_id = v_draft_id;
  select count(*) into v_shortages from public.order_draft_lines
   where draft_id = v_draft_id and reason = 'shortage';

  return jsonb_build_object('ok', true, 'draft_id', v_draft_id, 'lines', v_lines, 'shortages', v_shortages);
end
$$;
