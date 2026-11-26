
-- =====================================================================
-- Phase C: recipes, POS name mapping, sales import, variance + acknowledge
-- =====================================================================

-- ---------- Extend catalog / outlet settings ----------
alter table public.inventory_items
  add column recipe_unit text,
  add column recipe_factor numeric(12,3) not null default 1,
  add constraint inventory_items_recipe_unit_valid check (recipe_unit is null or recipe_unit in ('g', 'ml', 'pcs')),
  add constraint inventory_items_recipe_factor_positive check (recipe_factor > 0),
  add constraint inventory_items_id_org_key unique (id, organization_id);

alter table public.outlet_items
  add column track_variance boolean not null default true,
  add column variance_tolerance_pct numeric(6,2) not null default 5,
  add column variance_tolerance_qty numeric(12,3) not null default 0,
  add constraint outlet_items_tolerance_pct_range check (variance_tolerance_pct between 0 and 100),
  add constraint outlet_items_tolerance_qty_nonneg check (variance_tolerance_qty >= 0);

-- ---------- Recipes ----------
create table public.menu_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  batch_yield numeric(12,3) not null default 1 check (batch_yield > 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  recipe_id uuid not null,
  item_id uuid not null,
  quantity numeric(14,4) not null check (quantity > 0),   -- in the ingredient's recipe unit (g, ml or pcs), for the whole batch
  note text,
  unique (recipe_id, item_id),
  constraint recipe_lines_recipe_fk foreign key (recipe_id, organization_id)
    references public.menu_recipes (id, organization_id) on delete cascade,
  constraint recipe_lines_item_fk foreign key (item_id, organization_id)
    references public.inventory_items (id, organization_id)
);

-- ---------- POS item names and their mapping to recipes ----------
create table public.pos_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pos_name text not null,
  pos_category text,
  recipe_id uuid,
  portion numeric(10,4) not null default 1 check (portion > 0),
  status text not null default 'unmapped' check (status in ('unmapped', 'mapped', 'ignored')),
  notes text,
  first_seen_date date,
  last_seen_date date,
  created_at timestamptz not null default now(),
  unique (organization_id, pos_name),
  unique (id, organization_id),
  constraint pos_items_recipe_fk foreign key (recipe_id, organization_id)
    references public.menu_recipes (id, organization_id),
  constraint pos_items_status_matches_recipe check ((status = 'mapped') = (recipe_id is not null))
);

-- ---------- POS sales (aggregated per day; no customer data is ever stored) ----------
create table public.pos_imports (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  source_name text,
  date_from date not null,
  date_to date not null,
  row_count int not null default 0,
  units_total numeric(14,3) not null default 0,
  revenue_total numeric(16,2)
);

create table public.pos_sales_daily (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  pos_item_id uuid not null references public.pos_items(id),
  channel text not null check (channel in ('dine_in', 'pickup', 'zomato', 'swiggy', 'delivery_other', 'unknown')),
  quantity numeric(12,3) not null check (quantity >= 0),
  cancelled_quantity numeric(12,3) not null default 0 check (cancelled_quantity >= 0),
  revenue numeric(14,2) check (revenue is null or revenue >= 0),
  import_id uuid references public.pos_imports(id) on delete set null,
  unique (outlet_id, business_date, pos_item_id, channel)
);

-- ---------- Variance results with acknowledge workflow ----------
create table public.variance_results (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  business_date date not null,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  unit text not null,
  opening_qty numeric(14,3),
  opening_source text check (opening_source in ('opening_count', 'previous_closing')),
  received_qty numeric(14,3) not null default 0,
  closing_qty numeric(14,3),
  actual_usage_qty numeric(14,3),
  sold_usage_qty numeric(14,3) not null default 0,
  wastage_qty numeric(14,3) not null default 0,
  gap_before_wastage_qty numeric(14,3),
  variance_qty numeric(14,3),
  tolerance_qty numeric(14,3),
  cost_per_unit numeric(12,2),
  variance_value numeric(14,2),
  overnight_gap_qty numeric(14,3),
  status text not null check (status in ('ok', 'explained', 'shortage', 'surplus', 'missing_count', 'missing_sales', 'no_recipe')),
  ack_status text not null default 'not_required' check (ack_status in ('not_required', 'open', 'acknowledged')),
  ack_reason text check (ack_reason is null or ack_reason in
    ('counting_error', 'recipe_needs_update', 'portion_drift', 'uncounted_wastage',
     'comp_or_staff_meal', 'short_delivery', 'unexplained_loss', 'other')),
  ack_note text,
  ack_by uuid references auth.users(id) on delete set null,
  ack_by_name text,
  ack_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (outlet_id, business_date, item_id)
);

