import { describe, expect, it } from "vitest";
import {
  addMonths,
  dropOneLevel,
  levelForDay,
  nextLevel,
  nextUnlock,
  runDays,
  splitCredit,
  unlockMilestones,
  type GullakDay,
  type GullakRules,
} from "@/lib/team/engines/gullak";

const RULES: GullakRules = {
  starts: [1, 7, 30, 90],
  amounts: [2000, 3000, 4000, 5000],
  topLevel: true,
  capPaise: 150000,
  payableBps: 5000,
  unlockMonths: [3, 6, 12],
};

const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const days = (start: string, kinds: GullakDay[]) => kinds.map((kind, i) => ({ date: plus(start, i), kind }));
const attended = (n: number) => Array<GullakDay>(n).fill("attended");

describe("levels", () => {
  it("matches the spec: ₹20 days 1–6, ₹30 7–29, ₹40 30–89, ₹50 from 90", () => {
    expect(levelForDay(1, RULES)).toEqual({ level: 1, amount: 2000 });
    expect(levelForDay(6, RULES).amount).toBe(2000);
    expect(levelForDay(7, RULES)).toEqual({ level: 2, amount: 3000 });
    expect(levelForDay(29, RULES).amount).toBe(3000);
    expect(levelForDay(30, RULES).amount).toBe(4000);
    expect(levelForDay(89, RULES).amount).toBe(4000);
    expect(levelForDay(90, RULES)).toEqual({ level: 4, amount: 5000 });
    expect(levelForDay(400, RULES).amount).toBe(5000);
  });

  it("the top level can be switched off", () => {
    const off = { ...RULES, topLevel: false };
    expect(levelForDay(120, off)).toEqual({ level: 3, amount: 4000 });
    expect(nextLevel(60, off)).toBeNull();
  });

  it("tells you the next level", () => {
    expect(nextLevel(3, RULES)).toEqual({ day: 7, amount: 3000 });
    expect(nextLevel(64, RULES)).toEqual({ day: 90, amount: 5000 });
    expect(nextLevel(95, RULES)).toBeNull();
  });
});

describe("unapproved absence drops one level", () => {
  it("Day 64 → the next attended day is Day 7", () => {
    expect(dropOneLevel(64, RULES)).toBe(6);
    const { credits } = runDays(days("2027-01-01", ["attended"]), RULES, { day: 6, month: null, monthCredited: 0 });
    expect(credits[0]).toMatchObject({ day: 7, amount: 3000 });
  });

  it("from the first level, starts again at Day 1", () => {
    expect(dropOneLevel(4, RULES)).toBe(0);
    expect(dropOneLevel(0, RULES)).toBe(0);
  });

  it("from the top level, back to the start of ₹40", () => {
    expect(dropOneLevel(150, RULES)).toBe(29);
  });
});

describe("streak", () => {
  it("weekly offs and leave don't break it", () => {
    const { state, credits } = runDays(
      days("2027-01-01", ["attended", "attended", "neutral", "attended", "neutral", "neutral", "attended"]),
      RULES,
    );
    expect(state.day).toBe(4);
    expect(credits.map((c) => c.day)).toEqual([1, 2, 3, 4]);
  });

  it("an absence on Day 8 (₹30) drops to ₹20, so the next day is Day 1", () => {
    const { state, credits } = runDays(days("2027-01-01", [...attended(8), "absent", "attended"]), RULES);
    expect(state.day).toBe(1);
    expect(credits.at(-1)).toMatchObject({ day: 1, amount: 2000 });
  });

  it("splits each credit 50/50 into payable and locked", () => {
    const { credits } = runDays(days("2027-01-01", attended(1)), RULES);
    expect(credits[0]).toMatchObject({ amount: 2000, payable: 1000, locked: 1000 });
    expect(splitCredit(3000, 3333)).toEqual({ payable: 1000, locked: 2000 });
  });
});

describe("monthly cap", () => {
  it("keeps counting days but credits ₹0 once the cap is reached", () => {
    const rules = { ...RULES, capPaise: 10000 };
    const { state, credits } = runDays(days("2027-01-01", attended(7)), rules);
    expect(credits.map((c) => c.amount)).toEqual([2000, 2000, 2000, 2000, 2000, 0, 0]);
    expect(state.day).toBe(7);
  });

  it("caps part of a day and resets next month", () => {
    const rules = { ...RULES, capPaise: 5000 };
    const { credits } = runDays(days("2027-01-30", attended(4)), rules);
    expect(credits.map((c) => [c.date, c.amount])).toEqual([
      ["2027-01-30", 2000],
      ["2027-01-31", 2000],
      ["2027-02-01", 2000],
      ["2027-02-02", 2000],
    ]);
    const tight = runDays(days("2027-01-01", attended(3)), { ...RULES, capPaise: 5000 });
    expect(tight.credits.map((c) => c.amount)).toEqual([2000, 2000, 1000]);
  });

  it("a cap of 0 means no limit", () => {
    const { credits } = runDays(days("2027-01-01", attended(100)), { ...RULES, capPaise: 0 });
    expect(credits.reduce((s, c) => s + c.amount, 0)).toBe(6 * 2000 + 23 * 3000 + 60 * 4000 + 11 * 5000);
  });
});

describe("unlocks", () => {
  it("adds months like Postgres (end of month clamps)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-06-15", 3)).toBe("2026-09-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("at 3, 6, 12 months, then every 12 months", () => {
    expect(unlockMilestones("2026-06-01", [3, 6, 12], "2028-06-01")).toEqual([
      { months: 3, date: "2026-09-01" },
      { months: 6, date: "2026-12-01" },
      { months: 12, date: "2027-06-01" },
      { months: 24, date: "2028-06-01" },
    ]);
  });

  it("the next unlock is the first date after the last counted day", () => {
    expect(nextUnlock("2026-06-01", [3, 6, 12], "2026-11-27")).toEqual({ months: 6, date: "2026-12-01" });
    expect(nextUnlock("2026-06-01", [3, 6, 12], "2026-12-01")).toEqual({ months: 12, date: "2027-06-01" });
    expect(nextUnlock("2020-01-15", [3, 6, 12], "2026-11-27")).toEqual({ months: 84, date: "2027-01-15" });
  });
});
