-- =========================================================
-- Daybook Team — Milestone 3: shifts, roster, staffing minimums
--
--  * Shift times are checked in the database too: 1–3 "HH:MM" segments,
--    in order, not overlapping, at most 24 hours from first start to last
--    end. An end at or before its start runs past midnight (18:00–01:00).
--  * Staffing minimum slots may now run past midnight (22:00–01:00).
--  * A roster entry can only use a shift template from its own outlet.
--  * Roster changes go into the audit log (they settle pay disputes later).
--  * public.team_copy_roster_week: copies one week's roster onto another
--    for people still working there. Runs with the caller's own access.
-- =========================================================

-- Same rules as validSegments() in lib/team/engines/time.ts.
create or replace function private.team_valid_segments(p_segments jsonb)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  v_seg jsonb;
  v_start int;
  v_end int;
  v_first int;
  v_prev_end int := -1;
begin
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) not between 1 and 3 then
    return false;
  end if;
  for v_seg in select value from jsonb_array_elements(p_segments) loop
    if jsonb_typeof(v_seg) <> 'object'
       or jsonb_typeof(v_seg -> 'start') is distinct from 'string'
       or jsonb_typeof(v_seg -> 'end') is distinct from 'string'
       or (v_seg ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_seg ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_seg ->> 'start') = (v_seg ->> 'end') then
      return false;
    end if;
    v_start := split_part(v_seg ->> 'start', ':', 1)::int * 60 + split_part(v_seg ->> 'start', ':', 2)::int;
    v_end := split_part(v_seg ->> 'end', ':', 1)::int * 60 + split_part(v_seg ->> 'end', ':', 2)::int;
    if v_end <= v_start then v_end := v_end + 1440; end if;
    while v_start < v_prev_end loop
      v_start := v_start + 1440;
      v_end := v_end + 1440;
    end loop;
    v_first := coalesce(v_first, v_start);
    v_prev_end := v_end;
  end loop;
  return v_prev_end - v_first <= 1440;
end
$$;

alter table public.shift_templates
  add constraint shift_templates_segments_valid check (private.team_valid_segments(segments)),
  add constraint shift_templates_break_sane check (break_minutes <= 240);

alter table public.roster_entries drop constraint if exists roster_entries_check;
alter table public.roster_entries
  add constraint roster_entries_kind_segments check (
    (kind = 'weekly_off' and segments = '[]'::jsonb and extended_until is null)
    or (kind = 'work' and private.team_valid_segments(segments))
  ),
  add constraint roster_entries_role_skill_format check (role_skill ~ '^[a-z][a-z0-9_]*$');

alter table public.staffing_minimums drop constraint if exists staffing_minimums_check;
alter table public.staffing_minimums
  add constraint staffing_minimums_slot_not_empty check (slot_end <> slot_start),
  add constraint staffing_minimums_role_skill_format check (role_skill ~ '^[a-z][a-z0-9_]*$');

-- A roster entry's shift template must belong to the same outlet.
create or replace function private.roster_template_same_outlet()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.shift_template_id is not null and not exists (
    select 1 from public.shift_templates st
     where st.id = new.shift_template_id and st.outlet_id = new.outlet_id
  ) then
    raise exception 'shift template belongs to another outlet' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end
$$;

-- Named to fire after roster_entries_fill_outlet (triggers run in name order).
create trigger roster_entries_template_outlet before insert or update on public.roster_entries
  for each row execute function private.roster_template_same_outlet();

create trigger roster_entries_audit after insert or update or delete on public.roster_entries
  for each row execute function private.audit_row();

-- Copy a week (7 days from p_from_start) onto the week starting p_to_start.
-- Skips people who are inactive, exited or absconded. Existing entries in
-- the target week are kept unless p_overwrite. Returns rows written.
create or replace function public.team_copy_roster_week(
  p_outlet uuid, p_from_start date, p_to_start date, p_overwrite boolean default false
)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_shift int := p_to_start - p_from_start;
  v_count int;
begin
  if not private.can_manage_outlet(p_outlet) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_shift = 0 or v_shift % 7 <> 0 then
    raise exception 'weeks must be whole weeks apart' using errcode = '22023';
  end if;

  if p_overwrite then
    delete from public.roster_entries re
     where re.outlet_id = p_outlet
       and re.business_date between p_to_start and p_to_start + 6
       and exists (select 1 from public.roster_entries src
                    where src.outlet_id = p_outlet and src.staff_id = re.staff_id
                      and src.business_date between p_from_start and p_from_start + 6);
  end if;

  insert into public.roster_entries
    (outlet_id, staff_id, business_date, kind, shift_template_id, segments, role_skill, source)
  select src.outlet_id, src.staff_id, src.business_date + v_shift, src.kind, src.shift_template_id,
         src.segments, src.role_skill, 'copied'
    from public.roster_entries src
    join public.staff s on s.id = src.staff_id and s.active
    left join public.staff_profiles sp on sp.staff_id = src.staff_id
   where src.outlet_id = p_outlet
     and src.business_date between p_from_start and p_from_start + 6
     and coalesce(sp.employment_status, 'active') not in ('exited', 'absconded')
  on conflict (staff_id, business_date) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke execute on function public.team_copy_roster_week(uuid, date, date, boolean) from public, anon;
grant execute on function public.team_copy_roster_week(uuid, date, date, boolean) to authenticated;
revoke execute on function private.team_valid_segments(jsonb) from public, anon;
grant execute on function private.team_valid_segments(jsonb) to authenticated;
