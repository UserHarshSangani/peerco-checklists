
-- ---------- Columns ----------
alter table public.checklist_items add column requires_photo boolean not null default false;
alter table public.submission_answers add column photo_path text;

-- ---------- Private storage bucket (JPEG/WebP only, max 1 MB each) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-photos', 'checklist-photos', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Photos live under {outlet_id}/{date}/{file}. This helper reads the outlet from the path.
create or replace function private.photo_path_outlet(p_name text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return ((string_to_array(p_name, '/'))[1])::uuid;
exception when others then
  return null;
end
$$;

revoke execute on function private.photo_path_outlet(text) from public, anon;
grant execute on function private.photo_path_outlet(text) to authenticated;

-- Anyone with access to an outlet (including the tablet login) can upload into that outlet's folder
create policy checklist_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checklist-photos'
    and private.can_access_outlet(private.photo_path_outlet(name))
  );

-- Only admins, owners and managers can view photos (tablet logins cannot read them back)
create policy checklist_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'checklist-photos'
    and private.can_manage_outlet(private.photo_path_outlet(name))
  );

-- ---------- Upgraded submit function (same signature, backward compatible) ----------
create or replace function public.submit_checklist(
  p_template_id uuid,
  p_staff_id uuid,
  p_pin text,
  p_business_date date,
  p_answers jsonb,
  p_notes text default null
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

  -- Every required item must be marked done, or carry a note explaining why not
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

  -- Items that require a photo need one whenever they are marked done
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

  -- Any photo path must sit in this outlet's folder and point at a real uploaded file
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

  insert into public.checklist_submissions
    (outlet_id, template_id, business_date, staff_id, submitted_by, notes)
  values
    (v_outlet, p_template_id, p_business_date, v_staff.id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_sub;

  insert into public.submission_answers (submission_id, item_id, item_label, done, note, photo_path)
  select distinct on (i.id)
         v_sub, i.id, i.label, coalesce(a.done, false),
         nullif(btrim(coalesce(a.note, '')), ''),
         nullif(btrim(coalesce(a.photo_path, '')), '')
    from public.checklist_items i
    join jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text, photo_path text)
      on a.item_id = i.id
   where i.template_id = p_template_id;

  return jsonb_build_object('ok', true, 'submission_id', v_sub);
end
$$;