-- ---------- Indexes ----------
create index on public.menu_recipes (organization_id);
create index on public.recipe_lines (recipe_id);
create index on public.recipe_lines (item_id, organization_id);
create index on public.pos_items (organization_id);
create index on public.pos_items (recipe_id);
create index on public.pos_imports (outlet_id, imported_at);
create index on public.pos_imports (imported_by);
create index on public.pos_sales_daily (outlet_id, business_date);
create index on public.pos_sales_daily (pos_item_id);
create index on public.pos_sales_daily (import_id);
create index on public.variance_results (outlet_id, business_date);
create index on public.variance_results (item_id);
create index on public.variance_results (ack_by);

-- ---------- Private helpers ----------
create or replace function private.unit_factor(p_recipe_unit text, p_count_unit text)
returns numeric
language sql immutable set search_path = ''
as $$
  select case
    when p_recipe_unit = 'g'   and p_count_unit = 'kg' then 1000
    when p_recipe_unit = 'g'   and p_count_unit = 'g'  then 1
    when p_recipe_unit = 'ml'  and p_count_unit = 'l'  then 1000
    when p_recipe_unit = 'ml'  and p_count_unit = 'ml' then 1
    when p_recipe_unit = 'pcs' and p_count_unit = 'pcs' then 1
    else null
  end::numeric
$$;

create or replace function private.recipe_lines_prepare()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.organization_id is null then
    new.organization_id := (select r.organization_id from public.menu_recipes r where r.id = new.recipe_id);
  end if;
  if (select i.recipe_unit from public.inventory_items i where i.id = new.item_id) is null then
    raise exception 'ingredient has no recipe unit' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger recipe_lines_prepare
  before insert or update of item_id, recipe_id on public.recipe_lines
  for each row execute function private.recipe_lines_prepare();

