
-- =====================================================================
-- Phase A + B: catalog, stock counts, goods received, wastage
-- =====================================================================

create type public.stock_count_kind as enum ('opening', 'closing');
create type public.wastage_reason as enum
  ('spoilage', 'prep_waste', 'breakage', 'staff_meal', 'complimentary', 'other');

-- Day of week (0 = Sunday ... 6 = Saturday) on which weekly-frequency items are counted
alter table public.outlets
  add column weekly_count_day int not null default 1,
  add constraint outlets_weekly_count_day_range check (weekly_count_day between 0 and 6);

-- ---------- Catalog (brand level) ----------
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  count_unit text not null,
  order_unit text,
  order_unit_size numeric(12,3) not null default 1 check (order_unit_size > 0),
  cost_per_unit numeric(12,2) check (cost_per_unit is null or cost_per_unit >= 0),
  vendor_id uuid,
  count_frequency text not null default 'daily' check (count_frequency in ('daily', 'weekly')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  constraint inventory_items_vendor_fk foreign key (vendor_id, organization_id)
    references public.vendors (id, organization_id) on delete set null (vendor_id)
);

-- ---------- Per-outlet settings for each item ----------
create table public.outlet_items (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  par_level numeric(12,3) check (par_level is null or par_level >= 0),
  max_level numeric(12,3) check (max_level is null or max_level >= 0),
  lead_time_days int not null default 1 check (lead_time_days between 0 and 60),
  active boolean not null default true,
  primary key (outlet_id, item_id),
  check (max_level is null or par_level is null or max_level >= par_level)
);

-- ---------- Stock counts ----------
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  kind public.stock_count_kind not null,
  business_date date not null,
  staff_id uuid not null references public.staff(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  notes text,
  location_status text not null default 'not_recorded',
  distance_from_outlet_m int,
  location_accuracy_m int,
  constraint stock_counts_location_status_valid check (
    location_status in ('inside','outside','low_accuracy','denied','unavailable','not_configured','not_recorded'))
);

create table public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity >= 0),
  note text,
  unique (count_id, item_id)
);

-- ---------- Goods received ----------
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  vendor_name text not null,
  invoice_ref text,
  photo_path text,
  staff_id uuid not null references public.staff(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  notes text,
  location_status text not null default 'not_recorded',
  distance_from_outlet_m int,
  location_accuracy_m int,
  constraint stock_receipts_location_status_valid check (
    location_status in ('inside','outside','low_accuracy','denied','unavailable','not_configured','not_recorded'))
);

create table public.stock_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_receipts(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  note text,
  unique (receipt_id, item_id)
);

-- ---------- Wastage ----------
create table public.wastage_entries (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  reason public.wastage_reason not null,
  note text,
  photo_path text,
  staff_id uuid not null references public.staff(id),
  submitted_by uuid references auth.users(id) on delete set null,
  logged_at timestamptz not null default now(),
  location_status text not null default 'not_recorded',
  distance_from_outlet_m int,
  location_accuracy_m int,
  constraint wastage_location_status_valid check (
    location_status in ('inside','outside','low_accuracy','denied','unavailable','not_configured','not_recorded'))
);

-- ---------- Indexes ----------
create index on public.vendors (organization_id);
create index on public.inventory_items (organization_id);
create index on public.inventory_items (vendor_id);
create index on public.outlet_items (item_id);
create index on public.stock_counts (outlet_id, business_date, kind);
create index on public.stock_counts (staff_id);
create index on public.stock_counts (submitted_by);
create index on public.stock_count_lines (count_id);
create index on public.stock_count_lines (item_id);
create index on public.stock_receipts (outlet_id, business_date);
create index on public.stock_receipts (vendor_id);
create index on public.stock_receipts (staff_id);
create index on public.stock_receipts (submitted_by);
create index on public.stock_receipt_lines (receipt_id);
create index on public.stock_receipt_lines (item_id);
create index on public.wastage_entries (outlet_id, business_date);
create index on public.wastage_entries (item_id);
create index on public.wastage_entries (staff_id);
create index on public.wastage_entries (submitted_by);

