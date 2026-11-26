
-- =====================================================================
-- Booking slot monitor: outlet hours, booking sources, snapshots, alerts
-- =====================================================================

alter table public.outlets add constraint outlets_id_org_key unique (id, organization_id);

-- ---------- Opening hours (0 = Sunday ... 6 = Saturday; same-day hours only) ----------
create table public.outlet_hours (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  shift smallint not null default 1 check (shift between 1 and 3),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  last_booking_time time,
  unique (outlet_id, weekday, shift),
  constraint outlet_hours_times_valid check (
    (is_closed and open_time is null and close_time is null and last_booking_time is null)
    or (not is_closed and open_time is not null and close_time is not null and last_booking_time is not null
        and open_time < last_booking_time and last_booking_time <= close_time)
  )
);

create table public.outlet_closures (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  reason text,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);

-- ---------- Booking pages to watch ----------
create table public.booking_sources (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  platform text not null check (platform in ('zomato', 'swiggy', 'eazydiner', 'google', 'website', 'other')),
  label text,
  url text not null check (url ~ '^https?://'),
  method text not null default 'auto' check (method in ('auto', 'manual')),
  party_size int not null default 2 check (party_size between 1 and 30),
  days_ahead int not null default 7 check (days_ahead between 1 and 30),
  check_every_hours int not null default 3 check (check_every_hours between 1 and 48),
  active boolean not null default true,
  last_checked_at timestamptz,
  last_status text check (last_status in ('ok', 'failed', 'blocked')),
  last_error text,
  created_at timestamptz not null default now(),
  unique (outlet_id, platform)
);

create table public.booking_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.booking_sources(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  checked_at timestamptz not null default now(),
  target_date date not null,
  party_size int,
  slots time[] not null default '{}',
  window_labels jsonb,
  status text not null check (status in ('ok', 'failed', 'blocked')),
  error text,
  screenshot_path text,
  entered_by uuid references auth.users(id) on delete set null,
  entry_method text not null check (entry_method in ('auto', 'manual'))
);

create table public.booking_alerts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  source_id uuid not null references public.booking_sources(id) on delete cascade,
  kind text not null check (kind in ('slot_outside_hours', 'slot_on_closed_day', 'no_slots_when_open',
                                     'window_outside_hours', 'check_failed', 'check_stale', 'hours_missing')),
  target_date date,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  snapshot_id uuid references public.booking_snapshots(id) on delete set null,
  ack_by uuid references auth.users(id) on delete set null,
  ack_by_name text,
  ack_note text,
  ack_at timestamptz,
  resolved_at timestamptz,
  last_notified_at timestamptz,
  notify_count int not null default 0
);

-- One live alert per source, kind and date; a resolved alert can come back as a new one
create unique index booking_alerts_one_active
  on public.booking_alerts (source_id, kind, (coalesce(target_date, date '1900-01-01')))
  where status in ('open', 'acknowledged');

-- Who gets told (delivery itself is built in a later step)
create table public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outlet_id uuid,
  channel text not null check (channel in ('email', 'whatsapp', 'telegram')),
  address text not null check (length(btrim(address)) between 3 and 200),
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint alert_recipients_outlet_fk foreign key (outlet_id, organization_id)
    references public.outlets (id, organization_id) on delete cascade
);

-- ---------- Indexes ----------
create index on public.outlet_hours (outlet_id);
create index on public.outlet_closures (outlet_id, date_from);
create index on public.booking_sources (outlet_id);
create index on public.booking_snapshots (source_id, target_date, checked_at desc);
create index on public.booking_snapshots (outlet_id);
create index on public.booking_snapshots (entered_by);
create index on public.booking_alerts (outlet_id, status);
create index on public.booking_alerts (source_id);
create index on public.booking_alerts (snapshot_id);
create index on public.booking_alerts (ack_by);
create index on public.alert_recipients (organization_id);
create index on public.alert_recipients (outlet_id);

-- ---------- Private helpers ----------
create or replace function private.is_service_role()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