-- Variance for one outlet and one day. Upserts rows; acknowledgements are preserved.
create or replace function private.compute_variance_day(p_outlet uuid, p_date date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_has_sales boolean;
  v_has_counts boolean;
  v_rows int;
begin
  select exists (select 1 from public.pos_sales_daily s
                  where s.outlet_id = p_outlet and s.business_date = p_date) into v_has_sales;
  select exists (select 1 from public.stock_counts c
                  where c.outlet_id = p_outlet and c.business_date = p_date) into v_has_counts;

  if not v_has_sales and not v_has_counts then
    return 0;
  end if;

  with items as (
    select oi.item_id, i.name, i.count_unit, i.cost_per_unit, i.recipe_factor,
           oi.variance_tolerance_pct as pct, oi.variance_tolerance_qty as tqty
      from public.outlet_items oi
      join public.inventory_items i on i.id = oi.item_id
     where oi.outlet_id = p_outlet and oi.active and i.active and oi.track_variance
  ),
  open_cnt as (
    select distinct on (l.item_id) l.item_id, l.quantity
      from public.stock_count_lines l
      join public.stock_counts c on c.id = l.count_id
     where c.outlet_id = p_outlet and c.business_date = p_date and c.kind = 'opening' and l.item_id is not null
     order by l.item_id, c.submitted_at desc
  ),
  close_cnt as (
    select distinct on (l.item_id) l.item_id, l.quantity
      from public.stock_count_lines l
      join public.stock_counts c on c.id = l.count_id
     where c.outlet_id = p_outlet and c.business_date = p_date and c.kind = 'closing' and l.item_id is not null
     order by l.item_id, c.submitted_at desc
  ),
  prev_close as (
    select distinct on (l.item_id) l.item_id, l.quantity
      from public.stock_count_lines l
      join public.stock_counts c on c.id = l.count_id
     where c.outlet_id = p_outlet and c.business_date = p_date - 1 and c.kind = 'closing' and l.item_id is not null
     order by l.item_id, c.submitted_at desc
  ),
  recv as (
    select l.item_id, sum(l.quantity) as q
      from public.stock_receipt_lines l
      join public.stock_receipts r on r.id = l.receipt_id
     where r.outlet_id = p_outlet and r.business_date = p_date and l.item_id is not null
     group by l.item_id
  ),
  waste as (
    select w.item_id, sum(w.quantity) as q
      from public.wastage_entries w
     where w.outlet_id = p_outlet and w.business_date = p_date and w.item_id is not null
     group by w.item_id
  ),
  sold as (
    select rl.item_id,
           sum(s.quantity * p.portion * rl.quantity / r.batch_yield / i.recipe_factor) as q
      from public.pos_sales_daily s
      join public.pos_items p on p.id = s.pos_item_id and p.status = 'mapped'
      join public.menu_recipes r on r.id = p.recipe_id and r.active
      join public.recipe_lines rl on rl.recipe_id = r.id
      join public.inventory_items i on i.id = rl.item_id
     where s.outlet_id = p_outlet and s.business_date = p_date
     group by rl.item_id
  ),
  in_recipe as (
    select distinct rl.item_id
      from public.recipe_lines rl
      join public.menu_recipes r on r.id = rl.recipe_id and r.active
      join public.pos_items p on p.recipe_id = r.id and p.status = 'mapped'
  ),
  calc as (
    select it.item_id, it.name, it.count_unit, it.cost_per_unit, it.pct, it.tqty,
           coalesce(o.quantity, pc.quantity) as opening_qty,
           case when o.item_id is not null then 'opening_count'
                when pc.item_id is not null then 'previous_closing' end as opening_source,
           coalesce(rv.q, 0) as received_qty,
           c.quantity as closing_qty,
           coalesce(w.q, 0) as wastage_qty,
           coalesce(sd.q, 0) as sold_qty,
           (ir.item_id is not null) as has_recipe,
           case when o.item_id is not null and pc.item_id is not null then o.quantity - pc.quantity end as overnight_gap
      from items it
      left join open_cnt o on o.item_id = it.item_id
      left join prev_close pc on pc.item_id = it.item_id
      left join close_cnt c on c.item_id = it.item_id
      left join recv rv on rv.item_id = it.item_id
      left join waste w on w.item_id = it.item_id
      left join sold sd on sd.item_id = it.item_id
      left join in_recipe ir on ir.item_id = it.item_id
  ),
  calc2 as (
    select calc.*,
           case when opening_qty is not null and closing_qty is not null
                then opening_qty + received_qty - closing_qty end as actual_qty
      from calc
  ),
  calc3 as (
    select calc2.*,
           case when actual_qty is not null then actual_qty - sold_qty end as gap_qty,
           case when actual_qty is not null then actual_qty - sold_qty - wastage_qty end as var_qty,
           greatest(pct / 100.0 * (sold_qty + wastage_qty), tqty) as tol_qty
      from calc2
  ),
  calc4 as (
    select calc3.*,
           case
             when not has_recipe then 'no_recipe'
             when actual_qty is null then 'missing_count'
             when not v_has_sales then 'missing_sales'
             when abs(gap_qty) <= tol_qty then 'ok'
             when abs(var_qty) <= tol_qty then 'explained'
             when var_qty > 0 then 'shortage'
             else 'surplus'
           end as status
      from calc3
  )
  insert into public.variance_results as v
    (outlet_id, business_date, item_id, item_name, unit, opening_qty, opening_source, received_qty,
     closing_qty, actual_usage_qty, sold_usage_qty, wastage_qty, gap_before_wastage_qty, variance_qty,
     tolerance_qty, cost_per_unit, variance_value, overnight_gap_qty, status, ack_status, computed_at)
  select p_outlet, p_date, item_id, name, count_unit, opening_qty, opening_source, received_qty,
         closing_qty, actual_qty, sold_qty, wastage_qty, gap_qty, var_qty,
         tol_qty, cost_per_unit,
         case when cost_per_unit is null or var_qty is null then null else round(var_qty * cost_per_unit, 2) end,
         overnight_gap, status,
         case when status in ('shortage', 'surplus') then 'open' else 'not_required' end,
         now()
    from calc4
  on conflict (outlet_id, business_date, item_id) do update set
    item_name = excluded.item_name,
    unit = excluded.unit,
    opening_qty = excluded.opening_qty,
    opening_source = excluded.opening_source,
    received_qty = excluded.received_qty,
    closing_qty = excluded.closing_qty,
    actual_usage_qty = excluded.actual_usage_qty,
    sold_usage_qty = excluded.sold_usage_qty,
    wastage_qty = excluded.wastage_qty,
    gap_before_wastage_qty = excluded.gap_before_wastage_qty,
    variance_qty = excluded.variance_qty,
    tolerance_qty = excluded.tolerance_qty,
    cost_per_unit = excluded.cost_per_unit,
    variance_value = excluded.variance_value,
    overnight_gap_qty = excluded.overnight_gap_qty,
    status = excluded.status,
    ack_status = case
      when v.ack_status = 'acknowledged' then 'acknowledged'
      when excluded.status in ('shortage', 'surplus') then 'open'
      else 'not_required'
    end,
    computed_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end
$$;

revoke execute on function private.unit_factor(text, text) from public, anon, authenticated;
revoke execute on function private.recipe_lines_prepare() from public, anon, authenticated;
revoke execute on function private.compute_variance_day(uuid, date) from public, anon, authenticated;

-- ---------- Table privileges ----------
revoke all on public.menu_recipes, public.recipe_lines, public.pos_items, public.pos_imports,
  public.pos_sales_daily, public.variance_results from anon;
revoke truncate, references, trigger on public.menu_recipes, public.recipe_lines, public.pos_items,
  public.pos_imports, public.pos_sales_daily, public.variance_results from authenticated;
revoke insert, update, delete on public.pos_imports, public.pos_sales_daily, public.variance_results from authenticated;

-- ---------- Row-level security ----------
alter table public.menu_recipes enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.pos_items enable row level security;
alter table public.pos_imports enable row level security;
alter table public.pos_sales_daily enable row level security;
alter table public.variance_results enable row level security;

create policy recipes_select on public.menu_recipes for select to authenticated
  using (private.can_edit_catalog(organization_id));
create policy recipes_insert on public.menu_recipes for insert to authenticated
  with check (private.can_edit_catalog(organization_id));
create policy recipes_update on public.menu_recipes for update to authenticated
  using (private.can_edit_catalog(organization_id)) with check (private.can_edit_catalog(organization_id));
create policy recipes_delete on public.menu_recipes for delete to authenticated
  using (private.can_edit_catalog(organization_id));

create policy recipe_lines_select on public.recipe_lines for select to authenticated
  using (private.can_edit_catalog(organization_id));
create policy recipe_lines_insert on public.recipe_lines for insert to authenticated
  with check (private.can_edit_catalog(organization_id));
create policy recipe_lines_update on public.recipe_lines for update to authenticated
  using (private.can_edit_catalog(organization_id)) with check (private.can_edit_catalog(organization_id));
create policy recipe_lines_delete on public.recipe_lines for delete to authenticated
  using (private.can_edit_catalog(organization_id));

create policy pos_items_select on public.pos_items for select to authenticated
  using (private.can_edit_catalog(organization_id));
create policy pos_items_insert on public.pos_items for insert to authenticated
  with check (private.can_edit_catalog(organization_id));
create policy pos_items_update on public.pos_items for update to authenticated
  using (private.can_edit_catalog(organization_id)) with check (private.can_edit_catalog(organization_id));
create policy pos_items_delete on public.pos_items for delete to authenticated
  using (private.can_edit_catalog(organization_id));

create policy pos_imports_select on public.pos_imports for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy pos_sales_select on public.pos_sales_daily for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy variance_select on public.variance_results for select to authenticated
  using (private.can_manage_outlet(outlet_id));

-- ---------- Import the chef's recipe workbook (atomic) ----------
create or replace function public.import_recipe_workbook(
  p_organization_id uuid,
  p_ingredients jsonb,
  p_recipes jsonb,
  p_dishes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_txt text;
  v_dishes jsonb := coalesce(p_dishes, '[]'::jsonb);
  v_ing_created int := 0;
  v_ing_updated int := 0;
  v_rec_created int := 0;
  v_rec_updated int := 0;
  v_lines int := 0;
  v_mapped int := 0;
  v_unmapped int := 0;
  v_needs_portion jsonb;
  v_not_ready jsonb;
begin
  if not private.can_edit_catalog(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array'
     or p_recipes is null or jsonb_typeof(p_recipes) <> 'array'
     or jsonb_typeof(v_dishes) <> 'array'
     or jsonb_array_length(p_recipes) = 0 or jsonb_array_length(p_recipes) > 500
     or jsonb_array_length(p_ingredients) > 500 or jsonb_array_length(v_dishes) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text);
    perform 1 from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb);
    perform 1 from jsonb_to_recordset(v_dishes) as d(pos_name text, recipe_name text, portion numeric);
    perform 1 from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
      cross join lateral jsonb_to_recordset(case when jsonb_typeof(r.lines) = 'array' then r.lines else '[]'::jsonb end)
        as l(ingredient text, quantity numeric);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  -- 1. ingredient rows
  select string_agg(distinct coalesce(nullif(btrim(x.name), ''), '(blank name)'), ', ') into v_txt
    from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text)
    left join public.inventory_items e
      on e.organization_id = p_organization_id and lower(e.name) = lower(btrim(x.name))
   where btrim(coalesce(x.name, '')) = ''
      or x.recipe_unit is null or x.recipe_unit not in ('g', 'ml', 'pcs')
      or (e.id is null and (x.count_unit is null or x.count_unit not in ('kg', 'g', 'l', 'ml', 'pcs')));
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'bad_ingredient', 'detail', v_txt);
  end if;

  select string_agg(distinct x.name, ', ') into v_txt
    from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text)
    left join public.inventory_items e
      on e.organization_id = p_organization_id and lower(e.name) = lower(btrim(x.name))
   where x.recipe_unit in ('g', 'ml', 'pcs')
     and private.unit_factor(x.recipe_unit, coalesce(e.count_unit, x.count_unit)) is null;
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'unit_mismatch', 'detail', v_txt);
  end if;

  -- 2. recipes
  select string_agg(distinct coalesce(nullif(btrim(r.name), ''), '(blank name)'), ', ') into v_txt
    from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
   where btrim(coalesce(r.name, '')) = '' or r.batch_yield is null or r.batch_yield <= 0 or r.batch_yield > 100000
      or jsonb_typeof(r.lines) is distinct from 'array' or jsonb_array_length(r.lines) = 0;
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'bad_recipe', 'detail', v_txt);
  end if;

  select string_agg(n, ', ') into v_txt from (
    select lower(btrim(r.name)) as n
      from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
     group by lower(btrim(r.name)) having count(*) > 1) d;
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'duplicate_recipe', 'detail', v_txt);
  end if;

  select string_agg(distinct l.ingredient, ', ') into v_txt
    from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
    cross join lateral jsonb_to_recordset(case when jsonb_typeof(r.lines) = 'array' then r.lines else '[]'::jsonb end)
      as l(ingredient text, quantity numeric)
   where not exists (
           select 1 from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text)
            where lower(btrim(x.name)) = lower(btrim(l.ingredient)))
     and not exists (
           select 1 from public.inventory_items e
            where e.organization_id = p_organization_id
              and lower(e.name) = lower(btrim(l.ingredient)) and e.recipe_unit is not null);
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'unknown_ingredient', 'detail', v_txt);
  end if;

  select string_agg(distinct r.name, ', ') into v_txt
    from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
    cross join lateral jsonb_to_recordset(case when jsonb_typeof(r.lines) = 'array' then r.lines else '[]'::jsonb end)
      as l(ingredient text, quantity numeric)
   where l.quantity is null or l.quantity <= 0 or l.quantity > 10000000;
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'bad_quantity', 'detail', v_txt);
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'errors', v_errors);
  end if;

  -- 3. write ingredients (factor is always derived from the catalog's own count unit)
  with src as (
    select distinct on (lower(btrim(x.name)))
           btrim(x.name) as name, nullif(btrim(x.category), '') as category, x.recipe_unit, x.count_unit
      from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text)
     order by lower(btrim(x.name))
  ), res as (
    insert into public.inventory_items as i
      (organization_id, name, category, count_unit, recipe_unit, recipe_factor)
    select p_organization_id, coalesce(e.name, s.name), s.category, coalesce(e.count_unit, s.count_unit),
           s.recipe_unit, private.unit_factor(s.recipe_unit, coalesce(e.count_unit, s.count_unit))
      from src s
      left join public.inventory_items e
        on e.organization_id = p_organization_id and lower(e.name) = lower(s.name)
    on conflict (organization_id, name) do update
      set recipe_unit = excluded.recipe_unit,
          recipe_factor = excluded.recipe_factor,
          category = coalesce(i.category, excluded.category)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ing_created, v_ing_updated from res;

  -- 4. write recipes and replace their lines
  with src as (
    select distinct on (lower(btrim(r.name))) btrim(r.name) as name, r.batch_yield
      from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
     order by lower(btrim(r.name))
  ), res as (
    insert into public.menu_recipes as m (organization_id, name, batch_yield)
    select p_organization_id, coalesce(e.name, s.name), s.batch_yield
      from src s
      left join public.menu_recipes e
        on e.organization_id = p_organization_id and lower(e.name) = lower(s.name)
    on conflict (organization_id, name) do update
      set batch_yield = excluded.batch_yield, active = true
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_rec_created, v_rec_updated from res;

  delete from public.recipe_lines rl
   using public.menu_recipes m
   where rl.recipe_id = m.id
     and m.organization_id = p_organization_id
     and lower(m.name) in (select lower(btrim(r.name))
                             from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb));

  insert into public.recipe_lines (organization_id, recipe_id, item_id, quantity)
  select p_organization_id, m.id, i.id, sum(l.quantity)
    from jsonb_to_recordset(p_recipes) as r(name text, batch_yield numeric, lines jsonb)
    cross join lateral jsonb_to_recordset(r.lines) as l(ingredient text, quantity numeric)
    join public.menu_recipes m
      on m.organization_id = p_organization_id and lower(m.name) = lower(btrim(r.name))
    join public.inventory_items i
      on i.organization_id = p_organization_id and lower(i.name) = lower(btrim(l.ingredient))
   group by m.id, i.id;
  get diagnostics v_lines = row_count;

  -- 5. map POS dish names to recipes (only when the recipe exists AND a portion was given)
  with src as (
    select distinct on (btrim(d.pos_name))
           btrim(d.pos_name) as pos_name, nullif(btrim(d.recipe_name), '') as recipe_name, d.portion
      from jsonb_to_recordset(v_dishes) as d(pos_name text, recipe_name text, portion numeric)
     where btrim(coalesce(d.pos_name, '')) <> ''
     order by btrim(d.pos_name)
  ), res as (
    insert into public.pos_items as p (organization_id, pos_name, recipe_id, portion, status)
    select p_organization_id, s.pos_name,
           case when m.id is not null and s.portion > 0 then m.id end,
           case when s.portion > 0 then s.portion else 1 end,
           case when m.id is not null and s.portion > 0 then 'mapped' else 'unmapped' end
      from src s
      left join public.menu_recipes m
        on m.organization_id = p_organization_id and lower(m.name) = lower(s.recipe_name)
    on conflict (organization_id, pos_name) do update
      set recipe_id = case when excluded.recipe_id is not null then excluded.recipe_id else p.recipe_id end,
          portion = case when excluded.recipe_id is not null then excluded.portion else p.portion end,
          status = case when excluded.recipe_id is not null then 'mapped' else p.status end
    returning p.status
  )
  select count(*) filter (where status = 'mapped'), count(*) filter (where status <> 'mapped')
    into v_mapped, v_unmapped from res;

  select coalesce(jsonb_agg(d.pos_name), '[]'::jsonb) into v_needs_portion from (
    select btrim(x.pos_name) as pos_name
      from jsonb_to_recordset(v_dishes) as x(pos_name text, recipe_name text, portion numeric)
     where nullif(btrim(coalesce(x.recipe_name, '')), '') is not null
       and (x.portion is null or x.portion <= 0)
     limit 100) d;

  select coalesce(jsonb_agg(d.pos_name), '[]'::jsonb) into v_not_ready from (
    select btrim(x.pos_name) as pos_name
      from jsonb_to_recordset(v_dishes) as x(pos_name text, recipe_name text, portion numeric)
     where nullif(btrim(coalesce(x.recipe_name, '')), '') is not null
       and x.portion > 0
       and not exists (select 1 from public.menu_recipes m
                        where m.organization_id = p_organization_id and lower(m.name) = lower(btrim(x.recipe_name)))
     limit 100) d;

  return jsonb_build_object(
    'ok', true,
    'ingredients_created', v_ing_created, 'ingredients_updated', v_ing_updated,
    'recipes_created', v_rec_created, 'recipes_updated', v_rec_updated, 'recipe_lines', v_lines,
    'dishes_mapped', v_mapped, 'dishes_unmapped', v_unmapped,
    'dishes_needing_portion', v_needs_portion, 'dishes_recipe_not_ready', v_not_ready);
end
$$;

-- ---------- Import aggregated POS sales (replaces the dates contained in the file) ----------
create or replace function public.import_pos_sales(
  p_outlet_id uuid,
  p_rows jsonb,
  p_source_name text default null
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
  if not private.can_manage_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  v_org := private.outlet_org(p_outlet_id);

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
  values (p_outlet_id, (select auth.uid()), nullif(btrim(coalesce(p_source_name, '')), ''), v_from, v_to)
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

-- ---------- Recalculate variance for a date range (max 32 days) ----------
create or replace function public.recompute_variance_range(p_outlet_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  d date;
  v_days int := 0;
  v_rows int := 0;
  r int;
begin
  if not private.can_manage_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 31 then
    return jsonb_build_object('ok', false, 'reason', 'bad_range');
  end if;
  d := p_from;
  while d <= p_to loop
    r := private.compute_variance_day(p_outlet_id, d);
    v_rows := v_rows + r;
    if r > 0 then v_days := v_days + 1; end if;
    d := d + 1;
  end loop;
  return jsonb_build_object('ok', true, 'days_computed', v_days, 'rows', v_rows);
end
$$;

-- ---------- Manager acknowledges a flagged variance ----------
create or replace function public.acknowledge_variance(p_result_id uuid, p_reason text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.variance_results%rowtype;
  v_name text;
begin
  select * into v from public.variance_results r where r.id = p_result_id;
  if not found or not private.can_manage_outlet(v.outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v.status not in ('shortage', 'surplus') then
    return jsonb_build_object('ok', false, 'reason', 'not_flagged');
  end if;
  if p_reason is null or p_reason not in ('counting_error', 'recipe_needs_update', 'portion_drift',
       'uncounted_wastage', 'comp_or_staff_meal', 'short_delivery', 'unexplained_loss', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_reason');
  end if;
  if p_reason = 'other' and btrim(coalesce(p_note, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;

  select p.full_name into v_name from public.profiles p where p.id = (select auth.uid());

  update public.variance_results
     set ack_status = 'acknowledged',
         ack_reason = p_reason,
         ack_note = nullif(btrim(coalesce(p_note, '')), ''),
         ack_by = (select auth.uid()),
         ack_by_name = v_name,
         ack_at = now()
   where id = p_result_id;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.import_recipe_workbook(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.import_pos_sales(uuid, jsonb, text) from public, anon;
revoke execute on function public.recompute_variance_range(uuid, date, date) from public, anon;
revoke execute on function public.acknowledge_variance(uuid, text, text) from public, anon;
grant execute on function public.import_recipe_workbook(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.import_pos_sales(uuid, jsonb, text) to authenticated;
grant execute on function public.recompute_variance_range(uuid, date, date) to authenticated;
grant execute on function public.acknowledge_variance(uuid, text, text) to authenticated;
