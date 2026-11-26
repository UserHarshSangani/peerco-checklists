"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Field, SelectInput, TextInput } from "@/components/team/fields";

type Row = { id: string; role_skill: string; weekday: number | null; slot_start: string; slot_end: string; min_count: number };

export const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6].map((d) => `team.weekday.${d}` as TranslationKey);
export const skillLabel = (skill: string) => skill.replace(/_/g, " ");

export function MinimumsTab({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ skill: "", weekday: "all", start: "12:00", end: "23:00", count: "1" });

  const load = useCallback(async () => {
    const [{ data, error }, settings] = await Promise.all([
      supabase
        .from("staffing_minimums")
        .select("id, role_skill, weekday, slot_start, slot_end, min_count")
        .eq("outlet_id", outletId)
        .order("role_skill")
        .order("weekday", { nullsFirst: true })
        .order("slot_start"),
      getTeamSettings(supabase, outletId).catch(() => null),
    ]);
    setLoading(false);
    if (error) showError(t("team.shifts.loadError", { error: error.message }));
    else setRows((data ?? []) as Row[]);
    const list = settings?.["team.skills"] ?? [];
    setSkills(list);
    setDraft((d) => (d.skill ? d : { ...d, skill: list[0] ?? "" }));
  }, [supabase, outletId, showError, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void load();
  }, [load]);

  async function add() {
    const count = Number(draft.count);
    if (!draft.skill) return showError(t("team.minimums.skillRequired"));
    if (!draft.start || !draft.end || draft.start === draft.end) return showError(t("team.shifts.badTimes"));
    if (!Number.isInteger(count) || count < 1 || count > 50) return showError(t("team.minimums.badCount"));
    setSaving(true);
    const { error } = await supabase.from("staffing_minimums").insert({
      outlet_id: outletId,
      role_skill: draft.skill,
      weekday: draft.weekday === "all" ? null : Number(draft.weekday),
      slot_start: draft.start,
      slot_end: draft.end,
      min_count: count,
    });
    setSaving(false);
    if (error) return showError(t("team.common.saveError", { error: error.message }));
    showSuccess(t("team.common.saved"));
    void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("staffing_minimums").delete().eq("id", id);
    if (error) return showError(t("team.common.saveError", { error: error.message }));
    setRows((list) => list.filter((r) => r.id !== id));
  }

  const bySkill = rows.reduce<Record<string, Row[]>>((acc, row) => {
    (acc[row.role_skill] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-sm text-muted">{t("team.minimums.intro")}</p>
      {loading && <SkeletonList rows={3} rowClassName="h-12" />}
      {!loading && rows.length === 0 && <EmptyState title={t("team.minimums.none")} description={t("team.minimums.noneHint")} />}

      {Object.entries(bySkill).map(([skill, list]) => (
        <Card key={skill}>
          <h3 className="mb-2 font-semibold capitalize text-text">{skillLabel(skill)}</h3>
          <ul className="flex flex-col divide-y divide-border">
            {list.map((row) => (
              <li key={row.id} className="flex min-h-[44px] items-center justify-between gap-3 py-1 text-sm">
                <span className="text-text">
                  {row.weekday === null ? t("team.minimums.everyDay") : t(WEEKDAY_KEYS[row.weekday])} ·{" "}
                  {row.slot_start.slice(0, 5)}–{row.slot_end.slice(0, 5)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-text">{t("team.minimums.atLeast", { count: row.min_count })}</span>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-danger"
                    aria-label={t("team.minimums.remove")}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card className="flex flex-col gap-3">
        <h3 className="font-semibold text-text">{t("team.minimums.add")}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("team.minimums.role")} htmlFor="min-skill">
            <SelectInput id="min-skill" value={draft.skill} onChange={(e) => setDraft({ ...draft, skill: e.target.value })}>
              {skills.map((s) => (
                <option key={s} value={s}>
                  {skillLabel(s)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={t("team.minimums.day")} htmlFor="min-day">
            <SelectInput id="min-day" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: e.target.value })}>
              <option value="all">{t("team.minimums.everyDay")}</option>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {t(WEEKDAY_KEYS[d])}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={t("team.shifts.from")} htmlFor="min-from">
            <TextInput id="min-from" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </Field>
          <Field label={t("team.shifts.to")} htmlFor="min-to">
            <TextInput id="min-to" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </Field>
          <Field label={t("team.minimums.count")} htmlFor="min-count">
            <TextInput
              id="min-count"
              inputMode="numeric"
              value={draft.count}
              onChange={(e) => setDraft({ ...draft, count: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">{t("team.minimums.dayHint")}</p>
        <div>
          <Button onClick={add} loading={saving}>
            {t("team.minimums.addButton")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
