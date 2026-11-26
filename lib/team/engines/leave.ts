// Leave engine. Pure: the staff request form, the manager's approval screen
// and the balances table use it. The database (public.team_request_leave,
// team_decide_leave, private.team_leave_run) is the authority and follows
// the same rules — the tests here and in supabase/tests pin both.
//
// Units: minutes. One leave day = the outlet's standard shift
// (hours.standard_shift_minutes); a half day is half of that.

import { coverageGaps, shortfallMinutes, type CoverageGap, type CoverageShift, type StaffingMinimum } from "./coverage";
import { addDays, weekdayOf } from "./time";

export type LeaveRules = {
  /** 0 = no yearly credit (comp-off, unpaid). */
  perYearDays: number;
  /** null = carries over in full; 0 = all of it lapses at year end. */
  carryForwardMaxDays: number | null;
  encashable: boolean;
  /** Can be asked for on the day (sick leave). */
  sameDay: boolean;
  /** Proof photo needed when longer than this many days (only if the type needs proof). */
  proofAfterDays: number | null;
};

export type LeaveType = {
  id: string;
  code: string;
  name: string;
  paid: boolean;
  needsProof: boolean;
  active: boolean;
  rules: LeaveRules;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reads leave_types.accrual, falling back safely on anything missing. */
export function parseRules(raw: unknown): LeaveRules {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    perYearDays: Math.max(0, num(o.per_year_days) ?? 0),
    carryForwardMaxDays: num(o.carry_forward_max_days),
    encashable: o.encashable === true,
    sameDay: o.same_day === true,
    proofAfterDays: num(o.proof_after_days),
  };
}

/** Back to the jsonb shape, keeping any keys this version doesn't know. */
export function rulesToJson(rules: LeaveRules, previous: unknown = {}): Record<string, unknown> {
  const base = previous && typeof previous === "object" ? { ...(previous as Record<string, unknown>) } : {};
  base.per_year_days = rules.perYearDays;
  base.carry_forward_max_days = rules.carryForwardMaxDays;
  base.encashable = rules.encashable;
  base.same_day = rules.sameDay;
  if (rules.proofAfterDays === null) delete base.proof_after_days;
  else base.proof_after_days = rules.proofAfterDays;
  return base;
}

/** Inclusive list of dates. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 366; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Minutes a request uses: every day that isn't a rostered weekly off. */
export function leaveMinutes(
  from: string,
  to: string,
  halfDay: boolean,
  dayMinutes: number,
  weeklyOffs: ReadonlySet<string> = new Set(),
): number {
  const days = datesBetween(from, to).filter((d) => !weeklyOffs.has(d)).length;
  return Math.floor((days * dayMinutes) / (halfDay ? 2 : 1));
}

/** "2 days", "½ day", "1½ days". */
export function formatLeaveDays(minutes: number, dayMinutes: number): string {
  const halves = Math.round((minutes / dayMinutes) * 2);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0 && half) return "½ day";
  const text = `${whole}${half ? "½" : ""}`;
  return whole === 1 && !half ? "1 day" : `${text} days`;
}

export type RequestProblem =
  | "bad_dates"
  | "past_date"
  | "short_notice"
  | "proof_required"
  | "no_working_days";

/** The same checks the database makes, so the form can say so before sending. */
export function checkRequest(input: {
  type: LeaveType;
  from: string;
  to: string;
  halfDay: boolean;
  today: string;
  noticeDays: number;
  hasProof: boolean;
  minutes: number;
}): RequestProblem | null {
  const { type, from, to, halfDay, today, noticeDays, hasProof, minutes } = input;
  if (!from || !to || to < from || datesBetween(from, to).length > 60 || (halfDay && from !== to)) return "bad_dates";
  if (from < today) return "past_date";
  if (!type.rules.sameDay && from < addDays(today, noticeDays)) return "short_notice";
  if (type.needsProof && !halfDay && !hasProof && datesBetween(from, to).length > (type.rules.proofAfterDays ?? 0)) {
    return "proof_required";
  }
  if (minutes === 0) return "no_working_days";
  return null;
}

