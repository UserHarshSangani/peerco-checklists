// Gullak — the daily attendance-streak reward. Pure; mirrors
// private.team_gullak_run in the M7 migration exactly.
//
//  * Each attended rostered day adds one to the streak and credits that
//    day's level amount (gullak.level_start_days / level_amounts_paise; the
//    top level only when gullak.top_level_enabled).
//  * Weekly offs, approved leave and unrostered days leave the streak alone.
//  * An unapproved absence drops ONE level: the next attended day is the
//    first day of the level below (Day 64 → Day 7). From the first level the
//    streak starts again at Day 1.
//  * Monthly cap (0 = no limit): once reached, days still count, credit is ₹0.
//  * Each credit splits into a payable part (gullak.payable_share_bps, paid
//    with that month's pay) and a locked part.
//  * Locked money unlocks at gullak.unlock_months of service from the joining
//    date (3, 6, 12), then every 12 months after the last one.

import type { Paise } from "@/lib/team/money";

export type GullakRules = {
  starts: number[];
  amounts: Paise[];
  topLevel: boolean;
  capPaise: Paise;
  payableBps: number;
  unlockMonths: number[];
};

export type GullakDay = "attended" | "absent" | "neutral";

export type GullakState = { day: number; month: string | null; monthCredited: Paise };

export type GullakCredit = { day: number; level: number; amount: Paise; payable: Paise; locked: Paise };

/** The level lists in use: the top level dropped when it's switched off. */
export function levels(rules: GullakRules): { starts: number[]; amounts: Paise[] } {
  const n = rules.topLevel || rules.starts.length < 2 ? rules.starts.length : rules.starts.length - 1;
  return { starts: rules.starts.slice(0, n), amounts: rules.amounts.slice(0, n) };
}

/** Level (1-based) and daily amount for a streak day (Day 1 = the first attended day). */
export function levelForDay(day: number, rules: GullakRules): { level: number; amount: Paise } {
  const { starts, amounts } = levels(rules);
  let i = 0;
  for (let k = 0; k < starts.length; k++) if (starts[k] <= Math.max(day, 1)) i = k;
  return { level: i + 1, amount: amounts[i] ?? 0 };
}

/** The next level up from this streak day, if any. */
export function nextLevel(day: number, rules: GullakRules): { day: number; amount: Paise } | null {
  const { starts, amounts } = levels(rules);
  const { level } = levelForDay(day, rules);
  return level < starts.length ? { day: starts[level], amount: amounts[level] } : null;
}

/** Streak count after an unapproved absence: the next attended day starts the level below. */
export function dropOneLevel(day: number, rules: GullakRules): number {
  const { starts } = levels(rules);
  const { level } = levelForDay(day, rules);
  return level >= 2 ? starts[level - 2] - 1 : 0;
}

export function splitCredit(amount: Paise, payableBps: number): { payable: Paise; locked: Paise } {
  const payable = Math.round((amount * payableBps) / 10_000);
  return { payable, locked: amount - payable };
}

/** One day. `date` is YYYY-MM-DD; the month resets the cap tally. */
export function step(
  state: GullakState,
  date: string,
  kind: GullakDay,
  rules: GullakRules,
): { state: GullakState; credit: GullakCredit | null } {
  const month = date.slice(0, 7);
  const credited = state.month === month ? state.monthCredited : 0;
  if (kind === "neutral") return { state: { ...state, month, monthCredited: credited }, credit: null };
  if (kind === "absent") {
    return { state: { day: dropOneLevel(state.day, rules), month, monthCredited: credited }, credit: null };
  }
  const day = state.day + 1;
  const { level, amount: full } = levelForDay(day, rules);
  const amount = rules.capPaise > 0 ? Math.max(0, Math.min(full, rules.capPaise - credited)) : full;
  const { payable, locked } = splitCredit(amount, rules.payableBps);
  return {
    state: { day, month, monthCredited: credited + amount },
    credit: { day, level, amount, payable, locked },
  };
}

/** A run of days from a fresh start (or `from`). */
export function runDays(
  days: readonly { date: string; kind: GullakDay }[],
  rules: GullakRules,
  from: GullakState = { day: 0, month: null, monthCredited: 0 },
): { state: GullakState; credits: (GullakCredit & { date: string })[] } {
  let state = from;
  const credits: (GullakCredit & { date: string })[] = [];
  for (const d of days) {
    const r = step(state, d.date, d.kind, rules);
    state = r.state;
    if (r.credit) credits.push({ ...r.credit, date: d.date });
  }
  return { state, credits };
}

/** date + n months, clamped to the month's last day (as Postgres does). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Unlock dates up to and including `until`: the set months, then every 12 after the last. */
export function unlockMilestones(joining: string, months: readonly number[], until: string): { months: number; date: string }[] {
  const sorted = [...new Set(months)].filter((m) => m > 0).sort((a, b) => a - b);
  const out: { months: number; date: string }[] = [];
  if (sorted.length === 0) return out;
  let m = 0;
  for (let i = 0; ; i++) {
    m = i < sorted.length ? sorted[i] : sorted[sorted.length - 1] + 12 * (i - sorted.length + 1);
    const date = addMonths(joining, m);
    if (date > until) break;
    out.push({ months: m, date });
    if (i > 1200) break;
  }
  return out;
}

/** The first unlock date after `after`. */
export function nextUnlock(joining: string, months: readonly number[], after: string): { months: number; date: string } | null {
  const sorted = [...new Set(months)].filter((m) => m > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  for (let i = 0; i < 1200; i++) {
    const m = i < sorted.length ? sorted[i] : sorted[sorted.length - 1] + 12 * (i - sorted.length + 1);
    const date = addMonths(joining, m);
    if (date > after) return { months: m, date };
  }
  return null;
}

/** Rules from resolved outlet settings. */
export function rulesFromSettings(s: {
  "gullak.level_start_days": number[];
  "gullak.level_amounts_paise": number[];
  "gullak.top_level_enabled": boolean;
  "gullak.monthly_cap_paise": number;
  "gullak.payable_share_bps": number;
  "gullak.unlock_months": number[];
}): GullakRules {
  return {
    starts: s["gullak.level_start_days"],
    amounts: s["gullak.level_amounts_paise"],
    topLevel: s["gullak.top_level_enabled"],
    capPaise: s["gullak.monthly_cap_paise"],
    payableBps: s["gullak.payable_share_bps"],
    unlockMonths: s["gullak.unlock_months"],
  };
}
