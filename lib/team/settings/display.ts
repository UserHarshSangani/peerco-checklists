import { SETTINGS, validateSetting, type SettingDef, type SettingKey } from "./registry";

// Converts between stored setting values (paise, basis points) and what a
// person types in the settings form (rupees, percent). Pure, so it's tested.

const PAISE_PER_RUPEE = 100;
const BPS_PER_PERCENT = 100;

function numberToInput(def: SettingDef, n: number): string {
  if (def.type === "paise" || def.type === "paise_list") return String(n / PAISE_PER_RUPEE);
  if (def.type === "bps") return String(n / BPS_PER_PERCENT);
  return String(n);
}

function inputToNumber(def: SettingDef, raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (def.type === "paise" || def.type === "paise_list") return Math.round(n * PAISE_PER_RUPEE);
  if (def.type === "bps") return Math.round(n * BPS_PER_PERCENT);
  return Number.isInteger(n) ? n : null;
}

export function settingToInput(key: SettingKey, value: unknown): string {
  const def: SettingDef = SETTINGS[key];
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "number" ? numberToInput(def, v) : String(v))).join(", ");
  }
  if (typeof value === "number") return numberToInput(def, value);
  return String(value);
}

// Parses form input into a valid stored value, or null if it isn't allowed.
export function inputToSetting(key: SettingKey, raw: string | boolean): unknown | null {
  const def: SettingDef = SETTINGS[key];
  let value: unknown;
  switch (def.type) {
    case "boolean":
      value = raw;
      break;
    case "time":
    case "enum":
      value = String(raw).trim();
      break;
    case "string_list":
      value = String(raw)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      break;
    case "int_list":
    case "paise_list": {
      const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
      const numbers = parts.map((p) => inputToNumber(def, p));
      if (numbers.some((n) => n === null)) return null;
      value = numbers;
      break;
    }
    default:
      value = inputToNumber(def, String(raw));
  }
  return validateSetting(key, value);
}
