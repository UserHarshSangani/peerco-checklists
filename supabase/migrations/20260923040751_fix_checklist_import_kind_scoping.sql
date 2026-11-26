
create or replace function public.import_checklist_workbook(
  p_outlet_id uuid, p_checklists jsonb, p_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_txt text;
  v_created int := 0;
  v_updated int := 0;
  v_items int := 0;
  v_time_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if not private.can_manage_outlet(p_outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_checklists is null or jsonb_typeof(p_checklists) <> 'array'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_checklists) = 0 or jsonb_array_length(p_checklists) > 20
     or jsonb_array_length(p_items) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  begin
    perform 1 from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean);
    perform 1 from jsonb_to_recordset(p_items)
      as i(checklist_name text, section text, label text, required boolean, requires_photo boolean);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  select string_agg(distinct coalesce(nullif(btrim(c.name), ''), '(blank name)'), ', ') into v_txt
    from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
   where btrim(coalesce(c.name, '')) = '' or length(c.name) > 120
      or c.kind is null or c.kind not in ('opening', 'closing')
      or (c.due_time is not null and btrim(c.due_time) <> '' and c.due_time !~ v_time_re);
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'bad_checklist', 'detail', v_txt);
  end if;

  select string_agg(n, ', ') into v_txt from (
    select lower(btrim(c.name)) as n
      from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
     group by lower(btrim(c.name)) having count(*) > 1) d;
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'duplicate_checklist_name', 'detail', v_txt);
  end if;

  select string_agg(distinct coalesce(nullif(btrim(i.label), ''), '(blank item)'), ', ') into v_txt
    from jsonb_to_recordset(p_items)
      as i(checklist_name text, section text, label text, required boolean, requires_photo boolean)
   where btrim(coalesce(i.label, '')) = '' or length(i.label) > 200
      or (i.section is not null and length(i.section) > 60);
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'bad_item', 'detail', v_txt);
  end if;

  select string_agg(distinct i.checklist_name, ', ') into v_txt
    from jsonb_to_recordset(p_items)
      as i(checklist_name text, section text, label text, required boolean, requires_photo boolean)
   where not exists (
     select 1 from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
      where lower(btrim(c.name)) = lower(btrim(i.checklist_name)));
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'unknown_checklist', 'detail', v_txt);
  end if;

  select string_agg(c.name, ', ') into v_txt
    from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
   where not exists (
     select 1 from jsonb_to_recordset(p_items)
       as i(checklist_name text, section text, label text, required boolean, requires_photo boolean)
      where lower(btrim(i.checklist_name)) = lower(btrim(c.name)));
  if v_txt is not null then
    v_errors := v_errors || jsonb_build_object('code', 'empty_checklist', 'detail', v_txt);
  end if;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'errors', v_errors);
  end if;

  with src as (
    select btrim(c.name) as name, c.kind::public.checklist_kind as kind,
           nullif(btrim(c.due_time), '') as due_time, coalesce(c.active, true) as active
      from jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
  ), res as (
    insert into public.checklist_templates as t (outlet_id, name, kind, due_time, active)
    select p_outlet_id, s.name, s.kind, s.due_time::time, s.active from src s
    on conflict (outlet_id, name, kind) do update
      set due_time = excluded.due_time, active = excluded.active
    returning t.id, t.name, (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into v_created, v_updated from res;

  -- Scoped by (name, kind) exactly as given in this batch, never just name - two checklists can
  -- legitimately share a name across kinds (an Opening and Closing variant), and importing one
  -- must never touch the other.
  delete from public.checklist_items ci
   using public.checklist_templates t,
        jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
   where ci.template_id = t.id
     and t.outlet_id = p_outlet_id
     and lower(t.name) = lower(btrim(c.name))
     and t.kind = c.kind::public.checklist_kind;

  with ordered as (
    select
      (e.value ->> 'checklist_name') as checklist_name,
      (e.value ->> 'section') as section,
      (e.value ->> 'label') as label,
      coalesce((e.value ->> 'required')::boolean, true) as required,
      coalesce((e.value ->> 'requires_photo')::boolean, false) as requires_photo,
      row_number() over (partition by lower(btrim(e.value ->> 'checklist_name')) order by e.ord) as pos
    from jsonb_array_elements(p_items) with ordinality as e(value, ord)
  )
  insert into public.checklist_items (template_id, position, label, section, required, requires_photo)
  select t.id, o.pos, o.label, nullif(btrim(o.section), ''), o.required, o.requires_photo
    from ordered o
    join jsonb_to_recordset(p_checklists) as c(name text, kind text, due_time text, active boolean)
      on lower(btrim(c.name)) = lower(btrim(o.checklist_name))
    join public.checklist_templates t
      on t.outlet_id = p_outlet_id
     and lower(t.name) = lower(btrim(o.checklist_name))
     and t.kind = c.kind::public.checklist_kind;
  get diagnostics v_items = row_count;

  return jsonb_build_object('ok', true, 'checklists_created', v_created,
    'checklists_updated', v_updated, 'items_replaced', v_items);
end
$$;
