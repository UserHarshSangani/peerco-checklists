"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { addDaysToDateString, todayInKolkata } from "@/lib/date";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, SelectInput, TextInput } from "@/components/team/fields";
import type { JoiningItems, StaffRecord } from "./types";

const ITEMS: (keyof JoiningItems)[] = [
  "documents_collected",
  "bank_details",
  "esic_registered",
  "pf_registered",
  "appointment_letter_signed",
];

export function JoiningTab({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<JoiningItems>(record.joining?.items ?? {});
  const [buddy, setBuddy] = useState(record.joining?.buddy_staff_id ?? "");
  const [day7Note, setDay7Note] = useState(record.joining?.day7_note ?? "");
  const [day30Note, setDay30Note] = useState(record.joining?.day30_note ?? "");
  const [saving, setSaving] = useState(false);

  const joined = record.profile?.joining_date ?? null;
  const today = todayInKolkata();

  async function save(extra: { day7_checkin_at?: string | null; day30_checkin_at?: string | null } = {}) {
    setSaving(true);
    const { error } = await supabase.from("joining_checklists").upsert({
      staff_id: record.staff.id,
      outlet_id: record.outletId,
      items,
      buddy_staff_id: buddy || null,
      day7_note: day7Note.trim() || null,
      day30_note: day30Note.trim() || null,
      day7_checkin_at: record.joining?.day7_checkin_at ?? null,
      day30_checkin_at: record.joining?.day30_checkin_at ?? null,
      ...extra,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return showError(error.message);
    showSuccess(t("team.settings.saved"));
    await onSaved();
  }

  function checkin(day: 7 | 30) {
    const at = record.joining?.[day === 7 ? "day7_checkin_at" : "day30_checkin_at"];
    const due = joined ? addDaysToDateString(joined, day) : null;
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-bg p-3 ring-1 ring-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text">{t(day === 7 ? "team.joining.day7" : "team.joining.day30")}</p>
          {at ? (
            <StatusPill tone="success">{t("team.joining.done")}</StatusPill>
          ) : due ? (
            <StatusPill tone={due <= today ? "warning" : "neutral"}>{t("team.joining.due", { date: due })}</StatusPill>
          ) : null}
        </div>
        <TextInput
          aria-label={t("team.joining.note")}
          placeholder={t("team.joining.notePlaceholder")}
          value={day === 7 ? day7Note : day30Note}
          onChange={(e) => (day === 7 ? setDay7Note(e.target.value) : setDay30Note(e.target.value))}
        />
        {!at && (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={saving}
            onClick={() => save(day === 7 ? { day7_checkin_at: new Date().toISOString() } : { day30_checkin_at: new Date().toISOString() })}
          >
            {t("team.joining.markDone")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-2 text-sm font-semibold text-text">{t("team.joining.heading")}</p>
        {ITEMS.map((key) => (
          <CheckRow
            key={key}
            checked={Boolean(items[key])}
            onChange={(v) => setItems((prev) => ({ ...prev, [key]: v }))}
            label={t(`team.joining.item.${key}` as TranslationKey)}
          />
        ))}
      </Card>
      <Card className="flex flex-col gap-4">
        <Field label={t("team.joining.buddy")} htmlFor="j-buddy" hint={t("team.joining.buddyHint")}>
          <SelectInput id="j-buddy" value={buddy} onChange={(e) => setBuddy(e.target.value)}>
            <option value="">—</option>
            {record.colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        {checkin(7)}
        {checkin(30)}
      </Card>
      <Button type="button" loading={saving} className="self-start" onClick={() => save()}>
        {t("team.profile.save")}
      </Button>
    </div>
  );
}
