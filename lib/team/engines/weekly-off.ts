// Fair weekly-off helper. For everyone working all week with no weekly off,
// suggest the day that hurts coverage least. Ties go to the day with the
// fewest people already off (spreads offs across the week), then to the
// person's weekday off from last week (people like a steady day off), then
// to the earliest day. A suggestion only — the manager applies it.

import { coverageGaps, shortfallMinutes, type CoverageShift, type StaffingMinimum } from "./coverage";
import { weekdayOf } from "./time";

export type WeekPlan = {
  dates: readonly string[];
  /** Work shifts by date. */
  shifts: Readonly<Record<string, readonly CoverageShift[]>>;
  /** People already given a weekly off this week. */
  alreadyOff: ReadonlySet<string>;
  /** Per person: the weekday (0–6) they had off last week, if any. */
  lastOffWeekday: Readonly<Record<string, number | undefined>>;
  minimums: readonly StaffingMinimum[];
};

export type OffSuggestion = { staffId: string; date: string; addsShortfallMinutes: number };

export function suggestWeeklyOffs(plan: WeekPlan): OffSuggestion[] {
  const shifts: Record<string, CoverageShift[]> = Object.fromEntries(
    plan.dates.map((d) => [d, [...(plan.shifts[d] ?? [])]]),
  );
  const offCount: Record<string, number> = Object.fromEntries(plan.dates.map((d) => [d, 0]));
  const cost = (date: string, list: readonly CoverageShift[]) =>
    shortfallMinutes(coverageGaps(list, plan.minimums, weekdayOf(date)));

  const workDays = (staffId: string) => plan.dates.filter((d) => shifts[d].some((s) => s.staffId === staffId));
  const people = [...new Set(plan.dates.flatMap((d) => shifts[d].map((s) => s.staffId)))]
    .filter((id) => !plan.alreadyOff.has(id) && workDays(id).length === plan.dates.length)
    .sort();

  const suggestions: OffSuggestion[] = [];
  for (const staffId of people) {
    let best: { date: string; added: number; off: number; steady: boolean } | null = null;
    for (const date of plan.dates) {
      const without = shifts[date].filter((s) => s.staffId !== staffId);
      const added = cost(date, without) - cost(date, shifts[date]);
      const candidate = { date, added, off: offCount[date], steady: plan.lastOffWeekday[staffId] === weekdayOf(date) };
      if (
        !best ||
        candidate.added < best.added ||
        (candidate.added === best.added && candidate.off < best.off) ||
        (candidate.added === best.added && candidate.off === best.off && candidate.steady && !best.steady)
      ) {
        best = candidate;
      }
    }
    if (!best) continue;
    shifts[best.date] = shifts[best.date].filter((s) => s.staffId !== staffId);
    offCount[best.date] += 1;
    suggestions.push({ staffId, date: best.date, addsShortfallMinutes: best.added });
  }
  return suggestions;
}
