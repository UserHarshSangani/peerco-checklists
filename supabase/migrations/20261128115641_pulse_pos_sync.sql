-- PeerCo Pulse -> Daybook POS sync.
--
-- Pulse already holds each brand's Petpooja item data. Instead of staff uploading the
-- "Order Summary Item Report" CSV, Daybook pulls the same rows from Pulse's private API
-- (daily cron + a Sync button) and imports them exactly like a CSV import, then recomputes
-- variance for the synced days.
--
-- 1. public.outlet_pulse_links: which Pulse brand (and outlet name on its bills) feeds a
--    Daybook outlet, plus the last sync result. PeerCo admins set links; anyone who can
--    manage the outlet can see its link and sync status.
-- 2. private.import_pos_sales_as: the body of public.import_pos_sales with the actor passed
--    in, because a server sync has no logged-in user. public.import_pos_sales is unchanged.
-- 3. public.import_pos_sales_from_pulse: service-role only. Imports, recomputes variance for
--    every synced day, and records the result on the link.

create table public.outlet_pulse_links (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  pulse_client_id uuid not null,
  pulse_client_name text not null check (length(pulse_client_name) between 1 and 200),
  -- Outlet name as written on the till bills in Pulse; null = every outlet of the brand.
  pulse_outlet text check (pulse_outlet is null or length(pulse_outlet) between 1 and 200),
  auto_sync boolean not null default true,
  last_synced_at timestamptz,
  last_sync_ok boolean,
  last_sync_message text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.outlet_pulse_links enable row level security;
revoke all on public.outlet_pulse_links from anon;
revoke truncate, references, trigger on public.outlet_pulse_links from authenticated;

create policy outlet_pulse_links_select on public.outlet_pulse_links for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy outlet_pulse_links_insert on public.outlet_pulse_links for insert to authenticated
  with check (private.is_admin());
create policy outlet_pulse_links_update on public.outlet_pulse_links for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy outlet_pulse_links_delete on public.outlet_pulse_links for delete to authenticated
  using (private.is_admin());

create or replace function private.import_pos_sales_as(
  p_outlet_id uuid,
  p_rows jsonb,
  p_source_name text,
  p_actor uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_n int;
  v_from date;
  v_to date;
  v_import uuid;
  v_saved int;
  v_new int;
  v_units numeric;
  v_revenue numeric;
  v_unmapped jsonb;
begin
  -- No per-user check here: only service-role code reaches this, through
  -- public.import_pos_sales_from_pulse below.
  v_org := private.outlet_org(p_outlet_id);
  if v_org is null then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 20000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
      channel text, quantity numeric, cancelled_quantity numeric, revenue numeric);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  select count(*) into v_n
    from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
      channel text, quantity numeric, cancelled_quantity numeric, revenue numeric)
   where r.business_date is null or r.business_date > v_today or r.business_date < v_today - 400
      or btrim(coalesce(r.pos_name, '')) = '' or length(r.pos_name) > 200
      or r.channel is null or r.channel not in ('dine_in', 'pickup', 'zomato', 'swiggy', 'delivery_other', 'unknown')
      or r.quantity is null or r.quantity < 0 or r.quantity > 1000000
      or coalesce(r.cancelled_quantity, 0) < 0 or coalesce(r.cancelled_quantity, 0) > 1000000
      or (r.revenue is not null and (r.revenue < 0 or r.revenue > 1000000000));
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_rows', 'count', v_n);
  end if;

  select min(r.business_date), max(r.business_date) into v_from, v_to
    from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
      channel text, quantity numeric, cancelled_quantity numeric, revenue numeric);
  if v_to - v_from > 92 then
    return jsonb_build_object('ok', false, 'reason', 'range_too_long');
  end if;

  with src as (
    select btrim(r.pos_name) as pos_name,
           min(nullif(btrim(r.category), '')) as category,
           min(r.business_date) as first_d, max(r.business_date) as last_d
      from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
        channel text, quantity numeric, cancelled_quantity numeric, revenue numeric)
     group by btrim(r.pos_name)
  ), res as (
    insert into public.pos_items as p (organization_id, pos_name, pos_category, first_seen_date, last_seen_date)
    select v_org, s.pos_name, s.category, s.first_d, s.last_d from src s
    on conflict (organization_id, pos_name) do update
      set pos_category = coalesce(excluded.pos_category, p.pos_category),
          first_seen_date = least(coalesce(p.first_seen_date, excluded.first_seen_date), excluded.first_seen_date),
          last_seen_date = greatest(coalesce(p.last_seen_date, excluded.last_seen_date), excluded.last_seen_date)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new from res;

  insert into public.pos_imports (outlet_id, imported_by, source_name, date_from, date_to)
  values (p_outlet_id, p_actor, nullif(btrim(coalesce(p_source_name, '')), ''), v_from, v_to)
  returning id into v_import;

  delete from public.pos_sales_daily
   where outlet_id = p_outlet_id
     and business_date in (
       select distinct r.business_date
         from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
           channel text, quantity numeric, cancelled_quantity numeric, revenue numeric));

  insert into public.pos_sales_daily
    (outlet_id, business_date, pos_item_id, channel, quantity, cancelled_quantity, revenue, import_id)
  select p_outlet_id, r.business_date, p.id, r.channel,
         sum(r.quantity), sum(coalesce(r.cancelled_quantity, 0)), sum(r.revenue), v_import
    from jsonb_to_recordset(p_rows) as r(business_date date, pos_name text, category text,
      channel text, quantity numeric, cancelled_quantity numeric, revenue numeric)
    join public.pos_items p on p.organization_id = v_org and p.pos_name = btrim(r.pos_name)
   group by r.business_date, p.id, r.channel;
  get diagnostics v_saved = row_count;

  select coalesce(sum(s.quantity), 0), sum(s.revenue) into v_units, v_revenue
    from public.pos_sales_daily s where s.import_id = v_import;

  update public.pos_imports
     set row_count = v_saved, units_total = v_units, revenue_total = v_revenue
   where id = v_import;

  select coalesce(jsonb_agg(jsonb_build_object('pos_name', u.pos_name, 'units', u.units) order by u.units desc), '[]'::jsonb)
    into v_unmapped from (
      select p.pos_name, sum(s.quantity) as units
        from public.pos_sales_daily s
        join public.pos_items p on p.id = s.pos_item_id
       where s.import_id = v_import and p.status = 'unmapped'
       group by p.pos_name
       order by sum(s.quantity) desc
       limit 200) u;

  return jsonb_build_object('ok', true, 'import_id', v_import, 'rows_saved', v_saved,
    'date_from', v_from, 'date_to', v_to, 'units', v_units, 'revenue', v_revenue,
    'new_pos_items', v_new, 'unmapped', v_unmapped);
