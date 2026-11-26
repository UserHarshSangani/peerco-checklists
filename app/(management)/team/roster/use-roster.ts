"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import type { TeamSettings } from "@/lib/team/settings/registry";
import { addDays, type Segment } from "@/lib/team/engines/time";
import type { StaffingMinimum } from "@/lib/team/engines/coverage";

export type RosterStaff = {
  id: string;
  name: string;
  gender: "male" | "female" | "other" | null;
  lateShiftConsent: boolean;
  skills: string[];
};

export type RosterTemplate = {
  id: string;
  name: string;
  segments: Segment[];
  break_minutes: number;
  paid_break: boolean;
  active: boolean;
};

export type RosterEntry = {
  id: string;
  staff_id: string;
  business_date: string;
  kind: "work" | "weekly_off";
  shift_template_id: string | null;
  segments: Segment[];
  extended_until: string | null;
  role_skill: string | null;
};

export const ENTRY_COLUMNS = "id, staff_id, business_date, kind, shift_template_id, segments, extended_until, role_skill";

export type RosterData = {
  settings: TeamSettings;
  staff: RosterStaff[];
  templates: RosterTemplate[];
  minimums: StaffingMinimum[];
  /** Entries for the week and the week before it (for last week's day off). */
  entries: RosterEntry[];
  /** "staffId|date" for people marked unavailable this week. */
  unavailable: Set<string>;
};

type StaffRow = {
  id: string;
  name: string;
  staff_profiles: { gender: RosterStaff["gender"]; late_shift_consent: boolean; employment_status: string } | null;
  staff_skills: { skill: string }[];
};

async function loadRoster(supabase: SupabaseClient, outletId: string, weekStart: string): Promise<Omit<RosterData, "settings">> {
  const from = addDays(weekStart, -7);
  const to = addDays(weekStart, 6);
  const [staff, templates, minimums, entries, availability] = await Promise.all([
    supabase
      .from("staff")
      .select("id, name, staff_profiles(gender, late_shift_consent, employment_status), staff_skills(skill)")
      .eq("outlet_id", outletId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("shift_templates")
      .select("id, name, segments, break_minutes, paid_break, active")
      .eq("outlet_id", outletId)
      .order("name"),
    supabase
      .from("staffing_minimums")
      .select("role_skill, weekday, slot_start, slot_end, min_count")
      .eq("outlet_id", outletId),
    supabase
      .from("roster_entries")
      .select(ENTRY_COLUMNS)
      .eq("outlet_id", outletId)
      .gte("business_date", from)
      .lte("business_date", to),
    supabase
      .from("staff_availability")
      .select("staff_id, business_date, available")
      .eq("outlet_id", outletId)
      .gte("business_date", weekStart)
      .lte("business_date", to),
  ]);
  const failed = [staff, templates, minimums, entries, availability].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return {
    staff: ((staff.data ?? []) as unknown as StaffRow[])
      .map((row) => ({ row, profile: one(row.staff_profiles) }))
      .filter(({ profile }) => !profile || !["exited", "absconded"].includes(profile.employment_status))
      .map(({ row, profile }) => ({
        id: row.id,
        name: row.name,
        gender: profile?.gender ?? null,
        lateShiftConsent: profile?.late_shift_consent ?? false,
        skills: row.staff_skills.map((s) => s.skill),
      })),
    templates: (templates.data ?? []) as RosterTemplate[],
    minimums: (minimums.data ?? []).map((m) => ({
      skill: m.role_skill as string,
      weekday: m.weekday as number | null,
      slotStart: (m.slot_start as string).slice(0, 5),
      slotEnd: (m.slot_end as string).slice(0, 5),
      minCount: m.min_count as number,
    })),
    entries: ((entries.data ?? []) as RosterEntry[]).map((e) => ({
      ...e,
      extended_until: e.extended_until ? e.extended_until.slice(0, 5) : null,
    })),
    unavailable: new Set(
      (availability.data ?? []).filter((a) => !a.available).map((a) => `${a.staff_id}|${a.business_date}`),
    ),
  };
}

/** Settings first (they decide when the week starts), then the week's data. */
export function useRoster(supabase: SupabaseClient, outletId: string) {
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [data, setData] = useState<Omit<RosterData, "settings"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTeamSettings(supabase, outletId)
      .then((s) => !cancelled && setSettings(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  const reload = useCallback(async () => {
    if (!weekStart) return;
    try {
      setData(await loadRoster(supabase, outletId, weekStart));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [supabase, outletId, weekStart]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the visible week
    void reload();
  }, [reload]);

  const value = useMemo(() => (settings && data ? { ...data, settings } : null), [settings, data]);
  return { data: value, settings, weekStart, setWeekStart, setData, reload, error };
}
