import { describe, expect, it } from "vitest";
import { teamDictionary } from "@/lib/i18n/team-translations";
import {
  resolveSettings,
  SETTING_GROUPS,
  SETTING_KEYS,
  SETTINGS,
  validateSetting,
} from "@/lib/team/settings/registry";

describe("team settings registry", () => {
  it("every default is valid for its own setting", () => {
    for (const key of SETTING_KEYS) {
      expect(validateSetting(key, SETTINGS[key].default), key).not.toBeNull();
    }
  });

  it("uses spec defaults", () => {
    const s = resolveSettings([]);
    expect(s["cover.ot_multiplier_bps"]).toBe(20000);
    expect(s["gullak.level_amounts_paise"]).toEqual([2000, 3000, 4000, 5000]);
    expect(s["gullak.unlock_months"]).toEqual([3, 6, 12]);
    expect(s["cover.comp_off_instead_of_pay"]).toBe(false);
    expect(s["exits.absconding_days"]).toBe(3);
  });

  it("applies valid overrides and ignores invalid or unknown ones", () => {
    const s = resolveSettings([
      { key: "attendance.grace_minutes", value: 5 },
      { key: "attendance.photo_retention_days", value: -1 },
      { key: "hours.women_late_cutoff", value: "25:00" },
      { key: "made.up_key", value: 1 },
    ]);
    expect(s["attendance.grace_minutes"]).toBe(5);
    expect(s["attendance.photo_retention_days"]).toBe(90);
    expect(s["hours.women_late_cutoff"]).toBe("19:00");
  });

  it("rejects Gullak levels that don't line up", () => {
    const s = resolveSettings([{ key: "gullak.level_amounts_paise", value: [2000, 3000] }]);
    expect(s["gullak.level_amounts_paise"]).toHaveLength(4);
    expect(validateSetting("gullak.level_start_days", [1, 30, 7])).toBeNull();
  });

  it("does not let callers mutate the shared defaults", () => {
    const s = resolveSettings([]);
    s["team.skills"].push("hacker");
    expect(resolveSettings([])["team.skills"]).not.toContain("hacker");
  });
});


describe("team settings labels", () => {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(teamDictionary, key);

  it("every setting, group and option has an English label", () => {
    for (const key of SETTING_KEYS) expect(has(`team.setting.${key}`), key).toBe(true);
    for (const group of SETTING_GROUPS) expect(has(`team.settings.group.${group}`), group).toBe(true);
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key];
      if (def.type === "enum") for (const o of def.options) expect(has(`team.option.${o}`), o).toBe(true);
      if ("unit" in def) expect(has(`team.unit.${def.unit}`), def.unit).toBe(true);
    }
  });
});

describe("settings form conversion", () => {
  it("shows paise as rupees and basis points as percent", async () => {
    const { settingToInput, inputToSetting } = await import("@/lib/team/settings/display");
    expect(settingToInput("gullak.level_amounts_paise", [2000, 3000, 4000, 5000])).toBe("20, 30, 40, 50");
    expect(settingToInput("cover.ot_multiplier_bps", 20000)).toBe("200");
    expect(inputToSetting("gullak.monthly_cap_paise", "1500")).toBe(150000);
    expect(inputToSetting("cover.ot_multiplier_bps", "150")).toBe(15000);
    expect(inputToSetting("attendance.grace_minutes", "7.5")).toBeNull();
    expect(inputToSetting("team.skills", "Captain, chef")).toEqual(["captain", "chef"]);
    expect(inputToSetting("gullak.unlock_months", "3, 6, 12")).toEqual([3, 6, 12]);
    expect(inputToSetting("gullak.unlock_months", "3, x")).toBeNull();
  });
});