create or replace function private.raise_booking_alert(
  p_outlet uuid, p_source uuid, p_kind text, p_date date, p_details jsonb, p_snapshot uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  insert into public.booking_alerts as a (outlet_id, source_id, kind, target_date, details, snapshot_id)
  values (p_outlet, p_source, p_kind, p_date, p_details, p_snapshot)
  on conflict (source_id, kind, (coalesce(target_date, date '1900-01-01')))
    where status in ('open', 'acknowledged')
  do update set details = excluded.details, last_seen_at = now(), snapshot_id = excluded.snapshot_id
  returning (xmax = 0) into v_inserted;
  return v_inserted;
end
$$;

-- Compares one snapshot with the outlet's hours, then opens, refreshes or resolves alerts
create or replace function private.apply_booking_rules(p_snapshot uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s public.booking_snapshots%rowtype;
  v_dow int;
  v_hours_rows int;
  v_day_rows int;
  v_closed_rows int;
  v_closure boolean;
  v_offending text[];
  v_allowed jsonb;
  v_min_open time;
  v_max_close time;
  v_raised text[] := '{}';
  v_opened int := 0;
  v_resolved int := 0;
  v_n int;
  v_prev_empty boolean;
  v_bad_labels jsonb;
  v_new boolean;
begin
  select * into s from public.booking_snapshots where id = p_snapshot;

  if s.status <> 'ok' then
    v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'check_failed', null,
      jsonb_build_object('status', s.status, 'error', s.error, 'target_date', s.target_date), s.id);
    return jsonb_build_object('opened', case when v_new then 1 else 0 end, 'resolved', 0);
  end if;

  -- a good check clears "failed" and "stale" alerts for this source
  update public.booking_alerts set status = 'resolved', resolved_at = now()
   where source_id = s.source_id and kind in ('check_failed', 'check_stale')
     and status in ('open', 'acknowledged');
  get diagnostics v_n = row_count;
  v_resolved := v_resolved + v_n;

  select count(*) into v_hours_rows from public.outlet_hours where outlet_id = s.outlet_id;
  if v_hours_rows = 0 then
    v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'hours_missing', null, '{}'::jsonb, s.id);
    return jsonb_build_object('opened', case when v_new then 1 else 0 end, 'resolved', v_resolved, 'note', 'hours_missing');
  end if;
  update public.booking_alerts set status = 'resolved', resolved_at = now()
   where source_id = s.source_id and kind = 'hours_missing' and status in ('open', 'acknowledged');
  get diagnostics v_n = row_count;
  v_resolved := v_resolved + v_n;

  v_dow := extract(dow from s.target_date)::int;
  select count(*), count(*) filter (where h.is_closed) into v_day_rows, v_closed_rows
    from public.outlet_hours h where h.outlet_id = s.outlet_id and h.weekday = v_dow;
  v_closure := exists (select 1 from public.outlet_closures c
                        where c.outlet_id = s.outlet_id and s.target_date between c.date_from and c.date_to);

  if v_day_rows = 0 and not v_closure then
    null;  -- this weekday has no hours configured, so there is nothing to judge
  elsif v_closure or v_closed_rows > 0 then
    if cardinality(s.slots) > 0 then
      v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'slot_on_closed_day', s.target_date,
        jsonb_build_object(
          'slots', array(select substr(t::text, 1, 5) from unnest(s.slots) t order by t),
          'reason', case when v_closure then 'holiday_closure' else 'weekly_closed_day' end), s.id);
      v_raised := v_raised || 'slot_on_closed_day';
      if v_new then v_opened := v_opened + 1; end if;
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('from', substr(h.open_time::text, 1, 5),
                                                 'to', substr(h.last_booking_time::text, 1, 5)) order by h.open_time), '[]'::jsonb),
           min(h.open_time), max(h.close_time)
      into v_allowed, v_min_open, v_max_close
      from public.outlet_hours h
     where h.outlet_id = s.outlet_id and h.weekday = v_dow and not h.is_closed;

    select coalesce(array_agg(substr(t::text, 1, 5) order by t), '{}') into v_offending
      from unnest(s.slots) t
     where not exists (
       select 1 from public.outlet_hours h
        where h.outlet_id = s.outlet_id and h.weekday = v_dow and not h.is_closed
          and t >= h.open_time and t <= h.last_booking_time);

    if cardinality(v_offending) > 0 then
      v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'slot_outside_hours', s.target_date,
        jsonb_build_object('offending', to_jsonb(v_offending), 'allowed', v_allowed,
                           'slots_seen', cardinality(s.slots)), s.id);
      v_raised := v_raised || 'slot_outside_hours';
      if v_new then v_opened := v_opened + 1; end if;
    end if;

    if cardinality(s.slots) = 0 then
      -- an empty day only counts when the previous good check for the same day was empty too
      select (cardinality(p.slots) = 0) into v_prev_empty
        from public.booking_snapshots p
       where p.source_id = s.source_id and p.target_date = s.target_date and p.status = 'ok'
         and p.id <> s.id and p.checked_at < s.checked_at
       order by p.checked_at desc limit 1;
      if coalesce(v_prev_empty, false) then
        v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'no_slots_when_open', s.target_date,
          jsonb_build_object('open', substr(v_min_open::text, 1, 5), 'close', substr(v_max_close::text, 1, 5)), s.id);
        v_raised := v_raised || 'no_slots_when_open';
        if v_new then v_opened := v_opened + 1; end if;
      end if;
    end if;

    if s.window_labels is not null and jsonb_typeof(s.window_labels) = 'array' then
      select coalesce(jsonb_agg(l), '[]'::jsonb) into v_bad_labels
        from jsonb_array_elements(s.window_labels) l
       where (l ->> 'from') is not null and (l ->> 'to') is not null
         and ((l ->> 'from')::time < v_min_open or (l ->> 'to')::time > v_max_close);
      if jsonb_array_length(v_bad_labels) > 0 then
        v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'window_outside_hours', s.target_date,
          jsonb_build_object('windows', v_bad_labels, 'open', substr(v_min_open::text, 1, 5),
                             'close', substr(v_max_close::text, 1, 5)), s.id);
        v_raised := v_raised || 'window_outside_hours';
        if v_new then v_opened := v_opened + 1; end if;
      end if;
    end if;
  end if;

  -- anything for this source and day that is no longer true is resolved
  update public.booking_alerts set status = 'resolved', resolved_at = now()
   where source_id = s.source_id and target_date = s.target_date and status in ('open', 'acknowledged')
     and kind in ('slot_outside_hours', 'slot_on_closed_day', 'no_slots_when_open', 'window_outside_hours')
     and not (kind = any (v_raised));
  get diagnostics v_n = row_count;
  v_resolved := v_resolved + v_n;

  return jsonb_build_object('opened', v_opened, 'resolved', v_resolved, 'raised', to_jsonb(v_raised));
