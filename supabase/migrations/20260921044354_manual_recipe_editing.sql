
-- Keep recipe_factor consistent automatically whenever an item's units are edited by hand
create or replace function private.inventory_items_recipe_factor()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.recipe_unit is null then
    new.recipe_factor := 1;
    return new;
  end if;
  new.recipe_factor := private.unit_factor(new.recipe_unit, new.count_unit);
  if new.recipe_factor is null then
    raise exception 'recipe unit % does not match stock unit %', new.recipe_unit, new.count_unit
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger inventory_items_recipe_factor
  before insert or update of recipe_unit, count_unit on public.inventory_items
  for each row execute function private.inventory_items_recipe_factor();

revoke execute on function private.inventory_items_recipe_factor() from public, anon, authenticated;

-- Create or edit one recipe together with all its ingredient lines, atomically
create or replace function public.save_recipe(
  p_organization_id uuid,
  p_recipe_id uuid,
  p_name text,
  p_batch_yield numeric,
  p_notes text,
  p_active boolean,
  p_lines jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_n int;
  v_lines int := 0;
begin
  if not private.can_edit_catalog(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if v_name = '' or length(v_name) > 120
     or p_batch_yield is null or p_batch_yield <= 0 or p_batch_yield > 100000
     or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  if p_recipe_id is not null then
    select r.id into v_id from public.menu_recipes r
     where r.id = p_recipe_id and r.organization_id = p_organization_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'reason', 'not_found');
    end if;
  end if;

  if exists (select 1 from public.menu_recipes r
              where r.organization_id = p_organization_id
                and lower(r.name) = lower(v_name)
                and r.id is distinct from v_id) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_name');
  end if;

  select count(*) into v_n
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text)
   where l.item_id is null or l.quantity is null or l.quantity <= 0 or l.quantity > 10000000;
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
     select 1 from public.inventory_items i
      where i.id = l.item_id and i.organization_id = p_organization_id and i.recipe_unit is not null);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_item', 'count', v_n);
  end if;

  -- A recipe that mapped dishes rely on cannot be switched off (variance would silently drop it)
  if v_id is not null and coalesce(p_active, true) = false then
    select count(*) into v_n from public.pos_items p where p.recipe_id = v_id and p.status = 'mapped';
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'reason', 'in_use', 'count', v_n);
    end if;
  end if;

  if v_id is null then
    insert into public.menu_recipes (organization_id, name, batch_yield, notes, active)
    values (p_organization_id, v_name, p_batch_yield,
            nullif(btrim(coalesce(p_notes, '')), ''), coalesce(p_active, true))
    returning id into v_id;
  else
    update public.menu_recipes
       set name = v_name, batch_yield = p_batch_yield,
           notes = nullif(btrim(coalesce(p_notes, '')), ''), active = coalesce(p_active, true)
     where id = v_id;
  end if;

  delete from public.recipe_lines where recipe_id = v_id;
  insert into public.recipe_lines (organization_id, recipe_id, item_id, quantity, note)
  select p_organization_id, v_id, l.item_id, l.quantity, nullif(btrim(coalesce(l.note, '')), '')
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text);
  get diagnostics v_lines = row_count;

  return jsonb_build_object('ok', true, 'recipe_id', v_id, 'lines', v_lines);
end
$$;

revoke execute on function public.save_recipe(uuid, uuid, text, numeric, text, boolean, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, uuid, text, numeric, text, boolean, jsonb) to authenticated;
