
-- =========================================================
-- PeerCo Checklists: Phase 1 schema
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Enums ----------
create type public.user_role as enum ('peerco_admin', 'owner', 'manager', 'device');
create type public.checklist_kind as enum ('opening', 'closing');
create type public.task_status as enum ('open', 'done');

-- ---------- Tables ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profiles_org_matches_role check (
    (role = 'peerco_admin' and organization_id is null)
    or (role <> 'peerco_admin' and organization_id is not null)
  )
);

create table public.outlet_users (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  primary key (profile_id, outlet_id)
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  active boolean not null default true,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  kind public.checklist_kind not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  position int not null,
  label text not null,
  required boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.checklist_submissions (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  template_id uuid not null references public.checklist_templates(id),
  business_date date not null,
  staff_id uuid not null references public.staff(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  notes text
);

create table public.submission_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.checklist_submissions(id) on delete cascade,
  item_id uuid references public.checklist_items(id) on delete set null,
  item_label text not null,
  done boolean not null,
  note text,
  unique (submission_id, item_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  title text not null,
  description text,
  assigned_staff_id uuid references public.staff(id) on delete set null,
  due_date date,
  status public.task_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ---------- Indexes ----------
create index on public.outlets (organization_id);
create index on public.profiles (organization_id);
create index on public.outlet_users (outlet_id);
create index on public.staff (outlet_id);
create index on public.checklist_templates (outlet_id);
create index on public.checklist_items (template_id, position);
create index on public.checklist_submissions (outlet_id, business_date);
create index on public.checklist_submissions (template_id);
create index on public.checklist_submissions (staff_id);
create index on public.submission_answers (submission_id);
create index on public.submission_answers (item_id);
create index on public.tasks (outlet_id, status);
create index on public.tasks (assigned_staff_id);

-- ---------- Private helper functions (not exposed via the API) ----------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()) $$;

create or replace function private.my_org()
returns uuid
language sql stable security definer set search_path = ''
as $$ select p.organization_id from public.profiles p where p.id = (select auth.uid()) $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role = 'peerco_admin' from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function private.can_manage_org(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (p.role = 'peerco_admin') or (p.role = 'owner' and p.organization_id = p_org)
    from public.profiles p where p.id = (select auth.uid())
  ), false)
$$;

create or replace function private.can_access_outlet(p_outlet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when p.role = 'peerco_admin' then true
      when p.role = 'owner' then exists (
        select 1 from public.outlets o where o.id = p_outlet and o.organization_id = p.organization_id)
      when p.role in ('manager', 'device') then exists (
        select 1 from public.outlet_users ou where ou.profile_id = p.id and ou.outlet_id = p_outlet)
      else false
    end
    from public.profiles p where p.id = (select auth.uid())
  ), false)
$$;

create or replace function private.can_manage_outlet(p_outlet uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when p.role = 'peerco_admin' then true
      when p.role = 'owner' then exists (
        select 1 from public.outlets o where o.id = p_outlet and o.organization_id = p.organization_id)
      when p.role = 'manager' then exists (
        select 1 from public.outlet_users ou where ou.profile_id = p.id and ou.outlet_id = p_outlet)
      else false
    end
    from public.profiles p where p.id = (select auth.uid())
  ), false)
$$;

