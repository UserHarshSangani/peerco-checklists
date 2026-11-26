
-- Optional section (Kitchen, Cash Counter, Storage...) on each checklist item, snapshotted on answers
alter table public.checklist_items
  add column section text,
  add constraint checklist_items_section_len check (section is null or length(btrim(section)) between 1 and 60);

alter table public.submission_answers add column item_section text;

-- Same signature as before; the only change is that answers now snapshot the item's section
create or replace function public.submit_checklist(
  p_template_id uuid,
  p_staff_id uuid,
  p_pin text,
  p_business_date date,
  p_answers jsonb,
  p_notes text default null,
  p_location jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
  v_active boolean;
  v_staff public.staff%rowtype;
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

  select * into v_staff from public.staff s
   where s.id = p_staff_id and s.outlet_id = v_outlet
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
       and exists (
         select 1 from storage.objects o
          where o.bucket_id = 'checklist-photos' and o.name = a.photo_path
       )
     );

  if v_bad_photo > 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_photo', 'count', v_bad_photo);
  end if;

  if p_location is not null and jsonb_typeof(p_location) = 'object' then
    begin
      v_lat := (p_location ->> 'lat')::double precision;
      v_lng := (p_location ->> 'lng')::double precision;
      v_acc := round((p_location ->> 'accuracy')::numeric)::int;
    exception when others then
      v_lat := null;
      v_lng := null;
      v_acc := null;
    end;

    if v_lat is null or v_lng is null
       or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
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

        if v_acc is not null and v_acc > 300 then
          v_status := 'low_accuracy';
        elsif v_dist - coalesce(v_acc, 0) <= o_rad then
          v_status := 'inside';
        else
          v_status := 'outside';
        end if;
      end if;
    end if;
  end if;

  insert into public.checklist_submissions
    (outlet_id, template_id, business_date, staff_id, submitted_by, notes,
     location_status, distance_from_outlet_m, location_accuracy_m)
  values
    (v_outlet, p_template_id, p_business_date, v_staff.id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''),
     v_status, v_dist, v_acc)
  returning id into v_sub;

  insert into public.submission_answers (submission_id, item_id, item_label, item_section, done, note, photo_path)
  select distinct on (i.id)
         v_sub, i.id, i.label, nullif(btrim(coalesce(i.section, '')), ''), coalesce(a.done, false),
         nullif(btrim(coalesce(a.note, '')), ''),
         nullif(btrim(coalesce(a.photo_path, '')), '')
    from public.checklist_items i
    join jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
      on a.item_id = i.id
   where i.template_id = p_template_id;

  return jsonb_build_object('ok', true, 'submission_id', v_sub,
                            'location_status', v_status, 'distance_m', v_dist);
end
$$;