-- ---------- Private helpers ----------
create or replace function private.can_edit_catalog(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select p.role = 'peerco_admin'
        or (p.role in ('owner', 'manager') and p.organization_id = p_org)
    from public.profiles p where p.id = (select auth.uid())
  ), false)
$$;

create or replace function private.count_outlet(p_count uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select c.outlet_id from public.stock_counts c where c.id = p_count $$;

create or replace function private.receipt_outlet(p_receipt uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select r.outlet_id from public.stock_receipts r where r.id = p_receipt $$;

-- An outlet may only stock items from its own brand's catalog
create or replace function private.outlet_items_same_org()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.outlet_org(new.outlet_id) is distinct from
     (select i.organization_id from public.inventory_items i where i.id = new.item_id) then
    raise exception 'item and outlet belong to different brands' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger outlet_items_same_org
  before insert or update of outlet_id, item_id on public.outlet_items
  for each row execute function private.outlet_items_same_org();

-- PIN check with lockout. Returns jsonb instead of raising so the attempt counter is committed.
create or replace function private.verify_staff_pin(p_outlet uuid, p_staff uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
begin
  select * into v_staff from public.staff s
   where s.id = p_staff and s.outlet_id = p_outlet
   for update;

  if not found or v_staff.active is not true then
    return jsonb_build_object('ok', false, 'reason', 'invalid_staff');
  end if;

  if v_staff.locked_until is not null and v_staff.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_staff.locked_until);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_staff.pin_hash) <> v_staff.pin_hash then
    update public.staff
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' else locked_until end
     where id = v_staff.id;
    return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  end if;

  update public.staff set failed_attempts = 0, locked_until = null where id = v_staff.id;
  return jsonb_build_object('ok', true);
end
$$;

-- Same location logic as checklists: flags only, never blocks
create or replace function private.evaluate_location(
  p_outlet uuid, p_location jsonb, out status text, out dist int, out acc int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  o_lat double precision;
  o_lng double precision;
  o_rad int;
begin
  status := 'not_recorded';
  dist := null;
  acc := null;

  if p_location is null or jsonb_typeof(p_location) <> 'object' then
    return;
  end if;

  begin
    v_lat := (p_location ->> 'lat')::double precision;
    v_lng := (p_location ->> 'lng')::double precision;
    acc := round((p_location ->> 'accuracy')::numeric)::int;
  exception when others then
    v_lat := null;
    v_lng := null;
    acc := null;
  end;

  if acc is not null and acc < 0 then
    acc := null;
  end if;

  if v_lat is null or v_lng is null
     or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    status := case when p_location ->> 'error' = 'denied' then 'denied' else 'unavailable' end;
    acc := null;
    return;
  end if;

  select o.latitude, o.longitude, o.geofence_radius_m into o_lat, o_lng, o_rad
    from public.outlets o where o.id = p_outlet;

  if o_lat is null or o_lng is null then
    status := 'not_configured';
    return;
  end if;

  dist := round(6371000 * 2 * asin(least(1, sqrt(
    power(sin(radians(v_lat - o_lat) / 2), 2)
    + cos(radians(o_lat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - o_lng) / 2), 2)
  ))))::int;

  if acc is not null and acc > 300 then
    status := 'low_accuracy';
  elsif dist - coalesce(acc, 0) <= o_rad then
    status := 'inside';
  else
    status := 'outside';
  end if;
end
$$;

-- A photo path must be in this outlet's folder and point at a real uploaded file
create or replace function private.photo_ok(p_outlet uuid, p_path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_path like p_outlet::text || '/%'
     and exists (select 1 from storage.objects o
                  where o.bucket_id = 'checklist-photos' and o.name = p_path)
$$;

-- Items to be counted at an outlet on a given date (weekly items only on the outlet's weekly day)
create or replace function private.count_sheet_items(p_outlet uuid, p_date date)
returns table (item_id uuid, name text, category text, unit text)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.name, i.category, i.count_unit
    from public.outlet_items oi
    join public.inventory_items i on i.id = oi.item_id
    join public.outlets o on o.id = oi.outlet_id
   where oi.outlet_id = p_outlet
     and oi.active
     and i.active
     and (i.count_frequency = 'daily'
          or (i.count_frequency = 'weekly' and extract(dow from p_date)::int = o.weekly_count_day))
   order by coalesce(i.category, ''), i.name
$$;

revoke execute on function private.can_edit_catalog(uuid) from public, anon;
revoke execute on function private.count_outlet(uuid) from public, anon;
revoke execute on function private.receipt_outlet(uuid) from public, anon;
grant execute on function private.can_edit_catalog(uuid) to authenticated;
grant execute on function private.count_outlet(uuid) to authenticated;
grant execute on function private.receipt_outlet(uuid) to authenticated;

revoke execute on function private.outlet_items_same_org() from public, anon, authenticated;
revoke execute on function private.verify_staff_pin(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.evaluate_location(uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.photo_ok(uuid, text) from public, anon, authenticated;
revoke execute on function private.count_sheet_items(uuid, date) from public, anon, authenticated;

-- ---------- Table privileges ----------
revoke all on public.vendors, public.inventory_items, public.outlet_items,
  public.stock_counts, public.stock_count_lines, public.stock_receipts,
  public.stock_receipt_lines, public.wastage_entries from anon;
revoke truncate, references, trigger on public.vendors, public.inventory_items, public.outlet_items,
  public.stock_counts, public.stock_count_lines, public.stock_receipts,
  public.stock_receipt_lines, public.wastage_entries from authenticated;
-- Stock entries are written only through the PIN functions below
revoke insert, update, delete on public.stock_counts, public.stock_count_lines,
  public.stock_receipts, public.stock_receipt_lines, public.wastage_entries from authenticated;

-- ---------- Row-level security ----------
alter table public.vendors enable row level security;
alter table public.inventory_items enable row level security;
alter table public.outlet_items enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_lines enable row level security;
alter table public.wastage_entries enable row level security;

create policy vendors_select on public.vendors for select to authenticated
  using (private.can_edit_catalog(organization_id));
create policy vendors_insert on public.vendors for insert to authenticated
  with check (private.can_edit_catalog(organization_id));
create policy vendors_update on public.vendors for update to authenticated
  using (private.can_edit_catalog(organization_id)) with check (private.can_edit_catalog(organization_id));
create policy vendors_delete on public.vendors for delete to authenticated
  using (private.can_edit_catalog(organization_id));

create policy items_catalog_select on public.inventory_items for select to authenticated
  using (private.can_edit_catalog(organization_id));
create policy items_catalog_insert on public.inventory_items for insert to authenticated
  with check (private.can_edit_catalog(organization_id));
create policy items_catalog_update on public.inventory_items for update to authenticated
  using (private.can_edit_catalog(organization_id)) with check (private.can_edit_catalog(organization_id));
create policy items_catalog_delete on public.inventory_items for delete to authenticated
  using (private.can_edit_catalog(organization_id));

create policy outlet_items_select on public.outlet_items for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy outlet_items_insert on public.outlet_items for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy outlet_items_update on public.outlet_items for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy outlet_items_delete on public.outlet_items for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

create policy stock_counts_select on public.stock_counts for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy stock_count_lines_select on public.stock_count_lines for select to authenticated
  using (private.can_manage_outlet(private.count_outlet(count_id)));
create policy stock_receipts_select on public.stock_receipts for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy stock_receipt_lines_select on public.stock_receipt_lines for select to authenticated
  using (private.can_manage_outlet(private.receipt_outlet(receipt_id)));
create policy wastage_select on public.wastage_entries for select to authenticated
  using (private.can_manage_outlet(outlet_id));

-- ---------- Tablet-facing read functions (names and units only: counts stay blind) ----------
create or replace function public.get_count_sheet(p_outlet_id uuid, p_business_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_date date := coalesce(p_business_date, (now() at time zone 'Asia/Kolkata')::date);
begin
  if not private.can_access_outlet(p_outlet_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_date < v_today - 1 or v_date > v_today then
    raise exception 'date out of range' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'item_id', s.item_id, 'name', s.name, 'category', s.category, 'unit', s.unit)
           order by coalesce(s.category, ''), s.name)
      from private.count_sheet_items(p_outlet_id, v_date) s
  ), '[]'::jsonb);
end
$$;

create or replace function public.get_entry_lists(p_outlet_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not private.can_access_outlet(p_outlet_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_org := private.outlet_org(p_outlet_id);
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', i.id, 'name', i.name, 'category', i.category, 'unit', i.count_unit)
             order by coalesce(i.category, ''), i.name)
        from public.outlet_items oi
        join public.inventory_items i on i.id = oi.item_id
       where oi.outlet_id = p_outlet_id and oi.active and i.active
    ), '[]'::jsonb),
    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object('vendor_id', v.id, 'name', v.name) order by v.name)
        from public.vendors v
       where v.organization_id = v_org and v.active
    ), '[]'::jsonb),
    'wastage_reasons', jsonb_build_array(
      'spoilage', 'prep_waste', 'breakage', 'staff_meal', 'complimentary', 'other')
  );
