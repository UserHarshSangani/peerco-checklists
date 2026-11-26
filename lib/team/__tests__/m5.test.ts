import { describe, expect, it } from "vitest";
import {
  balances,
  checkRequest,
  firstAccrualMonth,
  formatLeaveDays,
  leaveImpact,
  leaveMinutes,
  monthlyCredit,
  needsProof,
  parseRules,
  rulesToJson,
  splitPaid,
  yearEndLapse,
  type LeaveType,
} from "../engines/leave";

const DAY = 480;

const sick: LeaveType = {
  id: "sl",
  code: "sl",
  name: "Sick leave",
  paid: true,
  needsProof: true,
  active: true,
  rules: parseRules({ per_year_days: 7, carry_forward_max_days: 0, same_day: true, proof_after_days: 2 }),
};
const casual: LeaveType = { ...sick, id: "cl", code: "cl", needsProof: false, rules: parseRules({ per_year_days: 8, carry_forward_max_days: 0 }) };

describe("leave rules", () => {
  it("reads the stored rules and writes them back without losing unknown keys", () => {
    const raw = { per_year_days: 15, carry_forward_max_days: 30, encashable: true, extra: "keep" };
    const rules = parseRules(raw);
    expect(rules).toEqual({ perYearDays: 15, carryForwardMaxDays: 30, encashable: true, sameDay: false, proofAfterDays: null });
    expect(rulesToJson({ ...rules, perYearDays: 12 }, raw)).toEqual({
      per_year_days: 12, carry_forward_max_days: 30, encashable: true, same_day: false, extra: "keep",
    });
    expect(parseRules(null).perYearDays).toBe(0);
    expect(parseRules({ carry_forward_max_days: null }).carryForwardMaxDays).toBeNull();
  });
});

describe("how much a request uses", () => {
  it("counts days, skips rostered weekly offs, halves a half day", () => {
    expect(leaveMinutes("2026-12-01", "2026-12-03", false, DAY)).toBe(3 * DAY);
    expect(leaveMinutes("2026-12-01", "2026-12-03", false, DAY, new Set(["2026-12-02"]))).toBe(2 * DAY);
    expect(leaveMinutes("2026-12-01", "2026-12-01", true, DAY)).toBe(240);
  });

  it("formats as days", () => {
    expect(formatLeaveDays(480, DAY)).toBe("1 day");
    expect(formatLeaveDays(240, DAY)).toBe("½ day");
    expect(formatLeaveDays(720, DAY)).toBe("1½ days");
    expect(formatLeaveDays(320, DAY)).toBe("½ day"); // ⅔ day rounds to the nearest half
    expect(formatLeaveDays(0, DAY)).toBe("0 days");
  });
});

describe("request checks (same as the database)", () => {
  const base = { today: "2026-11-27", noticeDays: 2, hasProof: false, minutes: DAY, halfDay: false };

  it("needs two days' notice, except sick leave", () => {
    expect(checkRequest({ ...base, type: casual, from: "2026-11-28", to: "2026-11-28" })).toBe("short_notice");
    expect(checkRequest({ ...base, type: casual, from: "2026-11-29", to: "2026-11-29" })).toBeNull();
    expect(checkRequest({ ...base, type: sick, from: "2026-11-27", to: "2026-11-27" })).toBeNull();
  });

  it("refuses past dates and back-to-front ranges", () => {
    expect(checkRequest({ ...base, type: sick, from: "2026-11-26", to: "2026-11-26" })).toBe("past_date");
    expect(checkRequest({ ...base, type: sick, from: "2026-11-30", to: "2026-11-29" })).toBe("bad_dates");
    expect(checkRequest({ ...base, type: sick, from: "2026-11-29", to: "2026-11-30", halfDay: true })).toBe("bad_dates");
  });

  it("asks for proof only for sick leave longer than two days", () => {
    expect(checkRequest({ ...base, type: sick, from: "2026-11-27", to: "2026-11-28" })).toBeNull();
    expect(checkRequest({ ...base, type: sick, from: "2026-11-27", to: "2026-11-29" })).toBe("proof_required");
    expect(checkRequest({ ...base, type: sick, from: "2026-11-27", to: "2026-11-29", hasProof: true })).toBeNull();
    expect(needsProof(sick, "2026-11-27", "2026-11-29", false)).toBe(true);
    expect(needsProof(casual, "2026-11-27", "2026-12-09", false)).toBe(false);
  });

  it("refuses a range that is all weekly offs", () => {
    expect(checkRequest({ ...base, type: sick, from: "2026-11-27", to: "2026-11-27", minutes: 0 })).toBe("no_working_days");
  });
});

