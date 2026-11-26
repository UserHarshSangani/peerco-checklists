import { describe, expect, it } from "vitest";
import { addSlot, coverEligibility, overtimeAmount, slotMinutes, waves, weekWithSlot, type Candidate } from "../engines/eligibility";
import type { HoursRules, RosterDay } from "../engines/roster-rules";

const rules: HoursRules = { maxDailyMinutes: 600, maxWeeklyMinutes: 2880, minRestMinutes: 660, womenLateCutoff: "19:00" };

// Week of Mon 30 Nov – Sun 6 Dec 2026. The slot: floor, Tue 1 Dec 21:00–23:00.
const slot = { date: "2026-12-01", skill: "floor", start: "21:00", end: "23:00" };
const work = (date: string, start: string, end: string): RosterDay => ({ date, kind: "work", segments: [{ start, end }] });
const off = (date: string): RosterDay => ({ date, kind: "weekly_off", segments: [] });
const fiveDays = (start: string, end: string) =>
  ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"].map((d) => work(d, start, end));

const person = (over: Partial<Candidate> & { staffId: string; name: string }): Candidate => ({
  gender: "male",
  lateShiftConsent: false,
  skills: ["floor"],
  week: [],
  onLeave: false,
  unavailable: false,
  otMinutesThisMonth: 0,
  ...over,
});

describe("fitting the slot into a day", () => {
  it("extends a shift that ends when the slot starts", () => {
    expect(addSlot([{ start: "12:00", end: "21:00" }], null, "21:00", "23:00")).toEqual([{ start: "12:00", end: "23:00" }]);
  });

  it("adds a segment in a gap, and fills a split-shift gap exactly", () => {
    expect(addSlot([{ start: "09:00", end: "13:00" }], null, "18:00", "20:00")).toEqual([
      { start: "09:00", end: "13:00" }, { start: "18:00", end: "20:00" },
    ]);
    expect(addSlot([{ start: "11:00", end: "15:00" }, { start: "18:00", end: "23:00" }], null, "15:00", "18:00")).toEqual([
      { start: "11:00", end: "23:00" },
    ]);
  });

  it("refuses overlaps and more than three segments", () => {
    expect(addSlot([{ start: "12:00", end: "21:00" }], null, "20:00", "22:00")).toBeNull();
    expect(addSlot([{ start: "12:00", end: "21:00" }], "22:00", "21:30", "23:00")).toBeNull(); // extension counts
    expect(addSlot([{ start: "06:00", end: "07:00" }, { start: "09:00", end: "10:00" }, { start: "12:00", end: "13:00" }], null, "15:00", "16:00")).toBeNull();
  });

  it("reads a slot after midnight as the tail of a late shift", () => {
    expect(addSlot([{ start: "18:00", end: "01:00" }], null, "01:00", "02:00")).toEqual([{ start: "18:00", end: "02:00" }]);
  });

  it("a weekly off or empty day becomes a working day", () => {
    const week = weekWithSlot([off("2026-12-01")], slot);
    expect(week).toEqual([{ date: "2026-12-01", kind: "work", segments: [{ start: "21:00", end: "23:00" }] }]);
  });
});

describe("who is eligible", () => {
  it("leaves out the wrong skill, leave, unavailable and busy people", () => {
    const result = coverEligibility(slot, [
      person({ staffId: "c", name: "Chef", skills: ["chef"] }),
      person({ staffId: "l", name: "Leela", onLeave: true }),
      person({ staffId: "u", name: "Umesh", unavailable: true }),
      person({ staffId: "b", name: "Bala", week: [work("2026-12-01", "20:00", "23:00")] }),
      person({ staffId: "r", name: "Rishabh", week: [work("2026-12-01", "14:00", "21:00")] }),
    ], rules);
    expect(result.eligible.map((e) => e.staffId)).toEqual(["r"]);
    expect(Object.fromEntries(result.excluded.map((e) => [e.staffId, e.reason]))).toEqual({
      c: "no_skill", l: "on_leave", u: "unavailable", b: "busy",
    });
  });

  it("leaves out anyone the slot would push over the daily limit", () => {
    // Rishabh 12–21 is 9h; +2h = 11h > 10h.
    const result = coverEligibility(slot, [person({ staffId: "r", name: "Rishabh", week: [work("2026-12-01", "12:00", "21:00")] })], rules);
    expect(result.excluded).toEqual([{ staffId: "r", name: "Rishabh", reason: "daily_over" }]);
  });

  it("checks the weekly limit and the rest before the next morning", () => {
    const weekly = person({ staffId: "w", name: "Wasim", week: fiveDays("10:00", "17:45").concat(work("2026-12-05", "10:00", "17:45")) });
    const early = person({ staffId: "e", name: "Esha", gender: "male", week: [work("2026-12-02", "07:00", "15:00")] });
    const result = coverEligibility(slot, [weekly, early], rules);
    expect(Object.fromEntries(result.excluded.map((e) => [e.staffId, e.reason]))).toEqual({ w: "weekly_over", e: "short_rest" });
  });

  it("women without late-shift consent aren't asked after 19:00; with consent they are", () => {
    const result = coverEligibility(slot, [
      person({ staffId: "a", name: "Anita", gender: "female" }),
      person({ staffId: "b", name: "Bina", gender: "female", lateShiftConsent: true }),
    ], rules);
    expect(result.eligible.map((e) => e.staffId)).toEqual(["b"]);
    expect(result.excluded).toEqual([{ staffId: "a", name: "Anita", reason: "late_without_consent" }]);
  });

  it("a warning the week already had doesn't block them", () => {
    // Already 6 days 10–18 + slot on the 7th day → no_weekly_off is new; but a
    // week that already has no weekly off isn't made worse by an evening slot.
    const seven = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]
      .map((d) => work(d, "12:00", "16:00"));
    const result = coverEligibility(slot, [person({ staffId: "s", name: "Sam", week: seven })], rules);
    expect(result.eligible.map((e) => e.staffId)).toEqual(["s"]);
  });

  it("asks people with the fewest overtime minutes first, ties by name", () => {
    const result = coverEligibility(slot, [
      person({ staffId: "1", name: "Zoya", otMinutesThisMonth: 0 }),
      person({ staffId: "2", name: "Amit", otMinutesThisMonth: 240 }),
      person({ staffId: "3", name: "Bala", otMinutesThisMonth: 0 }),
    ], rules);
    expect(result.eligible.map((e) => e.name)).toEqual(["Bala", "Zoya", "Amit"]);
  });
});

describe("waves and pay", () => {
  it("splits the order into waves of the batch size", () => {
    expect(waves(["a", "b", "c", "d", "e", "f", "g"], 3)).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
    expect(waves([], 3)).toEqual([]);
  });

  it("works out overtime at 2× the hourly rate", () => {
    // ₹13,000 basic + DA, 26 days, 8-hour shift → ₹62.50/h; 2h at 2× = ₹250.
    expect(overtimeAmount({ wageType: "monthly", wagesPaise: 1_300_000, workingDays: 26, standardShiftMinutes: 480, minutes: 120, multiplierBps: 20000 })).toBe(25_000);
    // Daily ₹600 for 8h → ₹75/h; 90 min at 2× = ₹225.
    expect(overtimeAmount({ wageType: "daily", wagesPaise: 60_000, workingDays: 26, standardShiftMinutes: 480, minutes: 90, multiplierBps: 20000 })).toBe(22_500);
    expect(slotMinutes("21:00", "23:00")).toBe(120);
  });
});