end
$$;

-- ---------- Stock count ----------
create or replace function public.submit_stock_count(
  p_outlet_id uuid,
  p_kind public.stock_count_kind,
  p_staff_id uuid,
  p_pin text,
  p_business_date date,
  p_lines jsonb,
  p_notes text default null,
  p_location jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_pin jsonb;
  v_n int;
  v_loc record;
  v_count uuid;
begin
  if not private.can_access_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  if p_business_date is null or p_business_date < v_today - 1 or p_business_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text)
   where l.item_id is null or l.quantity is null or l.quantity < 0 or l.quantity > 1000000;
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_quantity', 'count', v_n);
  end if;

  select count(*) - count(distinct l.item_id) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_item', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text)
   where not exists (
     select 1 from private.count_sheet_items(p_outlet_id, p_business_date) s where s.item_id = l.item_id);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'count', v_n);
  end if;

  select count(*) into v_n
    from private.count_sheet_items(p_outlet_id, p_business_date) s
   where not exists (
     select 1 from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text)
      where l.item_id = s.item_id);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'incomplete', 'count', v_n);
  end if;

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin);
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.stock_counts
    (outlet_id, kind, business_date, staff_id, submitted_by, notes,
     location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (p_outlet_id, p_kind, p_business_date, p_staff_id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''),
     v_loc.status, v_loc.dist, v_loc.acc)
  returning id into v_count;

  insert into public.stock_count_lines (count_id, item_id, item_name, unit, quantity, note)
  select v_count, s.item_id, s.name, s.unit, l.quantity, nullif(btrim(coalesce(l.note, '')), '')
    from private.count_sheet_items(p_outlet_id, p_business_date) s
    join jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text)
      on l.item_id = s.item_id;

  return jsonb_build_object('ok', true, 'count_id', v_count, 'location_status', v_loc.status);
