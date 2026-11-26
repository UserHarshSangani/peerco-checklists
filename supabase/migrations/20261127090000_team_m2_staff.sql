-- =========================================================
-- Daybook Team — Milestone 2: staff profiles, bank, phone login
--
--  * One PIN check (private.check_staff_pin) shared by the tablet and the
--    staff phone login. Wrong-PIN lockout now follows the outlet settings
--    auth.pin_max_attempts (default 5) and auth.pin_lock_minutes
--    (default 15; it was a fixed 5 minutes before).
--  * public.team_staff_login_check: mobile + PIN -> auth user. Server only
--    (service role); browsers can't call it.
--  * public.team_set_staff_login: links/unlinks a phone login. Server only,
--    records the manager who did it in the audit log.
--  * public.team_set_bank_account: stores server-encrypted bank details,
--    for people allowed to see pay.
--  * public.team_my_access: what the signed-in person may do for a staff
--    member (used by server routes before touching anything).
--  * Staff with a phone login can read their own outlet's row.
-- =========================================================

-- Integer outlet setting with a fallback when unset or malformed.
create or replace function private.team_setting_int(p_outlet uuid, p_key text, p_default int)
returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_value jsonb;
begin
  select os.value into v_value from public.outlet_settings os
   where os.outlet_id = p_outlet and os.key = p_key;
  if v_value is null or jsonb_typeof(v_value) <> 'number' then
    return p_default;
  end if;
  return (v_value #>> '{}')::int;
exception when others then
  return p_default;
end
$$;

-- PIN check with lockout. Returns {ok} or {ok:false, reason: invalid_staff |
-- locked | invalid_pin}. Counters live on public.staff, so the tablet and the
-- phone share one lock.
create or replace function private.check_staff_pin(p_staff uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_max int;
  v_lock int;
begin
  select * into v_staff from public.staff s where s.id = p_staff for update;

  if not found or v_staff.active is not true then
    return jsonb_build_object('ok', false, 'reason', 'invalid_staff');
  end if;

  if v_staff.locked_until is not null and v_staff.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_staff.locked_until);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_staff.pin_hash) <> v_staff.pin_hash then
    v_max := greatest(private.team_setting_int(v_staff.outlet_id, 'auth.pin_max_attempts', 5), 1);
    v_lock := greatest(private.team_setting_int(v_staff.outlet_id, 'auth.pin_lock_minutes', 15), 1);
    update public.staff
       set failed_attempts = case when failed_attempts + 1 >= v_max then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= v_max
                               then now() + make_interval(mins => v_lock) else locked_until end
     where id = v_staff.id;
    return jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  end if;

  update public.staff set failed_attempts = 0, locked_until = null where id = v_staff.id;
  return jsonb_build_object('ok', true);
end
$$;

-- Tablet PIN check (same signature and replies as before).
create or replace function private.verify_staff_pin(p_outlet uuid, p_staff uuid, p_pin text, p_task text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff public.staff%rowtype;
  v_result jsonb;
  v_allowed boolean;
begin
  if p_task is not null and p_task not in ('checklists', 'stock_counts', 'goods_received', 'wastage') then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  select * into v_staff from public.staff s where s.id = p_staff and s.outlet_id = p_outlet;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_staff');
  end if;

  v_result := private.check_staff_pin(p_staff, p_pin);
  if (v_result ->> 'ok')::boolean is not true then
    return v_result;
  end if;

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

revoke execute on function private.team_setting_int(uuid, text, int) from public, anon, authenticated;
revoke execute on function private.check_staff_pin(uuid, text) from public, anon, authenticated;

-- ---------- Phone login ----------

-- mobile + PIN -> {ok, auth_user_id, staff_id} or {ok:false, reason: invalid | locked}.
-- "invalid" covers unknown number, login off, left the job and wrong PIN
-- alike, so the reply never says whether a number is registered.
create or replace function public.team_staff_login_check(p_mobile text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.staff_profiles%rowtype;
  v_result jsonb;
begin
  select * into v_profile from public.staff_profiles sp
   where sp.mobile = p_mobile and sp.login_enabled and sp.auth_user_id is not null;

  if not found or v_profile.employment_status in ('exited', 'absconded') then
    -- Spend the same bcrypt time as a real check.
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf'));
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  v_result := private.check_staff_pin(v_profile.staff_id, p_pin);
  if (v_result ->> 'ok')::boolean is not true then
    if v_result ->> 'reason' = 'locked' then
      return v_result;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  return jsonb_build_object('ok', true, 'auth_user_id', v_profile.auth_user_id, 'staff_id', v_profile.staff_id);
end
$$;

-- Turns a staff member's phone login on or off. p_actor is the manager the
-- server already checked; it is recorded as the audit actor.
create or replace function public.team_set_staff_login(p_staff uuid, p_auth_user uuid, p_enabled boolean, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.staff_profiles%rowtype;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_actor::text, ''), true);

  select * into v_profile from public.staff_profiles sp where sp.staff_id = p_staff for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if p_enabled and v_profile.mobile is null then
    return jsonb_build_object('ok', false, 'reason', 'no_mobile');
  end if;

  begin
    update public.staff_profiles
       set auth_user_id = coalesce(p_auth_user, auth_user_id),
           login_enabled = p_enabled,
           updated_at = now()
     where staff_id = p_staff;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'mobile_in_use');
  end;

  return jsonb_build_object('ok', true);
end
$$;

revoke execute on function public.team_staff_login_check(text, text) from public, anon, authenticated;
revoke execute on function public.team_set_staff_login(uuid, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.team_staff_login_check(text, text) to service_role;
grant execute on function public.team_set_staff_login(uuid, uuid, boolean, uuid) to service_role;

-- ---------- Access check for server routes ----------
create or replace function public.team_my_access(p_staff uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when s.id is null then jsonb_build_object('found', false)
         else jsonb_build_object(
           'found', true,
           'outlet_id', s.outlet_id,
           'organization_id', private.outlet_org(s.outlet_id),
           'can_manage', private.can_manage_outlet(s.outlet_id),
           'can_see_pay', private.can_see_pay(s.outlet_id))
         end
    from (select 1) one
    left join public.staff s on s.id = p_staff
$$;
revoke execute on function public.team_my_access(uuid) from public, anon;
grant execute on function public.team_my_access(uuid) to authenticated;

-- ---------- Bank details ----------
-- The server encrypts the account number before calling this.
create or replace function public.team_set_bank_account(
  p_staff uuid, p_holder text, p_account_enc text, p_last4 text, p_ifsc text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_see_pay(private.staff_outlet(p_staff)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.staff_bank_accounts (staff_id, outlet_id, account_holder_name, account_number_enc, account_last4, ifsc, updated_at)
  values (p_staff, private.staff_outlet(p_staff), p_holder, p_account_enc, p_last4, upper(p_ifsc), now())
  on conflict (staff_id) do update
     set account_holder_name = excluded.account_holder_name,
         account_number_enc = excluded.account_number_enc,
         account_last4 = excluded.account_last4,
         ifsc = excluded.ifsc,
         updated_at = now();
end
$$;
revoke execute on function public.team_set_bank_account(uuid, text, text, text, text) from public, anon;
grant execute on function public.team_set_bank_account(uuid, text, text, text, text) to authenticated;

-- ---------- Staff phone login: see own outlet ----------
create policy outlets_select_staff_self on public.outlets for select to authenticated
  using (id = private.staff_outlet(private.my_staff_id()));
