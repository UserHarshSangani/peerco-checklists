// Working-hours checks for one person's week of roster. Warnings only — the
// manager can still save; the limits come from Team settings (hours.*).

import { DAY_MINUTES, segmentsToIntervals, spanMinutes, toMinutes, type Segment } from "./time";
import { presence } from "./coverage";

export type RosterDay = {
  date: string;
  kind: "work" | "weekly_off";
  segments: readonly Segment[];
  extendedUntil?: string | null;
  /** Unpaid break inside the shift (from its shift template). */
  unpaidBreakMinutes?: number;
};

export type HoursRules = {
  maxDailyMinutes: number;
  maxWeeklyMinutes: number;
  minRestMinutes: number;
  /** "19:00": women working after this need consent (and transport) on file. */
  womenLateCutoff: string;
};

export type Person = { gender: "male" | "female" | "other" | null; lateShiftConsent: boolean };

export type RosterWarning =
  | { kind: "daily_over"; date: string; minutes: number }
  | { kind: "weekly_over"; minutes: number }
  | { kind: "short_rest"; date: string; minutes: number }
  | { kind: "late_without_consent"; date: string }
  | { kind: "no_weekly_off" };

function dayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function workedMinutes(day: RosterDay): number {
  if (day.kind !== "work") return 0;
  const span = spanMinutes(presence({ staffId: "", skill: null, segments: day.segments, extendedUntil: day.extendedUntil }));
  return Math.max(0, span - (day.unpaidBreakMinutes ?? 0));
}

/** `days` = one person's entries for one week (any order, missing days = not rostered). */
export function checkRosterWeek(days: readonly RosterDay[], person: Person, rules: HoursRules): RosterWarning[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const warnings: RosterWarning[] = [];
  let weekly = 0;

  for (const day of sorted) {
    if (day.kind !== "work") continue;
    const minutes = workedMinutes(day);
    weekly += minutes;
    if (minutes > rules.maxDailyMinutes) warnings.push({ kind: "daily_over", date: day.date, minutes });
    if (person.gender === "female" && !person.lateShiftConsent) {
      const cutoff = toMinutes(rules.womenLateCutoff);
      const ends = presence({ staffId: "", skill: null, segments: day.segments, extendedUntil: day.extendedUntil });
      if (ends.some(([, end]) => end > cutoff)) warnings.push({ kind: "late_without_consent", date: day.date });
    }
  }
  if (weekly > rules.maxWeeklyMinutes) warnings.push({ kind: "weekly_over", minutes: weekly });

  // Rest between one day's last minute and the next day's first.
  const work = sorted.filter((d) => d.kind === "work" && d.segments.length > 0);
  for (let i = 1; i < work.length; i++) {
    const prev = work[i - 1];
    const next = work[i];
    const prevIv = presence({ staffId: "", skill: null, segments: prev.segments, extendedUntil: prev.extendedUntil });
    const nextIv = segmentsToIntervals(next.segments);
    const prevEnd = dayIndex(prev.date) * DAY_MINUTES + prevIv[prevIv.length - 1][1];
    const nextStart = dayIndex(next.date) * DAY_MINUTES + nextIv[0][0];
    const rest = nextStart - prevEnd;
    if (rest < rules.minRestMinutes) warnings.push({ kind: "short_rest", date: next.date, minutes: Math.max(0, rest) });
  }

  if (sorted.filter((d) => d.kind === "work").length >= 7) warnings.push({ kind: "no_weekly_off" });
  return warnings;
}
