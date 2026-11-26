
-- Four yes/no switches per staff member, default yes so nothing changes until a manager restricts someone
alter table public.staff
  add column can_checklists boolean not null default true,
  add column can_stock_counts boolean not null default true,
  add column can_goods_received boolean not null default true,
  add column can_wastage boolean not null default true;

-- Managers can already update staff (name, active); extend that to the new switches
grant update (can_checklists, can_stock_counts, can_goods_received, can_wastage) on public.staff to authenticated;

-- verify_staff_pin now also checks task permission, right after the PIN check
create or replace function private.verify_staff_pin(p_outlet uuid, p_staff uuid, p_pin text, p_task text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_allowed boolean;
begin
  if p_task is not null and p_task not in ('checklists', 'stock_counts', 'goods_received', 'wastage') then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

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

  if p_task is not null then
    v_allowed := case p_task
      when 'checklists' then v_staff.can_checklists
      when 'stock_counts' then v_staff.can_stock_counts
      when 'goods_received' then v_staff.can_goods_received
      when 'wastage' then v_staff.can_wastage
    end;
    if not v_allowed then
      return jsonb_build_object('ok', false, 'reason', 'task_not_allowed', 'task', p_task);
    end if;
  end if;

  return jsonb_build_object('ok', true);
end
$$;

-- submit_checklist: correct PIN but no checklist permission must refuse and save nothing
create or replace function public.submit_checklist(
  p_template_id uuid, p_staff_id uuid, p_pin text, p_business_date date,
  p_answers jsonb, p_notes text default null, p_location jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_active boolean;
  v_pin jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_sub uuid;
  v_missing int;
  v_missing_photo int;
  v_bad_photo int;
  v_lat double precision;
  v_lng double precision;
  v_acc int;
  o_lat double precision;
  o_lng double precision;
  o_rad int;
  v_status text := 'not_recorded';
  v_dist int;
begin
  select t.outlet_id, t.active into v_outlet, v_active
    from public.checklist_templates t where t.id = p_template_id;

  if v_outlet is null or v_active is not true or not private.can_access_outlet(v_outlet) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  if p_answers is null or jsonb_typeof(p_answers) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  if p_business_date is null or p_business_date < v_today - 1 or p_business_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select count(*) into v_missing
    from public.checklist_items i
   where i.template_id = p_template_id
     and i.required
     and not exists (
       select 1
         from jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
        where a.item_id = i.id
          and (a.done is true or btrim(coalesce(a.note, '')) <> '')
     );

  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_required', 'count', v_missing);
  end if;

  select count(*) into v_missing_photo
    from public.checklist_items i
    join jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
      on a.item_id = i.id
   where i.template_id = p_template_id
     and i.requires_photo
     and a.done is true
     and btrim(coalesce(a.photo_path, '')) = '';

  if v_missing_photo > 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_photo', 'count', v_missing_photo);
  end if;

  select count(*) into v_bad_photo
    from jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
   where btrim(coalesce(a.photo_path, '')) <> ''
     and not (
       a.photo_path like v_outlet::text || '/%'
       and exists (select 1 from storage.objects o where o.bucket_id = 'checklist-photos' and o.name = a.photo_path)
     );

  if v_bad_photo > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo', 'count', v_bad_photo);
  end if;

  v_pin := private.verify_staff_pin(v_outlet, p_staff_id, p_pin, 'checklists');
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  if p_location is not null and jsonb_typeof(p_location) = 'object' then
    begin
      v_lat := (p_location ->> 'lat')::double precision;
      v_lng := (p_location ->> 'lng')::double precision;
      v_acc := round((p_location ->> 'accuracy')::numeric)::int;
    exception when others then
      v_lat := null; v_lng := null; v_acc := null;
    end;

    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_status := case when p_location ->> 'error' = 'denied' then 'denied' else 'unavailable' end;
      v_acc := null;
    else
      select o.latitude, o.longitude, o.geofence_radius_m into o_lat, o_lng, o_rad
        from public.outlets o where o.id = v_outlet;
      if o_lat is null or o_lng is null then
        v_status := 'not_configured';
      else
        v_dist := round(6371000 * 2 * asin(least(1, sqrt(
          power(sin(radians(v_lat - o_lat) / 2), 2)
          + cos(radians(o_lat)) * cos(radians(v_lat)) * power(sin(radians(v_lng - o_lng) / 2), 2)
        ))))::int;
        if v_acc is not null and v_acc > 300 then v_status := 'low_accuracy';
        elsif v_dist - coalesce(v_acc, 0) <= o_rad then v_status := 'inside';
        else v_status := 'outside'; end if;
      end if;
    end if;
  end if;

  insert into public.checklist_submissions
    (outlet_id, template_id, business_date, staff_id, submitted_by, notes,
     location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (v_outlet, p_template_id, p_business_date, p_staff_id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''), v_status, v_dist, v_acc)
  returning id into v_sub;

  insert into public.submission_answers (submission_id, item_id, item_label, item_section, done, note, photo_path)
  select distinct on (i.id)
         v_sub, i.id, i.label, nullif(btrim(coalesce(i.section, '')), ''), coalesce(a.done, false),
         nullif(btrim(coalesce(a.note, '')), ''), nullif(btrim(coalesce(a.photo_path, '')), '')
    from public.checklist_items i
    join jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
      on a.item_id = i.id
   where i.template_id = p_template_id;

  return jsonb_build_object('ok', true, 'submission_id', v_sub, 'location_status', v_status, 'distance_m', v_dist);
end
$$;

-- submit_stock_count: same task check
create or replace function public.submit_stock_count(
  p_outlet_id uuid, p_kind public.stock_count_kind, p_staff_id uuid, p_pin text,
  p_business_date date, p_lines jsonb, p_notes text default null, p_location jsonb default null
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
   where not exists (select 1 from private.count_sheet_items(p_outlet_id, p_business_date) s where s.item_id = l.item_id);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'count', v_n);
  end if;

  select count(*) into v_n
    from private.count_sheet_items(p_outlet_id, p_business_date) s
   where not exists (
     select 1 from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text) where l.item_id = s.item_id);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'incomplete', 'count', v_n);
  end if;

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin, 'stock_counts');
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.stock_counts
    (outlet_id, kind, business_date, staff_id, submitted_by, notes, location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (p_outlet_id, p_kind, p_business_date, p_staff_id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''), v_loc.status, v_loc.dist, v_loc.acc)
  returning id into v_count;

  insert into public.stock_count_lines (count_id, item_id, item_name, unit, quantity, note)
  select v_count, s.item_id, s.name, s.unit, l.quantity, nullif(btrim(coalesce(l.note, '')), '')
    from private.count_sheet_items(p_outlet_id, p_business_date) s
    join jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, note text) on l.item_id = s.item_id;

  return jsonb_build_object('ok', true, 'count_id', v_count, 'location_status', v_loc.status);
