// Every Daybook Team business rule, with its default. Code reads rules only
// through getTeamSettings()/resolveSettings() — never a literal number.
// An outlet overrides a default by saving a row in public.outlet_settings.
//
// verify: true marks values that need legal or CA confirmation; the
// settings screen shows a yellow "Verify with CA" badge on them.

export type SettingGroup =
  | "access"
  | "attendance"
  | "hours"
  | "cover"
  | "gullak"
  | "leave"
  | "advances"
  | "payroll"
  | "exits";

export const SETTING_GROUPS: SettingGroup[] = [
  "access",
  "attendance",
  "hours",
  "cover",
  "gullak",
  "leave",
  "advances",
  "payroll",
  "exits",
];

type Base = { group: SettingGroup; verify?: boolean };

export type SettingDef =
  | (Base & { type: "boolean"; default: boolean })
  | (Base & { type: "int"; unit: "minutes" | "days" | "months" | "count" | "hours"; default: number; min: number; max: number })
  | (Base & { type: "bps"; default: number; min: number; max: number }) // 1200 = 12%
  | (Base & { type: "paise"; default: number; min: number; max: number })
  | (Base & { type: "time"; default: string }) // "HH:MM", IST
  | (Base & { type: "enum"; default: string; options: readonly string[] })
  | (Base & { type: "int_list"; unit: "days" | "months"; default: number[]; min: number; max: number })
  | (Base & { type: "paise_list"; default: number[]; min: number; max: number })
  | (Base & { type: "string_list"; default: string[] });

export const SETTINGS = {
  // ---- Access ----
  "team.managers_see_pay": { group: "access", type: "boolean", default: false },
  "team.skills": {
    group: "access",
    type: "string_list",
    default: ["captain", "steward", "chef", "commis", "tandoor", "packing", "cashier", "helper"],
  },
  "auth.pin_max_attempts": { group: "access", type: "int", unit: "count", default: 5, min: 3, max: 10 },
  "auth.pin_lock_minutes": { group: "access", type: "int", unit: "minutes", default: 15, min: 1, max: 1440 },

  // ---- Attendance ----
  "attendance.grace_minutes": { group: "attendance", type: "int", unit: "minutes", default: 10, min: 0, max: 120 },
  "attendance.no_show_alert_minutes": {
    group: "attendance", type: "int", unit: "minutes", default: 30, min: 5, max: 240,
  },
  "attendance.photo_retention_days": {
    group: "attendance", type: "int", unit: "days", default: 90, min: 7, max: 730,
  },
  "attendance.photo_required": { group: "attendance", type: "boolean", default: true },
  "attendance.late_alerts": { group: "attendance", type: "boolean", default: true },
  "attendance.auto_close_after_minutes": {
    group: "attendance", type: "int", unit: "minutes", default: 120, min: 30, max: 720,
  },
  "attendance.rounding_minutes": { group: "attendance", type: "int", unit: "minutes", default: 15, min: 1, max: 60 },
  "attendance.rounding_mode": {
    group: "attendance", type: "enum", default: "nearest", options: ["down", "nearest", "up"],
  },

  // ---- Working hours and limits ----
  "hours.standard_shift_minutes": {
    group: "hours", type: "int", unit: "minutes", default: 480, min: 240, max: 720, verify: true,
  },
  "hours.max_daily_minutes": {
    group: "hours", type: "int", unit: "minutes", default: 600, min: 240, max: 720, verify: true,
  },
  "hours.max_weekly_minutes": {
    group: "hours", type: "int", unit: "minutes", default: 2880, min: 1200, max: 4320, verify: true,
  },
  "hours.min_rest_minutes": {
    group: "hours", type: "int", unit: "minutes", default: 660, min: 480, max: 960, verify: true,
  },
  "hours.women_late_cutoff": { group: "hours", type: "time", default: "19:00", verify: true },
  "hours.week_start": { group: "hours", type: "enum", default: "monday", options: ["monday", "sunday"] },
  "hours.working_days_basis": {
    group: "hours", type: "enum", default: "fixed_26", options: ["fixed_26", "calendar_days", "rostered_days"],
    verify: true,
  },

  // ---- Cover and overtime ----
  "cover.offer_batch_size": { group: "cover", type: "int", unit: "count", default: 3, min: 1, max: 20 },
  "cover.offer_expiry_minutes": { group: "cover", type: "int", unit: "minutes", default: 30, min: 5, max: 240 },
  "cover.award_mode": { group: "cover", type: "enum", default: "first_accept", options: ["first_accept", "manager_pick"] },
  "cover.ot_multiplier_bps": { group: "cover", type: "bps", default: 20000, min: 10000, max: 30000, verify: true },
  "cover.comp_off_instead_of_pay": { group: "cover", type: "boolean", default: false, verify: true },
  "cover.staff_may_choose_comp_off": { group: "cover", type: "boolean", default: true, verify: true },
  "cover.ot_rate_basis": { group: "cover", type: "enum", default: "basic_da", options: ["basic_da", "gross"], verify: true },
  "cover.points_per_cover": { group: "cover", type: "int", unit: "count", default: 20, min: 0, max: 1000 },

  // ---- Gullak ----
  "gullak.enabled": { group: "gullak", type: "boolean", default: true },
  "gullak.level_start_days": { group: "gullak", type: "int_list", unit: "days", default: [1, 7, 30, 90], min: 1, max: 365 },
  "gullak.level_amounts_paise": { group: "gullak", type: "paise_list", default: [2000, 3000, 4000, 5000], min: 0, max: 100000 },
  "gullak.top_level_enabled": { group: "gullak", type: "boolean", default: true },
  "gullak.monthly_cap_paise": { group: "gullak", type: "paise", default: 150000, min: 0, max: 1000000 },
  "gullak.payable_share_bps": { group: "gullak", type: "bps", default: 5000, min: 0, max: 10000 },
  "gullak.unlock_months": { group: "gullak", type: "int_list", unit: "months", default: [3, 6, 12], min: 1, max: 60 },
  "gullak.absence_wait_days": { group: "gullak", type: "int", unit: "days", default: 1, min: 0, max: 7 },
  "gullak.forfeit_locked_on_absconding": { group: "gullak", type: "boolean", default: false, verify: true },

  // ---- Leave ----
  "leave.encashment_on_exit": { group: "leave", type: "boolean", default: false, verify: true },
  "leave.probation_months": { group: "leave", type: "int", unit: "months", default: 3, min: 0, max: 12, verify: true },
  "leave.notice_days": { group: "leave", type: "int", unit: "days", default: 2, min: 0, max: 30 },
  "leave.year_start": { group: "leave", type: "enum", default: "april", options: ["april", "january"] },

  // ---- Advances ----
  "advances.cap_bps_of_earned": { group: "advances", type: "bps", default: 5000, min: 0, max: 10000 },
  "advances.max_recovery_months": { group: "advances", type: "int", unit: "months", default: 3, min: 1, max: 12 },

  // ---- Payroll ----
  "payroll.pt_state": { group: "payroll", type: "enum", default: "MH", options: ["MH", "CG", "none"], verify: true },
  "payroll.deductions_cap_bps": { group: "payroll", type: "bps", default: 5000, min: 0, max: 10000, verify: true },
  "payroll.wages_rule_enabled": { group: "payroll", type: "boolean", default: true, verify: true },

  // ---- Exits ----
  "exits.notice_period_days": { group: "exits", type: "int", unit: "days", default: 30, min: 0, max: 90 },
  "exits.absconding_days": { group: "exits", type: "int", unit: "days", default: 3, min: 1, max: 30 },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;

type ValueOf<D> = D extends { type: "boolean" }
  ? boolean
  : D extends { type: "time" | "enum" }
    ? string
    : D extends { type: "int_list" | "paise_list" }
      ? number[]
      : D extends { type: "string_list" }
        ? string[]
        : number;

export type TeamSettings = { -readonly [K in SettingKey]: ValueOf<(typeof SETTINGS)[K]> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, key);
}

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SKILL_PATTERN = /^[a-z][a-z0-9_]*$/;

