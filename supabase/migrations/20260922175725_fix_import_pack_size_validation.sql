
create or replace function public.import_recipe_workbook(
  p_organization_id uuid, p_ingredients jsonb, p_recipes jsonb, p_dishes jsonb default '[]'::jsonb
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

  -- unit_mismatch: a non-standard pair (like slices-in-a-packet) is only safe to import when the
  -- ingredient already exists AND was already deliberately configured for recipes (recipe_unit set).
  -- A brand-new item, or an existing item never configured, cannot silently get a guessed pack size.
  select string_agg(distinct x.name, ', ') into v_txt
    from jsonb_to_recordset(p_ingredients) as x(name text, category text, recipe_unit text, count_unit text)
    left join public.inventory_items e
      on e.organization_id = p_organization_id and lower(e.name) = lower(btrim(x.name))
   where x.recipe_unit in ('g', 'ml', 'pcs')
     and private.unit_factor(x.recipe_unit, coalesce(e.count_unit, x.count_unit)) is null
     and (e.id is null or e.recipe_unit is null);
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'unit_mismatch', 'detail', v_txt);
  end if;

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
          recipe_factor = coalesce(private.unit_factor(excluded.recipe_unit, i.count_unit), i.recipe_factor),
          category = coalesce(i.category, excluded.category)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_ing_created, v_ing_updated from res;

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
