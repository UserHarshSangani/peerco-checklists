
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
  v_raised text[] := '{}'::text[];
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
      v_raised := array_append(v_raised, 'slot_on_closed_day');
      if v_new then v_opened := v_opened + 1; end if;
    end if;
  else
    select coalesce(jsonb_agg(jsonb_build_object('from', substr(h.open_time::text, 1, 5),
                                                 'to', substr(h.last_booking_time::text, 1, 5)) order by h.open_time), '[]'::jsonb),
           min(h.open_time), max(h.close_time)
      into v_allowed, v_min_open, v_max_close
      from public.outlet_hours h
     where h.outlet_id = s.outlet_id and h.weekday = v_dow and not h.is_closed;

    select coalesce(array_agg(substr(t::text, 1, 5) order by t), '{}'::text[]) into v_offending
      from unnest(s.slots) t
     where not exists (
       select 1 from public.outlet_hours h
        where h.outlet_id = s.outlet_id and h.weekday = v_dow and not h.is_closed
          and t >= h.open_time and t <= h.last_booking_time);

    if cardinality(v_offending) > 0 then
      v_new := private.raise_booking_alert(s.outlet_id, s.source_id, 'slot_outside_hours', s.target_date,
        jsonb_build_object('offending', to_jsonb(v_offending), 'allowed', v_allowed,
                           'slots_seen', cardinality(s.slots)), s.id);
      v_raised := array_append(v_raised, 'slot_outside_hours');
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
        v_raised := array_append(v_raised, 'no_slots_when_open');
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
        v_raised := array_append(v_raised, 'window_outside_hours');
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

revoke execute on function private.apply_booking_rules(uuid) from public, anon, authenticated;
