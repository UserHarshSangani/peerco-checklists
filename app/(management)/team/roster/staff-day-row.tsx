"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatSegments, validSegments } from "@/lib/team/engines/time";
import type { RosterWarning } from "@/lib/team/engines/roster-rules";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SelectInput, TextInput } from "@/components/team/fields";
import { skillLabel } from "../shifts/minimums-tab";
import type { RosterEntry, RosterStaff, RosterTemplate } from "./use-roster";
import { warningText, type ShiftChoice } from "./roster-text";

type Props = {
  person: RosterStaff;
  date: string;
  entry: RosterEntry | null;
  templates: RosterTemplate[];
  allTemplates: RosterTemplate[];
  skills: string[];
  unavailable: boolean;
  warnings: RosterWarning[];
  onChoice: (choice: ShiftChoice, role: string | null) => Promise<void>;
  onRole: (entry: RosterEntry, role: string) => Promise<void>;
  onUnavailable: (unavailable: boolean) => Promise<void>;
};

function choiceValue(entry: RosterEntry | null): string {
  if (!entry) return "none";
  if (entry.kind === "weekly_off") return "off";
  return entry.shift_template_id ? `t:${entry.shift_template_id}` : "custom";
}

export function StaffDayRow(props: Props) {
  const { person, entry, templates, allTemplates, skills, unavailable, warnings } = props;
  const { t } = useLanguage();
  const [value, setValue] = useState(choiceValue(entry));
  const [custom, setCustom] = useState(
    entry && entry.kind === "work" && !entry.shift_template_id ? entry.segments[0] : { start: "12:00", end: "21:00" },
  );
  const [saving, setSaving] = useState(false);

  const defaultRole = entry?.role_skill ?? person.skills[0] ?? skills[0] ?? null;
  // A template that was switched off still shows on days that use it.
  const shownTemplates =
    entry?.shift_template_id && !templates.some((x) => x.id === entry.shift_template_id)
      ? [...templates, ...allTemplates.filter((x) => x.id === entry.shift_template_id)]
      : templates;

  async function run(fn: () => Promise<void>) {
    setSaving(true);
    await fn();
    setSaving(false);
  }

  async function pick(next: string) {
    setValue(next);
    if (next === "custom") return; // waits for the times + Save
    const choice: ShiftChoice =
      next === "none" ? { kind: "none" } : next === "off" ? { kind: "off" } : { kind: "template", templateId: next.slice(2) };
    await run(() => props.onChoice(choice, defaultRole));
  }

  const roleOptions = [...new Set([...person.skills, ...skills, ...(entry?.role_skill ? [entry.role_skill] : [])])];

  return (
    <div className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-text">
          {person.name}
          {unavailable && <StatusPill tone="danger">{t("team.roster.unavailable")}</StatusPill>}
        </p>
        <button
          type="button"
          className="min-h-[44px] text-xs font-medium text-muted hover:text-accent"
          onClick={() => run(() => props.onUnavailable(!unavailable))}
          disabled={saving}
        >
          {unavailable ? t("team.roster.markAvailable") : t("team.roster.markUnavailable")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SelectInput
          aria-label={t("team.roster.shiftFor", { name: person.name })}
          value={value}
          disabled={saving}
          onChange={(e) => void pick(e.target.value)}
        >
          <option value="none">{t("team.roster.notRostered")}</option>
          <option value="off">{t("team.roster.weeklyOff")}</option>
          {shownTemplates.map((tpl) => (
            <option key={tpl.id} value={`t:${tpl.id}`}>
              {tpl.name} ({formatSegments(tpl.segments)})
            </option>
          ))}
          <option value="custom">{t("team.roster.customTimes")}</option>
        </SelectInput>

        {entry?.kind === "work" && (
          <SelectInput
            aria-label={t("team.roster.roleFor", { name: person.name })}
            value={entry.role_skill ?? ""}
            disabled={saving}
            onChange={(e) => void run(() => props.onRole(entry, e.target.value))}
          >
            {!entry.role_skill && <option value="">{t("team.roster.pickRole")}</option>}
            {roleOptions.map((s) => (
              <option key={s} value={s}>
                {skillLabel(s)}
              </option>
            ))}
          </SelectInput>
        )}
      </div>

      {value === "custom" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TextInput
            type="time"
            className="w-32"
            aria-label={t("team.shifts.from")}
            value={custom.start}
            onChange={(e) => setCustom({ ...custom, start: e.target.value })}
          />
          <span className="text-muted">–</span>
          <TextInput
            type="time"
            className="w-32"
            aria-label={t("team.shifts.to")}
            value={custom.end}
            onChange={(e) => setCustom({ ...custom, end: e.target.value })}
          />
          <Button
            variant="secondary"
            loading={saving}
            disabled={!validSegments([custom])}
            onClick={() => run(() => props.onChoice({ kind: "custom", ...custom }, defaultRole))}
          >
            {t("team.common.save")}
          </Button>
        </div>
      )}

      {entry?.kind === "work" && entry.extended_until && (
        <p className="mt-2 text-xs text-muted">{t("team.roster.extended", { time: entry.extended_until })}</p>
      )}

      {warnings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1 text-xs text-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
              {warningText(t, w)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