describe("balances and approval", () => {
  it("sums the ledger per person and type", () => {
    const b = balances([
      { staff_id: "r", leave_type_id: "cl", delta_minutes: 320 },
      { staff_id: "r", leave_type_id: "cl", delta_minutes: 320 },
      { staff_id: "r", leave_type_id: "cl", delta_minutes: -480 },
      { staff_id: "r", leave_type_id: "el", delta_minutes: 600 },
    ]);
    expect(b.get("r")?.get("cl")).toBe(160);
    expect(b.get("r")?.get("el")).toBe(600);
  });

  it("pays what the balance covers and the rest is unpaid", () => {
    expect(splitPaid(960, 600, true)).toEqual({ paid: 600, unpaid: 360 });
    expect(splitPaid(480, 2000, true)).toEqual({ paid: 480, unpaid: 0 });
    expect(splitPaid(480, -50, true)).toEqual({ paid: 0, unpaid: 480 });
    expect(splitPaid(480, 2000, false)).toEqual({ paid: 0, unpaid: 480 });
  });
});

describe("monthly accrual and year end", () => {
  it("twelve monthly credits add up to the yearly days exactly", () => {
    for (const days of [8, 7, 15]) {
      const credits = Array.from({ length: 12 }, (_, i) => monthlyCredit(days, DAY, i + 1));
      expect(credits.reduce((a, b) => a + b, 0)).toBe(days * DAY);
      expect(Math.max(...credits) - Math.min(...credits)).toBeLessThanOrEqual(1);
    }
    expect(monthlyCredit(8, DAY, 1)).toBe(320);
    expect(monthlyCredit(7, DAY, 1)).toBe(280);
    expect(monthlyCredit(15, DAY, 1)).toBe(600);
  });

  it("starts after probation", () => {
    expect(firstAccrualMonth("2026-06-01", 3)).toBe("2026-09-01");
    expect(firstAccrualMonth("2026-06-15", 3)).toBe("2026-10-01");
    expect(firstAccrualMonth("2026-11-30", 3)).toBe("2027-03-01");
    expect(firstAccrualMonth("2026-01-31", 1)).toBe("2026-03-01"); // 28 Feb, like Postgres
    expect(firstAccrualMonth("2026-06-15", 0)).toBe("2026-07-01");
  });

  it("EL carries up to 30 days, CL and SL lapse, comp-off carries in full", () => {
    expect(yearEndLapse(40 * DAY, 30, DAY)).toBe(10 * DAY);
    expect(yearEndLapse(12 * DAY, 30, DAY)).toBe(0);
    expect(yearEndLapse(5 * DAY, 0, DAY)).toBe(5 * DAY);
    expect(yearEndLapse(5 * DAY, null, DAY)).toBe(0);
  });
});

describe("staffing impact of leave", () => {
  // Floor needs 1 person 12:00–23:00. Rishabh 12–21, Rajeev 14–23.
  const minimums = [{ skill: "floor", weekday: null, slotStart: "12:00", slotEnd: "23:00", minCount: 1 }];
  const shifts = [
    { staffId: "rishabh", skill: "floor", segments: [{ start: "12:00", end: "21:00" }] },
    { staffId: "rajeev", skill: "floor", segments: [{ start: "14:00", end: "23:00" }] },
  ];
  const shiftsByDate = new Map([["2026-12-01", shifts]]);

  it("shows the gap Rajeev's day off would leave", () => {
    const impact = leaveImpact({ staffId: "rajeev", dates: ["2026-12-01", "2026-12-02"], shiftsByDate, minimums });
    expect(impact).toHaveLength(1);
    expect(impact[0].date).toBe("2026-12-01");
    expect(impact[0].newGaps.map((g) => [g.start, g.end, g.short])).toEqual([["21:00", "23:00", 1]]);
    expect(impact[0].addedShortfall).toBe(120);
  });

  it("a half day leaving at 19:00 leaves the same gap", () => {
    const impact = leaveImpact({ staffId: "rajeev", dates: ["2026-12-01"], shiftsByDate, minimums, leavingAt: "19:00" });
    expect(impact[0].newGaps.map((g) => [g.start, g.end])).toEqual([["21:00", "23:00"]]);
  });

  it("is empty when they aren't rostered or nobody is short", () => {
    expect(leaveImpact({ staffId: "bina", dates: ["2026-12-01"], shiftsByDate, minimums })).toEqual([]);
    expect(leaveImpact({ staffId: "rajeev", dates: ["2026-12-01"], shiftsByDate, minimums, leavingAt: "23:00" })).toEqual([]);
  });
});
