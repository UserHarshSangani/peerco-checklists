-- =========================================================
-- Daybook Team — staff fill in their own details from their phone login
--
--  * staff_profiles.address and .photo_path (new).
--  * public.team_update_my_profile: the signed-in staff member saves their
--    own basics (gender, date of birth, address, emergency contact, UAN,
--    ESIC IP, photo). Applies at once; their managers get a notification.
--  * Bank details never change straight away. The server encrypts the
--    account number and files a staff_bank_change_requests row
--    (public.team_request_bank_change, service role only). Someone allowed
--    to see pay approves or rejects it (public.team_decide_bank_change);
--    approval replaces staff_bank_accounts.
--  * Private bucket staff-photos ({outlet}/{staff}/...): the person and
--    their managers can upload; they and the outlet tablet can view.
-- =========================================================

-- ---------- Profile fields ----------
alter table public.staff_profiles
  add column address text check (char_length(address) <= 500),
  add column photo_path text;
grant update (address, photo_path) on public.staff_profiles to authenticated;

-- ---------- Photo bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy staff_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-photos'
              and private.staff_outlet(private.path_segment_uuid(name, 2)) = private.path_segment_uuid(name, 1)
              and private.team_can_read(private.path_segment_uuid(name, 1), private.path_segment_uuid(name, 2)));
create policy staff_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'staff-photos'
         and (private.can_access_outlet(private.path_segment_uuid(name, 1))
              or private.team_can_read(private.path_segment_uuid(name, 1), private.path_segment_uuid(name, 2))));

-- ---------- Bank change requests ----------
create table public.staff_bank_change_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  account_holder_name text not null check (char_length(btrim(account_holder_name)) between 1 and 120),
  account_number_enc text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text
);
create unique index staff_bank_change_requests_one_pending on public.staff_bank_change_requests (staff_id)
  where status = 'pending';
create index on public.staff_bank_change_requests (outlet_id, status);

create trigger staff_bank_change_requests_fill_outlet before insert or update of staff_id
  on public.staff_bank_change_requests for each row execute function private.fill_outlet_from_staff();
create trigger staff_bank_change_requests_audit after insert or update or delete
  on public.staff_bank_change_requests for each row execute function private.audit_row();

alter table public.staff_bank_change_requests enable row level security;
-- The person and pay-approvers can read it; never the ciphertext.
create policy staff_bank_change_requests_select on public.staff_bank_change_requests for select to authenticated
  using (private.team_can_read_pay(outlet_id, staff_id));
revoke all on public.staff_bank_change_requests from public, anon, authenticated;
grant select (id, staff_id, outlet_id, account_holder_name, account_last4, ifsc, status,
              requested_at, decided_at, decision_note)
  on public.staff_bank_change_requests to authenticated;

-- People who may approve pay matters for an outlet: org owners, plus its
-- managers when the outlet lets managers see pay.
create or replace function private.team_pay_approvers(p_outlet uuid)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
    join public.outlets o on o.organization_id = p.organization_id
   where o.id = p_outlet and p.role = 'owner'
  union
  select p.id from public.profiles p
    join public.outlet_users ou on ou.profile_id = p.id
   where ou.outlet_id = p_outlet and p.role = 'manager'
     and coalesce((private.outlet_setting(p_outlet, 'team.managers_see_pay'))::boolean, false)
$$;