end
$$;

-- ---------- Goods received ----------
create or replace function public.submit_receipt(
  p_outlet_id uuid,
  p_staff_id uuid,
  p_pin text,
  p_business_date date,
  p_vendor_id uuid,
  p_invoice_ref text,
  p_lines jsonb,
  p_notes text default null,
  p_photo_path text default null,
  p_location jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_pin jsonb;
  v_n int;
  v_vendor_name text;
  v_loc record;
  v_receipt uuid;
begin
  if not private.can_access_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_lines)
      as l(item_id uuid, quantity numeric, unit_cost numeric, note text);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  if p_business_date is null or p_business_date < v_today - 1 or p_business_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select v.name into v_vendor_name from public.vendors v
   where v.id = p_vendor_id and v.active
     and v.organization_id = private.outlet_org(p_outlet_id);
  if v_vendor_name is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_vendor');
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text)
   where l.item_id is null or l.quantity is null or l.quantity <= 0 or l.quantity > 1000000
      or (l.unit_cost is not null and (l.unit_cost < 0 or l.unit_cost > 10000000));
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_quantity', 'count', v_n);
  end if;

  select count(*) - count(distinct l.item_id) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_item', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text)
   where not exists (
     select 1 from public.outlet_items oi
       join public.inventory_items i on i.id = oi.item_id
      where oi.outlet_id = p_outlet_id and oi.item_id = l.item_id and oi.active and i.active);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'count', v_n);
  end if;

  if btrim(coalesce(p_photo_path, '')) <> '' and not private.photo_ok(p_outlet_id, p_photo_path) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo');
  end if;

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin);
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.stock_receipts
    (outlet_id, business_date, vendor_id, vendor_name, invoice_ref, photo_path,
     staff_id, submitted_by, notes, location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (p_outlet_id, p_business_date, p_vendor_id, v_vendor_name,
     nullif(btrim(coalesce(p_invoice_ref, '')), ''),
     nullif(btrim(coalesce(p_photo_path, '')), ''),
     p_staff_id, (select auth.uid()), nullif(btrim(coalesce(p_notes, '')), ''),
     v_loc.status, v_loc.dist, v_loc.acc)
  returning id into v_receipt;

  insert into public.stock_receipt_lines (receipt_id, item_id, item_name, unit, quantity, unit_cost, note)
  select v_receipt, i.id, i.name, i.count_unit, l.quantity, l.unit_cost,
         nullif(btrim(coalesce(l.note, '')), '')
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text)
    join public.inventory_items i on i.id = l.item_id;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'location_status', v_loc.status);