end
$$;

revoke execute on function private.is_service_role() from public, anon, authenticated;
revoke execute on function private.raise_booking_alert(uuid, uuid, text, date, jsonb, uuid) from public, anon, authenticated;
revoke execute on function private.apply_booking_rules(uuid) from public, anon, authenticated;

-- ---------- Table privileges ----------
revoke all on public.outlet_hours, public.outlet_closures, public.booking_sources,
  public.booking_snapshots, public.booking_alerts, public.alert_recipients from anon;
revoke truncate, references, trigger on public.outlet_hours, public.outlet_closures, public.booking_sources,
  public.booking_snapshots, public.booking_alerts, public.alert_recipients from authenticated;
revoke insert, update, delete on public.booking_snapshots, public.booking_alerts from authenticated;

-- ---------- Row-level security ----------
alter table public.outlet_hours enable row level security;
alter table public.outlet_closures enable row level security;
alter table public.booking_sources enable row level security;
alter table public.booking_snapshots enable row level security;
alter table public.booking_alerts enable row level security;
alter table public.alert_recipients enable row level security;

create policy outlet_hours_select on public.outlet_hours for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy outlet_hours_insert on public.outlet_hours for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy outlet_hours_update on public.outlet_hours for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy outlet_hours_delete on public.outlet_hours for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

create policy outlet_closures_select on public.outlet_closures for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy outlet_closures_insert on public.outlet_closures for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy outlet_closures_update on public.outlet_closures for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy outlet_closures_delete on public.outlet_closures for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

create policy booking_sources_select on public.booking_sources for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy booking_sources_insert on public.booking_sources for insert to authenticated
  with check (private.can_manage_outlet(outlet_id));
create policy booking_sources_update on public.booking_sources for update to authenticated
  using (private.can_manage_outlet(outlet_id)) with check (private.can_manage_outlet(outlet_id));
create policy booking_sources_delete on public.booking_sources for delete to authenticated
  using (private.can_manage_outlet(outlet_id));

create policy booking_snapshots_select on public.booking_snapshots for select to authenticated
  using (private.can_manage_outlet(outlet_id));
create policy booking_alerts_select on public.booking_alerts for select to authenticated
  using (private.can_manage_outlet(outlet_id));

create policy alert_recipients_select on public.alert_recipients for select to authenticated
  using (private.can_manage_org(organization_id));
create policy alert_recipients_insert on public.alert_recipients for insert to authenticated
  with check (private.can_manage_org(organization_id));
create policy alert_recipients_update on public.alert_recipients for update to authenticated
  using (private.can_manage_org(organization_id)) with check (private.can_manage_org(organization_id));
create policy alert_recipients_delete on public.alert_recipients for delete to authenticated
  using (private.can_manage_org(organization_id));