// Returns the value if it's valid for this setting, otherwise null. Used
// both when saving (reject bad input) and when reading (ignore a stale or
// corrupt row and fall back to the default).
export function validateSetting(key: SettingKey, value: unknown): ValueOf<SettingDef> | null {
  const def: SettingDef = SETTINGS[key];
  const inRange = (n: unknown, min: number, max: number): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;

  switch (def.type) {
    case "boolean":
      return typeof value === "boolean" ? value : null;
    case "int":
    case "bps":
    case "paise":
      return inRange(value, def.min, def.max) ? value : null;
    case "time":
      return typeof value === "string" && TIME_PATTERN.test(value) ? value : null;
    case "enum":
      return typeof value === "string" && def.options.includes(value) ? value : null;
    case "int_list":
    case "paise_list": {
      if (!Array.isArray(value) || value.length === 0) return null;
      if (!value.every((n) => inRange(n, def.min, def.max))) return null;
      if (def.type === "int_list" && !value.every((n, i) => i === 0 || n > value[i - 1])) return null;
      return value as number[];
    }
    case "string_list":
      return Array.isArray(value) && value.length > 0 && value.every((s) => typeof s === "string" && SKILL_PATTERN.test(s))
        ? (value as string[])
        : null;
  }
}

// Defaults overlaid with an outlet's saved rows. Invalid rows are ignored.
export function resolveSettings(rows: readonly { key: string; value: unknown }[]): TeamSettings {
  const settings = Object.fromEntries(
    SETTING_KEYS.map((key) => [key, structuredClone(SETTINGS[key].default)]),
  ) as unknown as TeamSettings;
  for (const row of rows) {
    if (!isSettingKey(row.key)) continue;
    const valid = validateSetting(row.key, row.value);
    if (valid !== null) (settings as Record<string, unknown>)[row.key] = valid;
  }
  // Gullak: the per-level lists must line up.
  if (settings["gullak.level_amounts_paise"].length !== settings["gullak.level_start_days"].length) {
    settings["gullak.level_start_days"] = [...SETTINGS["gullak.level_start_days"].default];
    settings["gullak.level_amounts_paise"] = [...SETTINGS["gullak.level_amounts_paise"].default];
  }
  return settings;
}