create or replace function private.outlet_org(p_outlet uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select o.organization_id from public.outlets o where o.id = p_outlet $$;

create or replace function private.profile_org(p_profile uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select p.organization_id from public.profiles p where p.id = p_profile $$;

create or replace function private.template_outlet(p_template uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select t.outlet_id from public.checklist_templates t where t.id = p_template $$;

create or replace function private.submission_outlet(p_submission uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select s.outlet_id from public.checklist_submissions s where s.id = p_submission $$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------- Table privileges ----------
revoke all on public.organizations, public.outlets, public.profiles, public.outlet_users,
  public.staff, public.checklist_templates, public.checklist_items,
  public.checklist_submissions, public.submission_answers, public.tasks
  from anon;
revoke truncate, references, trigger on public.organizations, public.outlets, public.profiles,
  public.outlet_users, public.staff, public.checklist_templates, public.checklist_items,
  public.checklist_submissions, public.submission_answers, public.tasks
  from authenticated;

-- Staff: PIN hash and attempt counters are never readable or writable through the API
revoke all on public.staff from authenticated;
grant select (id, outlet_id, name, active, locked_until, created_at) on public.staff to authenticated;
grant update (name, active) on public.staff to authenticated;

-- Submissions are written only through submit_checklist()
revoke insert, update, delete on public.checklist_submissions, public.submission_answers from authenticated;

-- ---------- Row-level security ----------
alter table public.organizations enable row level security;
alter table public.outlets enable row level security;
alter table public.profiles enable row level security;
alter table public.outlet_users enable row level security;
alter table public.staff enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_items enable row level security;
alter table public.checklist_submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.tasks enable row level security;

-- organizations
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_admin() or id = private.my_org());
create policy organizations_insert on public.organizations for insert to authenticated
  with check (private.is_admin());
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy organizations_delete on public.organizations for delete to authenticated
  using (private.is_admin());

-- outlets
create policy outlets_select on public.outlets for select to authenticated
  using (private.can_access_outlet(id));
create policy outlets_insert on public.outlets for insert to authenticated
  with check (private.can_manage_org(organization_id));
create policy outlets_update on public.outlets for update to authenticated
  using (private.can_manage_org(organization_id)) with check (private.can_manage_org(organization_id));
create policy outlets_delete on public.outlets for delete to authenticated
  using (private.can_manage_org(organization_id));

-- profiles (writes are admin-only; logins are created server-side)
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_admin()
    or (private.my_role() = 'owner' and organization_id = private.my_org())
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check (private.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (private.is_admin());

-- outlet_users
create policy outlet_users_select on public.outlet_users for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.can_manage_org(private.outlet_org(outlet_id))
  );
create policy outlet_users_insert on public.outlet_users for insert to authenticated
  with check (
    private.can_manage_org(private.outlet_org(outlet_id))
    and private.profile_org(profile_id) = private.outlet_org(outlet_id)
  );
create policy outlet_users_update on public.outlet_users for update to authenticated
  using (private.can_manage_org(private.outlet_org(outlet_id)))
  with check (
    private.can_manage_org(private.outlet_org(outlet_id))
    and private.profile_org(profile_id) = private.outlet_org(outlet_id)
  );
create policy outlet_users_delete on public.outlet_users for delete to authenticated
  using (private.can_manage_org(private.outlet_org(outlet_id)));

-- staff (rows are created only through create_staff())
create policy staff_select on public.staff for select to authenticated
  using (private.can_access_outlet(outlet_id));
create policy staff_update on public.staff for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));

-- checklist_templates
create policy templates_select on public.checklist_templates for select to authenticated
  using (private.can_access_outlet(outlet_id));
create policy templates_insert on public.checklist_templates for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy templates_update on public.checklist_templates for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy templates_delete on public.checklist_templates for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

-- checklist_items
create policy items_select on public.checklist_items for select to authenticated
  using (private.can_access_outlet(private.template_outlet(template_id)));
create policy items_insert on public.checklist_items for insert to authenticated
  with check (private.can_manage_outlet(private.template_outlet(template_id)));
create policy items_update on public.checklist_items for update to authenticated
  using (private.can_manage_outlet(private.template_outlet(template_id)))
  with check (private.can_manage_outlet(private.template_outlet(template_id)));
create policy items_delete on public.checklist_items for delete to authenticated
  using (private.can_manage_outlet(private.template_outlet(template_id)));

-- submissions and answers: readable by managers, owners and admins only
create policy submissions_select on public.checklist_submissions for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy answers_select on public.submission_answers for select to authenticated
  using (private.can_manage_outlet(private.submission_outlet(submission_id)));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (private.can_access_outlet(outlet_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy tasks_update on public.tasks for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

-- ---------- Public RPC functions ----------
create or replace function public.create_staff(p_outlet_id uuid, p_name text, p_pin text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_manage_outlet(p_outlet_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required' using errcode = '22023';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits' using errcode = '22023';
  end if;
  insert into public.staff (outlet_id, name, pin_hash)
  values (p_outlet_id, btrim(p_name), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning id into v_id;
  return v_id;
end
$$;

create or replace function public.set_staff_pin(p_staff_id uuid, p_pin text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlet uuid;
begin
  select s.outlet_id into v_outlet from public.staff s where s.id = p_staff_id;
  if v_outlet is null or not private.can_manage_outlet(v_outlet) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits' using errcode = '22023';
  end if;
  update public.staff
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         failed_attempts = 0,
         locked_until = null
   where id = p_staff_id;
end
$$;

-- Returns jsonb instead of raising for PIN problems, so the failed-attempt
-- counter is committed rather than rolled back.
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
         from jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text)
        where a.item_id = i.id
          and (a.done is true or btrim(coalesce(a.note, '')) <> '')
     );

  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_required', 'count', v_missing);
  end if;

  insert into public.checklist_submissions
    (outlet_id, template_id, business_date, staff_id, submitted_by, notes)
  values
    (v_outlet, p_template_id, p_business_date, v_staff.id, (select auth.uid()),
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_sub;

  insert into public.submission_answers (submission_id, item_id, item_label, done, note)
  select distinct on (i.id)
         v_sub, i.id, i.label, coalesce(a.done, false), nullif(btrim(coalesce(a.note, '')), '')
    from public.checklist_items i
    join jsonb_to_recordset(p_answers) as a(item_id uuid, done boolean, note text)
      on a.item_id = i.id
   where i.template_id = p_template_id;

  return jsonb_build_object('ok', true, 'submission_id', v_sub);
end
$$;

revoke execute on function public.create_staff(uuid, text, text) from public, anon;
revoke execute on function public.set_staff_pin(uuid, text) from public, anon;
revoke execute on function public.submit_checklist(uuid, uuid, text, date, jsonb, text) from public, anon;
grant execute on function public.create_staff(uuid, text, text) to authenticated;
grant execute on function public.set_staff_pin(uuid, text) to authenticated;
grant execute on function public.submit_checklist(uuid, uuid, text, date, jsonb, text) to authenticated;