-- ---------- Record one check (by the automatic checker, or typed in by a manager) ----------
create or replace function public.submit_booking_snapshot(
  p_source_id uuid,
  p_target_date date,
  p_slots jsonb,
  p_status text default 'ok',
  p_error text default null,
  p_window_labels jsonb default null,
  p_screenshot_path text default null,
  p_party_size int default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_src public.booking_sources%rowtype;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_date date;
  v_slots time[];
  v_id uuid;
  v_res jsonb;
  v_time_re constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  select * into v_src from public.booking_sources s where s.id = p_source_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (private.is_service_role() or private.can_manage_outlet(v_src.outlet_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if not v_src.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if p_status is null or p_status not in ('ok', 'failed', 'blocked') then
    return jsonb_build_object('ok', false, 'reason', 'bad_status');
  end if;

  v_date := coalesce(p_target_date, v_today);
  if v_date < v_today - 1 or v_date > v_today + 60 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;
  if exists (select 1 from jsonb_array_elements(p_slots) e
              where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ v_time_re) then
    return jsonb_build_object('ok', false, 'reason', 'bad_slots');
  end if;

  if p_window_labels is not null and (
       jsonb_typeof(p_window_labels) <> 'array' or jsonb_array_length(p_window_labels) > 10
       or exists (select 1 from jsonb_array_elements(p_window_labels) l
                   where jsonb_typeof(l) <> 'object'
                      or ((l ->> 'from') is not null and (l ->> 'from') !~ v_time_re)
                      or ((l ->> 'to') is not null and (l ->> 'to') !~ v_time_re))) then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  if btrim(coalesce(p_screenshot_path, '')) <> '' and not private.photo_ok(v_src.outlet_id, p_screenshot_path) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_screenshot');
  end if;

  select coalesce(array_agg(distinct (x)::time order by (x)::time), '{}') into v_slots
    from jsonb_array_elements_text(p_slots) x;

  insert into public.booking_snapshots
    (source_id, outlet_id, target_date, party_size, slots, window_labels, status, error,
     screenshot_path, entered_by, entry_method)
  values
    (v_src.id, v_src.outlet_id, v_date, coalesce(p_party_size, v_src.party_size), v_slots, p_window_labels,
     p_status, left(p_error, 500), nullif(btrim(coalesce(p_screenshot_path, '')), ''),
     (select auth.uid()), case when private.is_service_role() then 'auto' else 'manual' end)
  returning id into v_id;

  update public.booking_sources
     set last_checked_at = now(), last_status = p_status, last_error = left(p_error, 500)
   where id = v_src.id;

  v_res := private.apply_booking_rules(v_id);
  return jsonb_build_object('ok', true, 'snapshot_id', v_id, 'slots', cardinality(v_slots), 'alerts', v_res);
end
$$;

-- ---------- A manager acknowledges an alert ----------
create or replace function public.acknowledge_booking_alert(p_alert_id uuid, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v public.booking_alerts%rowtype;
  v_name text;
begin
  select * into v from public.booking_alerts a where a.id = p_alert_id;
  if not found or not private.can_manage_outlet(v.outlet_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if v.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  select p.full_name into v_name from public.profiles p where p.id = (select auth.uid());
  update public.booking_alerts
     set status = 'acknowledged', ack_by = (select auth.uid()), ack_by_name = v_name,
         ack_note = nullif(btrim(coalesce(p_note, '')), ''), ack_at = now()
   where id = p_alert_id;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- Raise "no recent check" alerts (run regularly; also callable by managers) ----------
create or replace function public.booking_health_sweep()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_hours int;
  v_new boolean;
  v_n int;
  v_opened int := 0;
  v_resolved int := 0;
begin
  if not (private.is_service_role() or private.my_role() in ('peerco_admin', 'owner', 'manager')) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  for r in
    select s.id, s.outlet_id, s.method, s.check_every_hours, s.last_checked_at, s.created_at
      from public.booking_sources s
      join public.outlets o on o.id = s.outlet_id
     where s.active and o.active
       and (private.is_service_role() or private.can_manage_outlet(s.outlet_id))
  loop
    v_hours := case when r.method = 'manual' then 24 else greatest(r.check_every_hours * 2, 6) end;
    if coalesce(r.last_checked_at, r.created_at) < now() - make_interval(hours => v_hours) then
      v_new := private.raise_booking_alert(r.outlet_id, r.id, 'check_stale', null,
        jsonb_build_object('last_checked_at', r.last_checked_at, 'threshold_hours', v_hours, 'method', r.method), null);
      if v_new then v_opened := v_opened + 1; end if;
    else
      update public.booking_alerts set status = 'resolved', resolved_at = now()
       where source_id = r.id and kind = 'check_stale' and status in ('open', 'acknowledged');
      get diagnostics v_n = row_count;
      v_resolved := v_resolved + v_n;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'opened', v_opened, 'resolved', v_resolved);
end
$$;

revoke execute on function public.submit_booking_snapshot(uuid, date, jsonb, text, text, jsonb, text, int) from public, anon;
revoke execute on function public.acknowledge_booking_alert(uuid, text) from public, anon;
revoke execute on function public.booking_health_sweep() from public, anon;
grant execute on function public.submit_booking_snapshot(uuid, date, jsonb, text, text, jsonb, text, int) to authenticated, service_role;
grant execute on function public.acknowledge_booking_alert(uuid, text) to authenticated, service_role;
grant execute on function public.booking_health_sweep() to authenticated, service_role;