/** Whether the proof photo field should show for these dates. */
export function needsProof(type: LeaveType, from: string, to: string, halfDay: boolean): boolean {
  return type.needsProof && !halfDay && from <= to && datesBetween(from, to).length > (type.rules.proofAfterDays ?? 0);
}

/** What approval would take: as much as the balance covers is paid, the rest unpaid. */
export function splitPaid(requested: number, balance: number, paidType: boolean): { paid: number; unpaid: number } {
  const paid = paidType ? Math.min(requested, Math.max(balance, 0)) : 0;
  return { paid, unpaid: requested - paid };
}

export type LedgerRow = { staff_id: string; leave_type_id: string; delta_minutes: number };

/** Balance per person per type: staffId → typeId → minutes. */
export function balances(rows: readonly LedgerRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const person = out.get(r.staff_id) ?? new Map<string, number>();
    person.set(r.leave_type_id, (person.get(r.leave_type_id) ?? 0) + r.delta_minutes);
    out.set(r.staff_id, person);
  }
  return out;
}

/** Credit for month k (1–12) of the leave year; twelve of them add up to the year exactly. */
export function monthlyCredit(perYearDays: number, dayMinutes: number, k: number): number {
  const total = Math.round(perYearDays * dayMinutes);
  return Math.floor((total * k) / 12) - Math.floor((total * (k - 1)) / 12);
}

/** First month that earns leave: probation must be over by the month's first day. */
export function firstAccrualMonth(joiningDate: string, probationMonths: number): string {
  const [y, m, d] = joiningDate.split("-").map(Number);
  // Like Postgres date + interval 'n months': the 31st becomes the month's last day.
  const target = m - 1 + probationMonths;
  const lastDay = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  const month = new Date(Date.UTC(y, target + (day === 1 ? 0 : 1), 1));
  return month.toISOString().slice(0, 10);
}

/** What lapses at year end for a balance and a carry-forward cap (in days). */
export function yearEndLapse(balance: number, carryForwardMaxDays: number | null, dayMinutes: number): number {
  if (carryForwardMaxDays === null) return 0;
  return Math.max(0, balance - Math.round(carryForwardMaxDays * dayMinutes));
}

export type DayImpact = { date: string; newGaps: CoverageGap[]; addedShortfall: number };

/**
 * Staffing impact of someone being away: for each day, the coverage gaps
 * that appear only because they're not there. A half day keeps them until
 * `leavingAt`. Days where nothing changes are left out.
 */
export function leaveImpact(input: {
  staffId: string;
  dates: readonly string[];
  shiftsByDate: ReadonlyMap<string, readonly CoverageShift[]>;
  minimums: readonly StaffingMinimum[];
  leavingAt?: string | null;
}): DayImpact[] {
  const out: DayImpact[] = [];
  for (const date of input.dates) {
    const shifts = input.shiftsByDate.get(date) ?? [];
    if (!shifts.some((s) => s.staffId === input.staffId)) continue;
    const weekday = weekdayOf(date);
    const before = coverageGaps(shifts, input.minimums, weekday);
    const without = input.leavingAt
      ? shifts.map((s) => (s.staffId === input.staffId ? { ...s, leaveAt: input.leavingAt } : s))
      : shifts.filter((s) => s.staffId !== input.staffId);
    const after = coverageGaps(without, input.minimums, weekday);
    const added = shortfallMinutes(after) - shortfallMinutes(before);
    if (added <= 0) continue;
    const key = (g: CoverageGap) => `${g.skill}|${g.startMinute}|${g.endMinute}|${g.short}`;
    const existing = new Set(before.map(key));
    out.push({ date, newGaps: after.filter((g) => !existing.has(key(g))), addedShortfall: added });
  }
  return out;
}