end
$$;

revoke execute on function private.import_pos_sales_as(uuid, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public.import_pos_sales_from_pulse(
  p_outlet_id uuid,
  p_rows jsonb,
  p_source_name text,
  p_actor uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_from date;
  v_to date;
  d date;
  v_days int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    update public.outlet_pulse_links
       set last_synced_at = now(), last_sync_ok = true,
           last_sync_message = 'No new sales in Pulse for this period'
     where outlet_id = p_outlet_id;
    return jsonb_build_object('ok', true, 'rows_saved', 0, 'days_computed', 0);
  end if;

  v_result := private.import_pos_sales_as(p_outlet_id, p_rows, p_source_name, p_actor);

  if coalesce((v_result->>'ok')::boolean, false) then
    v_from := (v_result->>'date_from')::date;
    v_to := (v_result->>'date_to')::date;
    d := v_from;
    while d <= v_to loop
      if private.compute_variance_day(p_outlet_id, d) > 0 then v_days := v_days + 1; end if;
      d := d + 1;
    end loop;
    v_result := v_result || jsonb_build_object('days_computed', v_days);
  end if;

  update public.outlet_pulse_links
     set last_synced_at = now(),
         last_sync_ok = coalesce((v_result->>'ok')::boolean, false),
         last_sync_message = case
           when coalesce((v_result->>'ok')::boolean, false) then
             format('%s rows, %s to %s', v_result->>'rows_saved', v_result->>'date_from', v_result->>'date_to')
           else 'Import refused: ' || coalesce(v_result->>'reason', 'unknown') end
   where outlet_id = p_outlet_id;

  return v_result;
end
$$;

revoke execute on function public.import_pos_sales_from_pulse(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.import_pos_sales_from_pulse(uuid, jsonb, text, uuid) to service_role;
