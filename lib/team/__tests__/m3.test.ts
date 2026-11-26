import { describe, expect, it } from "vitest";
import { coverageGaps, minimumsForWeekday, presence, shortfallMinutes, type CoverageShift, type StaffingMinimum } from "../engines/coverage";
import { checkRosterWeek, workedMinutes, type HoursRules } from "../engines/roster-rules";
import { segmentsToIntervals, validSegments, weekDates, weekStartOf, weekdayOf } from "../engines/time";
import { suggestWeeklyOffs } from "../engines/weekly-off";

const floor1: StaffingMinimum = { skill: "floor", weekday: null, slotStart: "12:00", slotEnd: "23:00", minCount: 1 };
const rishabh: CoverageShift = { staffId: "rishabh", skill: "floor", segments: [{ start: "12:00", end: "21:00" }] };
const rajeev: CoverageShift = { staffId: "rajeev", skill: "floor", segments: [{ start: "14:00", end: "23:00" }] };

describe("shift times", () => {
  it("reads past-midnight and split shifts", () => {
    expect(segmentsToIntervals([{ start: "18:00", end: "01:00" }])).toEqual([[1080, 1500]]);
    expect(segmentsToIntervals([{ start: "11:00", end: "15:00" }, { start: "18:00", end: "23:00" }])).toEqual([
      [660, 900],
      [1080, 1380],
    ]);
  });

  it("rejects broken segments", () => {
    expect(validSegments([{ start: "11:00", end: "15:00" }])).toBe(true);
    expect(validSegments([])).toBe(false);
    expect(validSegments([{ start: "11:00", end: "11:00" }])).toBe(false);
    expect(validSegments([{ start: "25:00", end: "11:00" }])).toBe(false);
    expect(validSegments([{ start: "06:00", end: "23:00" }, { start: "23:30", end: "07:00" }])).toBe(false);
  });

  it("finds the week", () => {
    expect(weekdayOf("2026-11-26")).toBe(4); // Thursday
    expect(weekStartOf("2026-11-26", "monday")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29", "monday")).toBe("2026-11-23"); // Sunday belongs to the Monday week
    expect(weekStartOf("2026-11-26", "sunday")).toBe("2026-11-22");
    expect(weekDates("2026-11-23")).toHaveLength(7);
  });
});

describe("coverage engine", () => {
  it("Rishabh 12–21 + Rajeev 14–23 covers the floor 12–23", () => {
    expect(coverageGaps([rishabh, rajeev], [floor1], 4)).toEqual([]);
  });

  it("Rajeev leaving at 19:00 opens a 21:00–23:00 floor gap", () => {
    const gaps = coverageGaps([rishabh, { ...rajeev, leaveAt: "19:00" }], [floor1], 4);
    expect(gaps).toEqual([
      { skill: "floor", start: "21:00", end: "23:00", startMinute: 1260, endMinute: 1380, needed: 1, have: 0, short: 1 },
    ]);
    expect(shortfallMinutes(gaps)).toBe(120);
  });

  it("a cover extension closes the gap", () => {
    const gaps = coverageGaps(
      [{ ...rishabh, extendedUntil: "23:00" }, { ...rajeev, leaveAt: "19:00" }],
      [floor1],
      4,
    );
    expect(gaps).toEqual([]);
  });

  it("only counts people rostered as that skill", () => {
    const gaps = coverageGaps([{ ...rishabh, skill: "cashier" }, rajeev], [floor1], 4);
    expect(gaps.map((g) => [g.start, g.end])).toEqual([["12:00", "14:00"]]);
  });

  it("weekday rows replace the every-day row for that skill", () => {
    const saturday: StaffingMinimum = { ...floor1, weekday: 6, slotStart: "18:00", slotEnd: "23:00", minCount: 2 };
    expect(minimumsForWeekday([floor1, saturday], 6)).toEqual([saturday]);
    expect(minimumsForWeekday([floor1, saturday], 4)).toEqual([floor1]);
    const gaps = coverageGaps([rishabh, rajeev], [floor1, saturday], 6);
    expect(gaps.map((g) => [g.start, g.end, g.have, g.needed])).toEqual([["21:00", "23:00", 1, 2]]);
  });

  it("overlapping rules take the larger number and split gaps where counts change", () => {
    const peak: StaffingMinimum = { ...floor1, slotStart: "19:00", slotEnd: "22:00", minCount: 2 };
    const gaps = coverageGaps([rishabh], [floor1, peak], 4);
    expect(gaps.map((g) => [g.start, g.end, g.short])).toEqual([
      ["19:00", "21:00", 1],
      ["21:00", "22:00", 2],
      ["22:00", "23:00", 1],
    ]);
  });

  it("handles a late-night slot past midnight", () => {
    const late: StaffingMinimum = { skill: "floor", weekday: null, slotStart: "22:00", slotEnd: "01:00", minCount: 1 };
    const night: CoverageShift = { staffId: "n", skill: "floor", segments: [{ start: "18:00", end: "00:00" }] };
    expect(coverageGaps([night], [late], 5).map((g) => [g.start, g.end])).toEqual([["00:00", "01:00"]]);
  });

  it("late arrival and split shifts", () => {
    expect(presence({ ...rishabh, arriveAt: "13:30" })).toEqual([[810, 1260]]);
    const split: CoverageShift = {
      staffId: "s",
      skill: "floor",
      segments: [{ start: "12:00", end: "15:00" }, { start: "18:00", end: "23:00" }],
    };
    expect(coverageGaps([split], [floor1], 4).map((g) => [g.start, g.end])).toEqual([["15:00", "18:00"]]);
  });
});

describe("working-hours checks", () => {
  const rules: HoursRules = { maxDailyMinutes: 600, maxWeeklyMinutes: 2880, minRestMinutes: 660, womenLateCutoff: "19:00" };
  const day = (date: string, start: string, end: string, unpaidBreakMinutes = 0) => ({
    date,
    kind: "work" as const,
    segments: [{ start, end }],
    unpaidBreakMinutes,
  });

  it("subtracts the unpaid break", () => {
    expect(workedMinutes(day("2026-11-23", "12:00", "21:00", 30))).toBe(510);
  });

  it("flags long days, long weeks, short rest and no day off", () => {
    const week = weekDates("2026-11-23").map((d) => day(d, "10:00", "21:00"));
    week[2] = day(week[2].date, "07:00", "17:00"); // only 10h after a 21:00 finish
    const kinds = checkRosterWeek(week, { gender: "male", lateShiftConsent: false }, rules).map((w) => w.kind);
    expect(kinds).toContain("daily_over");
    expect(kinds).toContain("weekly_over");
    expect(kinds).toContain("short_rest");
    expect(kinds).toContain("no_weekly_off");
  });

  it("is quiet for a normal week", () => {
    const week = weekDates("2026-11-23").slice(0, 6).map((d) => day(d, "12:00", "21:00", 60));
    expect(checkRosterWeek(week, { gender: "male", lateShiftConsent: false }, rules)).toEqual([]);
  });

  it("flags women working late without consent on file", () => {
    const week = [day("2026-11-23", "12:00", "21:00")];
    expect(checkRosterWeek(week, { gender: "female", lateShiftConsent: false }, rules)).toEqual([
      { kind: "late_without_consent", date: "2026-11-23" },
    ]);
    expect(checkRosterWeek(week, { gender: "female", lateShiftConsent: true }, rules)).toEqual([]);
  });
});

describe("weekly-off helper", () => {
  const dates = weekDates("2026-11-23");
  const everyDay = (shift: CoverageShift) => Object.fromEntries(dates.map((d) => [d, [shift]]));

  it("spreads offs so no day is left short when it can be avoided", () => {
    // Three people, floor needs 2 from 12–21. Any one can be off on any day
    // without a gap, so offs should land on three different days.
    const a = { staffId: "a", skill: "floor", segments: [{ start: "12:00", end: "21:00" }] };
    const shifts = Object.fromEntries(dates.map((d) => [d, [a, { ...a, staffId: "b" }, { ...a, staffId: "c" }]]));
    const minimums = [{ ...floor1, slotEnd: "21:00", minCount: 2 }];
    const out = suggestWeeklyOffs({ dates, shifts, alreadyOff: new Set(), lastOffWeekday: {}, minimums });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((o) => o.date)).size).toBe(3);
    expect(out.every((o) => o.addsShortfallMinutes === 0)).toBe(true);
  });

  it("keeps last week's day off when it costs nothing", () => {
    const out = suggestWeeklyOffs({
      dates,
      shifts: everyDay(rishabh),
      alreadyOff: new Set(),
      lastOffWeekday: { rishabh: 3 }, // Wednesday
      minimums: [],
    });
    expect(out).toEqual([{ staffId: "rishabh", date: "2026-11-25", addsShortfallMinutes: 0 }]);
  });

  it("skips people who already have a day off", () => {
    const out = suggestWeeklyOffs({ dates, shifts: everyDay(rishabh), alreadyOff: new Set(["rishabh"]), lastOffWeekday: {}, minimums: [] });
    expect(out).toEqual([]);
  });
});
