// Who can be asked to cover a slot, and in what order. Pure — the cover
// screen feeds it the outlet's people, their week of roster, leave,
// availability and overtime this month. The database checks each person
// again (skill, leave, availability, free slot) when the offers go out.
//
// Fair rotation: people with fewer overtime minutes this month are asked
// first; ties go by name. Someone is left out when taking the slot would
// break a working-hours rule (daily/weekly limit, rest between shifts, a
// seventh working day) or the women's late-shift rule that their week
// doesn't already break.

import { DAY_MINUTES, fromMinutes, segmentsToIntervals, toMinutes, type Segment } from "./time";
import { checkRosterWeek, type HoursRules, type Person, type RosterDay, type RosterWarning } from "./roster-rules";

export type CoverSlot = { date: string; skill: string; start: string; end: string };

export type Candidate = Person & {
  staffId: string;
  name: string;
  skills: readonly string[];
  /** This person's roster for the week around the slot's date. */
  week: readonly RosterDay[];
  onLeave: boolean;
  unavailable: boolean;
  /** Overtime minutes already planned or worked this month. */
  otMinutesThisMonth: number;
};

export type ExcludeReason = "no_skill" | "on_leave" | "unavailable" | "busy" | RosterWarning["kind"];

export type EligibilityResult = {
  eligible: { staffId: string; name: string; otMinutesThisMonth: number }[];
  excluded: { staffId: string; name: string; reason: ExcludeReason }[];
};

/**
 * The day's segments with the slot added — same rules as
 * private.team_roster_with_slot: an extension is folded into the last
 * segment, a slot in the after-midnight tail of a late shift is read as
 * after midnight, touching segments merge. Null when it overlaps or won't
 * fit in 3 segments within 24 hours.
 */
export function addSlot(
  segments: readonly Segment[],
  extendedUntil: string | null | undefined,
  start: string,
  end: string,
): Segment[] | null {
  let s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) return null;
  const intervals = segmentsToIntervals(segments).map(([a, b]) => [a, b] as [number, number]);
  if (intervals.length && extendedUntil) {
    const last = intervals[intervals.length - 1];
    let ext = toMinutes(extendedUntil);
    while (ext < last[0]) ext += DAY_MINUTES;
    last[1] = Math.max(last[1], ext);
  }
  if (intervals.length && intervals[intervals.length - 1][1] > DAY_MINUTES && s + DAY_MINUTES >= intervals[0][0]) {
    s += DAY_MINUTES;
    e += DAY_MINUTES;
  }
  const all = [...intervals, [s, e] as [number, number]].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of all) {
    const prev = merged[merged.length - 1];
    if (prev && a < prev[1]) return null;
    if (prev && a === prev[1]) prev[1] = b;
    else merged.push([a, b]);
  }
  if (merged.length > 3 || merged[merged.length - 1][1] - merged[0][0] > DAY_MINUTES) return null;
  return merged.map(([a, b]) => ({ start: fromMinutes(a), end: fromMinutes(b) }));
}

/** The person's week as it would be if they took the slot. Null = it doesn't fit. */
export function weekWithSlot(week: readonly RosterDay[], slot: CoverSlot): RosterDay[] | null {
  const day = week.find((d) => d.date === slot.date);
  if (!day || day.kind === "weekly_off") {
    const added: RosterDay = { date: slot.date, kind: "work", segments: [{ start: slot.start, end: slot.end }] };
    return [...week.filter((d) => d.date !== slot.date), added];
  }
  const segments = addSlot(day.segments, day.extendedUntil, slot.start, slot.end);
  if (!segments) return null;
  return week.map((d) => (d.date === slot.date ? { ...d, segments, extendedUntil: null } : d));
}

const warningKey = (w: RosterWarning) => ("date" in w ? `${w.kind}:${w.date}` : w.kind);

// Most serious first, so the reason shown is the one that matters.
const ORDER: RosterWarning["kind"][] = ["late_without_consent", "short_rest", "daily_over", "weekly_over", "no_weekly_off"];

export function coverEligibility(slot: CoverSlot, people: readonly Candidate[], rules: HoursRules): EligibilityResult {
  const eligible: EligibilityResult["eligible"] = [];
  const excluded: EligibilityResult["excluded"] = [];
  for (const p of people) {
    const out = (reason: ExcludeReason) => excluded.push({ staffId: p.staffId, name: p.name, reason });
    if (!p.skills.includes(slot.skill)) { out("no_skill"); continue; }
    if (p.onLeave) { out("on_leave"); continue; }
    if (p.unavailable) { out("unavailable"); continue; }
    const after = weekWithSlot(p.week, slot);
    if (!after) { out("busy"); continue; }
    const before = new Set(checkRosterWeek(p.week, p, rules).map(warningKey));
    const added = checkRosterWeek(after, p, rules).filter((w) => !before.has(warningKey(w)));
    if (added.length) {
      out([...added].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))[0].kind);
      continue;
    }
    eligible.push({ staffId: p.staffId, name: p.name, otMinutesThisMonth: p.otMinutesThisMonth });
  }
  eligible.sort((a, b) => a.otMinutesThisMonth - b.otMinutesThisMonth || a.name.localeCompare(b.name));
  return { eligible, excluded };
}

/** Offers go out `batchSize` at a time: wave numbers in rotation order. */
export function waves<T>(ordered: readonly T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const out: T[][] = [];
  for (let i = 0; i < ordered.length; i += size) out.push(ordered.slice(i, i + size));
  return out;
}

/**
 * Overtime pay in paise, same as private.team_ot_hourly / team_ot_amount:
 * daily wage ÷ standard shift hours, or monthly wages ÷ working days ÷
 * standard shift hours; × minutes × multiplier.
 */
export function overtimeAmount(input: {
  wageType: "monthly" | "daily";
  /** Daily rate for daily wage; the monthly wages used for OT (basic + DA, or gross) otherwise. */
  wagesPaise: number;
  workingDays: number;
  standardShiftMinutes: number;
  minutes: number;
  multiplierBps: number;
}): number {
  const std = Math.max(60, input.standardShiftMinutes);
  const days = input.workingDays > 0 ? input.workingDays : 26;
  const hourly = input.wageType === "daily" ? (input.wagesPaise * 60) / std : (input.wagesPaise * 60) / (days * std);
  return Math.round(((hourly * input.minutes) / 60) * input.multiplierBps / 10000);
}

/** Minutes between two "HH:MM" on one day. */
export function slotMinutes(start: string, end: string): number {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}
