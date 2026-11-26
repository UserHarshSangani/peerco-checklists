"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatDuration, formatSegments, segmentsToIntervals, spanMinutes, validSegments, type Segment } from "@/lib/team/engines/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, TextInput } from "@/components/team/fields";

export type ShiftTemplate = {
  id: string;
  name: string;
  segments: Segment[];
  break_minutes: number;
  paid_break: boolean;
  active: boolean;
};

type Draft = { id: string | null; name: string; segments: Segment[]; breakMinutes: string; paidBreak: boolean; active: boolean };

const EMPTY: Draft = { id: null, name: "", segments: [{ start: "10:00", end: "19:00" }], breakMinutes: "30", paidBreak: false, active: true };

export function TemplatesTab({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("shift_templates")
      .select("id, name, segments, break_minutes, paid_break, active")
      .eq("outlet_id", outletId)
      .order("active", { ascending: false })
      .order("name");
    setLoading(false);
    if (error) showError(t("team.shifts.loadError", { error: error.message }));
    else setRows((data ?? []) as ShiftTemplate[]);
  }, [supabase, outletId, showError, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data on mount
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    const name = draft.name.trim();
    const breakMinutes = Number(draft.breakMinutes || "0");
    if (!name) return showError(t("team.shifts.nameRequired"));
    if (!validSegments(draft.segments)) return showError(t("team.shifts.badTimes"));
    if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 240) return showError(t("team.shifts.badBreak"));
    setSaving(true);
    const values = {
      outlet_id: outletId,
      name,
      segments: draft.segments,
      break_minutes: breakMinutes,
      paid_break: draft.paidBreak,
      active: draft.active,
    };
    const { error } = draft.id
      ? await supabase.from("shift_templates").update(values).eq("id", draft.id)
      : await supabase.from("shift_templates").insert(values);
    setSaving(false);
    if (error) {
      showError(error.code === "23505" ? t("team.shifts.nameTaken") : t("team.common.saveError", { error: error.message }));
      return;
    }
    showSuccess(t("team.common.saved"));
    setDraft(null);
    void load();
  }

  const setSegment = (i: number, patch: Partial<Segment>) =>
    setDraft((d) => d && { ...d, segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {loading && <SkeletonList rows={3} rowClassName="h-16" />}
      {!loading && rows.length === 0 && !draft && (
        <EmptyState title={t("team.shifts.none")} description={t("team.shifts.noneHint")} />
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const worked = spanMinutes(segmentsToIntervals(row.segments)) - (row.paid_break ? 0 : row.break_minutes);
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    id: row.id,
                    name: row.name,
                    segments: row.segments,
                    breakMinutes: String(row.break_minutes),
                    paidBreak: row.paid_break,
                    active: row.active,
                  })
                }
                className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-border hover:ring-accent"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{row.name}</p>
                  <p className="text-sm text-muted">
                    {formatSegments(row.segments)} · {t("team.shifts.worked", { hours: formatDuration(worked) })}
                  </p>
                </div>
                {!row.active && <StatusPill>{t("team.shifts.off")}</StatusPill>}
              </button>
            </li>
          );
        })}
      </ul>

      {!draft ? (
        <div>
          <Button variant="secondary" onClick={() => setDraft(EMPTY)}>
            <Plus className="h-5 w-5" aria-hidden="true" />
            {t("team.shifts.add")}
          </Button>
        </div>
      ) : (
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-text">{draft.id ? t("team.shifts.edit") : t("team.shifts.add")}</h3>
          <Field label={t("team.shifts.name")} htmlFor="shift-name">
            <TextInput
              id="shift-name"
              value={draft.name}
              placeholder={t("team.shifts.namePlaceholder")}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted">{t("team.shifts.times")}</p>
            {draft.segments.map((segment, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  type="time"
                  aria-label={t("team.shifts.from")}
                  value={segment.start}
                  onChange={(e) => setSegment(i, { start: e.target.value })}
                />
                <span className="text-muted">–</span>
                <TextInput
                  type="time"
                  aria-label={t("team.shifts.to")}
                  value={segment.end}
                  onChange={(e) => setSegment(i, { end: e.target.value })}
                />
                {draft.segments.length > 1 && (
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-danger"
                    aria-label={t("team.shifts.removePart")}
                    onClick={() => setDraft({ ...draft, segments: draft.segments.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {draft.segments.length < 3 && (
              <button
                type="button"
                className="self-start text-sm font-medium text-accent"
                onClick={() => setDraft({ ...draft, segments: [...draft.segments, { start: "18:00", end: "23:00" }] })}
              >
                {t("team.shifts.addPart")}
              </button>
            )}
            <p className="text-xs text-muted">{t("team.shifts.timesHint")}</p>
          </div>

          <Field label={t("team.shifts.break")} htmlFor="shift-break">
            <TextInput
              id="shift-break"
              inputMode="numeric"
              value={draft.breakMinutes}
              onChange={(e) => setDraft({ ...draft, breakMinutes: e.target.value.replace(/\D/g, "") })}
            />
          </Field>
          <CheckRow checked={draft.paidBreak} onChange={(paidBreak) => setDraft({ ...draft, paidBreak })} label={t("team.shifts.paidBreak")} />
          <CheckRow
            checked={draft.active}
            onChange={(active) => setDraft({ ...draft, active })}
            label={t("team.shifts.active")}
            hint={t("team.shifts.activeHint")}
          />
          <div className="flex gap-2">
            <Button onClick={save} loading={saving}>
              {t("team.common.save")}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t("team.common.cancel")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