end
$$;

-- ---------- Wastage ----------
create or replace function public.log_wastage(
  p_outlet_id uuid,
  p_staff_id uuid,
  p_pin text,
  p_business_date date,
  p_entries jsonb,
  p_location jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_pin jsonb;
  v_n int;
  v_loc record;
  v_rows int;
begin
  if not private.can_access_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_entries is null or jsonb_typeof(p_entries) is distinct from 'array'
     or jsonb_array_length(p_entries) = 0 or jsonb_array_length(p_entries) > 50 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_entries)
      as e(item_id uuid, quantity numeric, reason text, note text, photo_path text);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  if p_business_date is null or p_business_date < v_today - 1 or p_business_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
   where e.item_id is null or e.quantity is null or e.quantity <= 0 or e.quantity > 1000000;
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_quantity', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
   where e.reason is null
      or e.reason not in ('spoilage', 'prep_waste', 'breakage', 'staff_meal', 'complimentary', 'other');
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
   where e.reason = 'other' and btrim(coalesce(e.note, '')) = '';
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'note_required', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
   where not exists (
     select 1 from public.outlet_items oi
       join public.inventory_items i on i.id = oi.item_id
      where oi.outlet_id = p_outlet_id and oi.item_id = e.item_id and oi.active and i.active);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'count', v_n);
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
   where btrim(coalesce(e.photo_path, '')) <> '' and not private.photo_ok(p_outlet_id, e.photo_path);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo', 'count', v_n);
  end if;

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin);
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.wastage_entries
    (outlet_id, business_date, item_id, item_name, unit, quantity, reason, note, photo_path,
     staff_id, submitted_by, location_status, distance_from_outlet_m, location_accuracy_m)
  select p_outlet_id, p_business_date, i.id, i.name, i.count_unit, e.quantity, e.reason::public.wastage_reason,
         nullif(btrim(coalesce(e.note, '')), ''), nullif(btrim(coalesce(e.photo_path, '')), ''),
         p_staff_id, (select auth.uid()), v_loc.status, v_loc.dist, v_loc.acc
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
    join public.inventory_items i on i.id = e.item_id;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'entries', v_rows, 'location_status', v_loc.status);
end
$$;

-- ---------- Function privileges ----------
revoke execute on function public.get_count_sheet(uuid, date) from public, anon;
revoke execute on function public.get_entry_lists(uuid) from public, anon;
revoke execute on function public.submit_stock_count(uuid, public.stock_count_kind, uuid, text, date, jsonb, text, jsonb) from public, anon;
revoke execute on function public.submit_receipt(uuid, uuid, text, date, uuid, text, jsonb, text, text, jsonb) from public, anon;
revoke execute on function public.log_wastage(uuid, uuid, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.get_count_sheet(uuid, date) to authenticated;
grant execute on function public.get_entry_lists(uuid) to authenticated;
grant execute on function public.submit_stock_count(uuid, public.stock_count_kind, uuid, text, date, jsonb, text, jsonb) to authenticated;
grant execute on function public.submit_receipt(uuid, uuid, text, date, uuid, text, jsonb, text, text, jsonb) to authenticated;
grant execute on function public.log_wastage(uuid, uuid, text, date, jsonb, jsonb) to authenticated;
