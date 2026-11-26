import { sumPaise, type Paise } from "./money";

export type AllowanceLine = { code: string; label: string; paise: Paise; excluded_from_wages?: boolean };

export type SalaryStructure = {
  id: string;
  effective_from: string; // YYYY-MM-DD
  wage_type: "monthly" | "daily";
  basic_paise: Paise;
  da_paise: Paise;
  hra_paise: Paise;
  other_allowances: AllowanceLine[];
  fixed_incentives: AllowanceLine[];
  daily_rate_paise: Paise | null;
};

// Fixed monthly gross before attendance, OT, Gullak or deductions.
export function monthlyGrossPaise(s: Pick<SalaryStructure, "basic_paise" | "da_paise" | "hra_paise" | "other_allowances" | "fixed_incentives">): Paise {
  return sumPaise([
    s.basic_paise,
    s.da_paise,
    s.hra_paise,
    ...s.other_allowances.map((a) => a.paise),
    ...s.fixed_incentives.map((a) => a.paise),
  ]);
}

// The structure in force on `date` (latest effective_from on or before it).
export function structureOn<T extends { effective_from: string }>(structures: T[], date: string): T | null {
  let best: T | null = null;
  for (const s of structures) {
    if (s.effective_from <= date && (!best || s.effective_from > best.effective_from)) best = s;
  }
  return best;
}