end
$$;

-- submit_receipt: same task check
create or replace function public.submit_receipt(
  p_outlet_id uuid, p_staff_id uuid, p_pin text, p_business_date date, p_vendor_id uuid,
  p_invoice_ref text, p_lines jsonb, p_notes text default null, p_photo_path text default null,
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
    perform 1 from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end;

  if p_business_date is null or p_business_date < v_today - 1 or p_business_date > v_today then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  select v.name into v_vendor_name from public.vendors v
   where v.id = p_vendor_id and v.active and v.organization_id = private.outlet_org(p_outlet_id);
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
     select 1 from public.outlet_items oi join public.inventory_items i on i.id = oi.item_id
      where oi.outlet_id = p_outlet_id and oi.item_id = l.item_id and oi.active and i.active);
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_item', 'count', v_n);
  end if;

  if btrim(coalesce(p_photo_path, '')) <> '' and not private.photo_ok(p_outlet_id, p_photo_path) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo');
  end if;

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin, 'goods_received');
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.stock_receipts
    (outlet_id, business_date, vendor_id, vendor_name, invoice_ref, photo_path, staff_id, submitted_by,
     notes, location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (p_outlet_id, p_business_date, p_vendor_id, v_vendor_name, nullif(btrim(coalesce(p_invoice_ref, '')), ''),
     nullif(btrim(coalesce(p_photo_path, '')), ''), p_staff_id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''), v_loc.status, v_loc.dist, v_loc.acc)
  returning id into v_receipt;

  insert into public.stock_receipt_lines (receipt_id, item_id, item_name, unit, quantity, unit_cost, note)
  select v_receipt, i.id, i.name, i.count_unit, l.quantity, l.unit_cost, nullif(btrim(coalesce(l.note, '')), '')
    from jsonb_to_recordset(p_lines) as l(item_id uuid, quantity numeric, unit_cost numeric, note text)
    join public.inventory_items i on i.id = l.item_id;

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt, 'location_status', v_loc.status);
end
$$;

-- log_wastage: same task check
create or replace function public.log_wastage(
  p_outlet_id uuid, p_staff_id uuid, p_pin text, p_business_date date, p_entries jsonb, p_location jsonb default null
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
    perform 1 from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text);
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
     select 1 from public.outlet_items oi join public.inventory_items i on i.id = oi.item_id
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

  v_pin := private.verify_staff_pin(p_outlet_id, p_staff_id, p_pin, 'wastage');
  if (v_pin ->> 'ok')::boolean is not true then
    return v_pin;
  end if;

  select * into v_loc from private.evaluate_location(p_outlet_id, p_location);

  insert into public.wastage_entries
    (outlet_id, business_date, item_id, item_name, unit, quantity, reason, note, photo_path, staff_id,
     submitted_by, location_status, distance_from_outlet_m, location_accuracy_m)
  select p_outlet_id, p_business_date, i.id, i.name, i.count_unit, e.quantity, e.reason::public.wastage_reason,
         nullif(btrim(coalesce(e.note, '')), ''), nullif(btrim(coalesce(e.photo_path, '')), ''), p_staff_id,
         (select auth.uid()), v_loc.status, v_loc.dist, v_loc.acc
    from jsonb_to_recordset(p_entries) as e(item_id uuid, quantity numeric, reason text, note text, photo_path text)
    join public.inventory_items i on i.id = e.item_id;

  get diagnostics v_rows = row_count;
  return jsonb_build_object('ok', true, 'entries', v_rows, 'location_status', v_loc.status);
end
$$;

-- Let the tablet ask, up front, which of the four tasks a staff member may do (no PIN needed for this)
create or replace function public.get_staff_permissions(p_outlet_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.can_access_outlet(p_outlet_id) then
    coalesce(jsonb_object_agg(s.id, jsonb_build_object(
      'checklists', s.can_checklists, 'stock_counts', s.can_stock_counts,
      'goods_received', s.can_goods_received, 'wastage', s.can_wastage)), '{}'::jsonb)
  end
  from public.staff s where s.outlet_id = p_outlet_id and s.active;
$$;

revoke execute on function public.get_staff_permissions(uuid) from public, anon;
grant execute on function public.get_staff_permissions(uuid) to authenticated;
