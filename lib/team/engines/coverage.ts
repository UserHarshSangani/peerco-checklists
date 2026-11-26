// Coverage engine: who is on the floor, minute by minute, against the
// outlet's staffing minimums. Pure — the roster screen, the leave impact
// preview (M5) and cover requests (M6) all feed it plain data.
//
// Example (the fixture in the tests): floor needs 1 person 12:00–23:00.
// Rishabh works 12:00–21:00, Rajeev 14:00–23:00. If Rajeev leaves at
// 19:00 the floor is empty 21:00–23:00 — one gap, short by 1.

import { DAY_MINUTES, fromMinutes, segmentsToIntervals, toMinutes, type Interval, type Segment } from "./time";

export type CoverageShift = {
  staffId: string;
  /** What they're rostered as that day (roster_entries.role_skill). */
  skill: string | null;
  segments: readonly Segment[];
  /** A cover request stretched the shift's last segment to this time. */
  extendedUntil?: string | null;
  /** Arrives late / half-day starting at this time. */
  arriveAt?: string | null;
  /** Leaves early / half-day ending at this time. */
  leaveAt?: string | null;
};

export type StaffingMinimum = {
  skill: string;
  /** 0 = Sunday … 6 = Saturday; null = every day. */
  weekday: number | null;
  slotStart: string;
  slotEnd: string;
  minCount: number;
};

export type CoverageGap = {
  skill: string;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  needed: number;
  have: number;
  short: number;
};

/** A clock time read as the first moment at or after `anchor` (so 01:00 after an 18:00 start is next-day). */
function timeAtOrAfter(time: string, anchor: number): number {
  let minute = toMinutes(time);
  while (minute < anchor) minute += DAY_MINUTES;
  return minute;
}

/** The time a person is actually there, after extensions, late arrival and early leave. */
export function presence(shift: CoverageShift): Interval[] {
  const intervals = segmentsToIntervals(shift.segments).map(([s, e]) => [s, e] as [number, number]);
  if (intervals.length === 0) return [];
  const first = intervals[0][0];
  if (shift.extendedUntil) {
    const last = intervals[intervals.length - 1];
    last[1] = Math.max(last[1], timeAtOrAfter(shift.extendedUntil, last[0]));
  }
  const from = shift.arriveAt ? timeAtOrAfter(shift.arriveAt, first) : -Infinity;
  const to = shift.leaveAt ? timeAtOrAfter(shift.leaveAt, first) : Infinity;
  return intervals
    .map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as const)
    .filter(([s, e]) => e > s);
}

/**
 * The minimums that apply on a weekday. For each skill, rows set for that
 * exact weekday replace the every-day rows — so "Saturday: 3 on the floor"
 * overrides "every day: 2 on the floor" without adding to it.
 */
export function minimumsForWeekday(minimums: readonly StaffingMinimum[], weekday: number): StaffingMinimum[] {
  const specific = new Set(minimums.filter((m) => m.weekday === weekday).map((m) => m.skill));
  return minimums.filter((m) => (m.weekday === weekday ? true : m.weekday === null && !specific.has(m.skill)));
}

function slotInterval(m: StaffingMinimum): Interval {
  const start = toMinutes(m.slotStart);
  let end = toMinutes(m.slotEnd);
  if (end <= start) end += DAY_MINUTES;
  return [start, end];
}

/** Gaps for one business day. Exact to the minute (a sweep over change points, no time buckets). */
export function coverageGaps(
  shifts: readonly CoverageShift[],
  minimums: readonly StaffingMinimum[],
  weekday: number,
): CoverageGap[] {
  const rules = minimumsForWeekday(minimums, weekday).filter((m) => m.minCount > 0);
  const skills = [...new Set(rules.map((r) => r.skill))].sort();
  const gaps: CoverageGap[] = [];

  for (const skill of skills) {
    const need = rules.filter((r) => r.skill === skill).map((r) => ({ iv: slotInterval(r), count: r.minCount }));
    const on = shifts.filter((s) => s.skill === skill).flatMap(presence);
    const points = [...new Set([...need.flatMap((n) => n.iv), ...on.flat()])].sort((a, b) => a - b);

    let open: CoverageGap | null = null;
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      // Overlapping rules for the same skill: the larger number wins.
      const needed = Math.max(0, ...need.filter((n) => n.iv[0] <= a && n.iv[1] >= b).map((n) => n.count));
      const have = on.filter(([s, e]) => s <= a && e >= b).length;
      if (needed > have) {
        if (open && open.endMinute === a && open.needed === needed && open.have === have) {
          open.endMinute = b;
          open.end = fromMinutes(b);
        } else {
          if (open) gaps.push(open);
          open = { skill, start: fromMinutes(a), end: fromMinutes(b), startMinute: a, endMinute: b, needed, have, short: needed - have };
        }
      } else if (open) {
        gaps.push(open);
        open = null;
      }
    }
    if (open) gaps.push(open);
  }
  return gaps;
}

/** Person-minutes missing (a 2-hour gap short by 1 = 120). Lets two rosters be compared. */
export function shortfallMinutes(gaps: readonly CoverageGap[]): number {
  return gaps.reduce((sum, g) => sum + (g.endMinute - g.startMinute) * g.short, 0);
}