-- ---------- Staff: save own basics ----------
create or replace function public.team_update_my_profile(
  p_gender text, p_date_of_birth date, p_address text,
  p_emergency_name text, p_emergency_phone text,
  p_uan text, p_esic_ip text, p_photo_path text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff uuid := private.my_staff_id();
  v_outlet uuid;
  v_name text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_staff is null then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  select s.outlet_id, s.name into v_outlet, v_name from public.staff s where s.id = v_staff;

  p_gender := nullif(btrim(coalesce(p_gender, '')), '');
  p_address := nullif(btrim(coalesce(p_address, '')), '');
  p_emergency_name := nullif(btrim(coalesce(p_emergency_name, '')), '');
  p_emergency_phone := nullif(regexp_replace(coalesce(p_emergency_phone, ''), '\D', '', 'g'), '');
  p_uan := nullif(regexp_replace(coalesce(p_uan, ''), '\s', '', 'g'), '');
  p_esic_ip := nullif(regexp_replace(coalesce(p_esic_ip, ''), '\s', '', 'g'), '');
  p_photo_path := nullif(btrim(coalesce(p_photo_path, '')), '');

  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'bad_gender');
  end if;
  if p_date_of_birth is not null and (p_date_of_birth < date '1940-01-01' or p_date_of_birth > v_today - interval '14 years') then
    return jsonb_build_object('ok', false, 'reason', 'bad_dob');
  end if;
  if p_address is not null and char_length(p_address) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_address');
  end if;
  if p_emergency_name is not null and char_length(p_emergency_name) > 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_emergency_name');
  end if;
  if p_emergency_phone is not null and p_emergency_phone !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_phone');
  end if;
  if p_uan is not null and p_uan !~ '^[0-9]{12}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_uan');
  end if;
  if p_esic_ip is not null and p_esic_ip !~ '^[0-9]{10}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_esic');
  end if;
  if p_photo_path is not null and not (
       p_photo_path like v_outlet::text || '/' || v_staff::text || '/%'
       and exists (select 1 from storage.objects o where o.bucket_id = 'staff-photos' and o.name = p_photo_path)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_photo');
  end if;

  update public.staff_profiles sp
     set gender = p_gender,
         date_of_birth = p_date_of_birth,
         address = p_address,
         emergency_contact_name = p_emergency_name,
         emergency_contact_phone = p_emergency_phone,
         uan = p_uan,
         esic_ip_number = p_esic_ip,
         photo_path = coalesce(p_photo_path, sp.photo_path),
         updated_at = now()
   where sp.staff_id = v_staff;

  perform private.team_notify_managers(v_outlet, 'staff_profile_updated',
    jsonb_build_object('staff_id', v_staff, 'name', v_name), null);
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Staff: ask to change bank details (server only) ----------
-- Called by /api/me/bank with the service role after it has worked out the
-- caller's own staff id and encrypted the account number.
create or replace function public.team_request_bank_change(
  p_staff uuid, p_holder text, p_account_enc text, p_last4 text, p_ifsc text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid := private.staff_outlet(p_staff);
  v_name text;
  v_id uuid;
begin
  if v_outlet is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_staff');
  end if;
  select s.name into v_name from public.staff s where s.id = p_staff;

  -- A newer request replaces one still waiting.
  update public.staff_bank_change_requests set status = 'cancelled', decided_at = now()
   where staff_id = p_staff and status = 'pending';

  insert into public.staff_bank_change_requests (staff_id, outlet_id, account_holder_name, account_number_enc, account_last4, ifsc)
  values (p_staff, v_outlet, btrim(p_holder), p_account_enc, p_last4, upper(p_ifsc))
  returning id into v_id;

  insert into public.notifications (recipient_profile_id, outlet_id, kind, payload, dedupe_key)
  select m, v_outlet, 'bank_change_requested',
         jsonb_build_object('staff_id', p_staff, 'name', v_name, 'request_id', v_id, 'last4', p_last4),
         'bank:' || v_id
    from private.team_pay_approvers(v_outlet) m
  on conflict (recipient_profile_id, dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object('ok', true, 'request_id', v_id);
end
$$;

-- ---------- Approver: approve or reject ----------
create or replace function public.team_decide_bank_change(p_request uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.staff_bank_change_requests%rowtype;
begin
  select * into v_req from public.staff_bank_change_requests r where r.id = p_request for update;
  if not found or not private.can_see_pay(v_req.outlet_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  if p_approve is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if not p_approve and btrim(coalesce(p_note, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end if;

  if p_approve then
    insert into public.staff_bank_accounts (staff_id, outlet_id, account_holder_name, account_number_enc, account_last4, ifsc, updated_at)
    values (v_req.staff_id, v_req.outlet_id, v_req.account_holder_name, v_req.account_number_enc, v_req.account_last4, v_req.ifsc, now())
    on conflict (staff_id) do update
      set account_holder_name = excluded.account_holder_name,
          account_number_enc = excluded.account_number_enc,
          account_last4 = excluded.account_last4,
          ifsc = excluded.ifsc,
          updated_at = excluded.updated_at;
  end if;

  update public.staff_bank_change_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_request;

  update public.notifications set read_at = coalesce(read_at, now())
   where dedupe_key = 'bank:' || p_request;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Tablet list now carries the photo path ----------
create or replace function public.team_device_today(p_outlet uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not private.can_access_outlet(p_outlet) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'staff_id', s.id,
             'name', s.name,
             'photo_path', sp.photo_path,
             'roster_kind', re.kind,
             'segments', re.segments,
             'extended_until', to_char(re.extended_until, 'HH24:MI'),
             'state', case when last.kind = 'in' then 'in' when last.kind = 'out' and last.business_date = v_today then 'out' else 'none' end,
             'last_at', last.at) order by s.name)
      from public.staff s
      left join public.staff_profiles sp on sp.staff_id = s.id
      left join public.roster_entries re on re.staff_id = s.id and re.business_date = v_today
      left join lateral (
        select ae.kind, ae.at, ae.business_date from public.attendance_events ae
         where ae.staff_id = s.id and ae.status <> 'void' and ae.business_date >= v_today - 1
         order by ae.at desc limit 1) last on true
     where s.outlet_id = p_outlet and s.active
       and coalesce(sp.employment_status, 'active') not in ('exited', 'absconded')), '[]'::jsonb);
end
$$;

-- ---------- Privileges ----------
revoke execute on function private.team_pay_approvers(uuid) from public, anon, authenticated;

revoke execute on function public.team_update_my_profile(text, date, text, text, text, text, text, text) from public, anon;
grant execute on function public.team_update_my_profile(text, date, text, text, text, text, text, text) to authenticated;

revoke execute on function public.team_request_bank_change(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.team_request_bank_change(uuid, text, text, text, text) to service_role;

revoke execute on function public.team_decide_bank_change(uuid, boolean, text) from public, anon;
grant execute on function public.team_decide_bank_change(uuid, boolean, text) to authenticated;
