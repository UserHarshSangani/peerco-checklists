"use client";

import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { normalizeEsicIp, normalizeMobile, normalizeUan } from "@/lib/team/validate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, SelectInput, TextInput } from "@/components/team/fields";
import type { StaffProfileRow, StaffRecord } from "./types";

type Form = {
  mobile: string;
  gender: string;
  date_of_birth: string;
  joining_date: string;
  employment_status: StaffProfileRow["employment_status"];
  wage_type: StaffProfileRow["wage_type"];
  is_part_timer_on_call: boolean;
  uan: string;
  esic_ip_number: string;
  pf_on_actual_wages: boolean;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  late_shift_consent: boolean;
  transport_note: string;
  address: string;
};

function toForm(p: StaffProfileRow | null): Form {
  return {
    mobile: p?.mobile ?? "",
    gender: p?.gender ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    joining_date: p?.joining_date ?? "",
    employment_status: p?.employment_status ?? "active",
    wage_type: p?.wage_type ?? "monthly",
    is_part_timer_on_call: p?.is_part_timer_on_call ?? false,
    uan: p?.uan ?? "",
    esic_ip_number: p?.esic_ip_number ?? "",
    pf_on_actual_wages: p?.pf_on_actual_wages ?? false,
    emergency_contact_name: p?.emergency_contact_name ?? "",
    emergency_contact_phone: p?.emergency_contact_phone ?? "",
    late_shift_consent: p?.late_shift_consent ?? false,
    transport_note: p?.transport_note ?? "",
    address: p?.address ?? "",
  };
}

const STATUSES: StaffProfileRow["employment_status"][] = ["active", "on_notice", "exited", "absconded"];

export function ProfileTab({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<Form>(() => toForm(record.profile));
  const [skills, setSkills] = useState<string[]>(record.skills);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const skillChoices = Array.from(new Set([...record.skillOptions, ...record.skills]));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const mobile = form.mobile.trim() ? normalizeMobile(form.mobile) : null;
    if (form.mobile.trim() && !mobile) return showError(t("team.profile.badMobile"));
    const emergencyPhone = form.emergency_contact_phone.trim() ? normalizeMobile(form.emergency_contact_phone) : null;
    if (form.emergency_contact_phone.trim() && !emergencyPhone) return showError(t("team.profile.badMobile"));
    const uan = form.uan.trim() ? normalizeUan(form.uan) : null;
    if (form.uan.trim() && !uan) return showError(t("team.profile.badUan"));
    const esic = form.esic_ip_number.trim() ? normalizeEsicIp(form.esic_ip_number) : null;
    if (form.esic_ip_number.trim() && !esic) return showError(t("team.profile.badEsic"));
    if (record.profile?.login_enabled && !mobile) return showError(t("team.profile.mobileNeededForLogin"));

    const consentChanged = form.late_shift_consent !== (record.profile?.late_shift_consent ?? false);
    const values = {
      mobile,
      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,
      joining_date: form.joining_date || null,
      employment_status: form.employment_status,
      wage_type: form.wage_type,
      is_part_timer_on_call: form.is_part_timer_on_call,
      uan,
      esic_ip_number: esic,
      pf_on_actual_wages: form.pf_on_actual_wages,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: emergencyPhone,
      late_shift_consent: form.late_shift_consent,
      late_shift_consent_at: consentChanged
        ? form.late_shift_consent
          ? new Date().toISOString()
          : null
        : (record.profile?.late_shift_consent_at ?? null),
      transport_note: form.transport_note.trim() || null,
      address: form.address.trim() || null,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    const { error } = record.profile
      ? await supabase.from("staff_profiles").update(values).eq("staff_id", record.staff.id)
      : await supabase.from("staff_profiles").insert({ staff_id: record.staff.id, outlet_id: record.outletId, ...values });

    let skillError = null;
    if (!error && skills.join() !== record.skills.join()) {
      const del = await supabase.from("staff_skills").delete().eq("staff_id", record.staff.id);
      skillError = del.error;
      if (!skillError && skills.length) {
        const ins = await supabase
          .from("staff_skills")
          .insert(skills.map((skill) => ({ staff_id: record.staff.id, outlet_id: record.outletId, skill })));
        skillError = ins.error;
      }
    }
    setSaving(false);

    const failure = error ?? skillError;
    if (failure) {
      showError(failure.code === "23505" ? t("team.profile.mobileTaken") : failure.message);
      return;
    }
    showSuccess(t("team.settings.saved"));
    await onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("team.profile.mobile")} htmlFor="p-mobile">
          <TextInput id="p-mobile" type="tel" inputMode="numeric" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </Field>
        <Field label={t("team.profile.gender")} htmlFor="p-gender">
          <SelectInput id="p-gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option value="female">{t("team.gender.female")}</option>
            <option value="male">{t("team.gender.male")}</option>
            <option value="other">{t("team.gender.other")}</option>
          </SelectInput>
        </Field>
        <Field label={t("team.profile.dob")} htmlFor="p-dob">
          <TextInput id="p-dob" type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
        </Field>
        <Field label={t("team.profile.joined")} htmlFor="p-joined">
          <TextInput id="p-joined" type="date" value={form.joining_date} onChange={(e) => set("joining_date", e.target.value)} />
        </Field>
        <Field label={t("team.profile.status")} htmlFor="p-status">
          <SelectInput
            id="p-status"
            value={form.employment_status}
            onChange={(e) => set("employment_status", e.target.value as Form["employment_status"])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`team.status.${s}` as TranslationKey)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t("team.profile.wageType")} htmlFor="p-wage">
          <SelectInput id="p-wage" value={form.wage_type} onChange={(e) => set("wage_type", e.target.value as Form["wage_type"])}>
            <option value="monthly">{t("team.wage.monthly")}</option>
            <option value="daily">{t("team.wage.daily")}</option>
          </SelectInput>
        </Field>
        <div className="sm:col-span-2">
          <CheckRow
            checked={form.is_part_timer_on_call}
            onChange={(v) => set("is_part_timer_on_call", v)}
            label={t("team.profile.partTimer")}
            hint={t("team.profile.partTimerHint")}
          />
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-semibold text-text">{t("team.profile.skills")}</p>
        <div className="flex flex-wrap gap-2">
          {skillChoices.map((skill) => {
            const on = skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                aria-pressed={on}
                onClick={() => setSkills((prev) => (on ? prev.filter((s) => s !== skill) : [...prev, skill].sort()))}
                className={`min-h-[40px] rounded-full px-4 text-sm font-medium capitalize ${
                  on ? "bg-accent text-accent-fg" : "bg-border/40 text-muted hover:text-text"
                }`}
              >
                {skill.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">{t("team.profile.skillsHint")}</p>
      </Card>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("team.profile.uan")} htmlFor="p-uan" hint={t("team.profile.uanHint")}>
          <TextInput id="p-uan" inputMode="numeric" value={form.uan} onChange={(e) => set("uan", e.target.value)} />
        </Field>
        <Field label={t("team.profile.esic")} htmlFor="p-esic" hint={t("team.profile.esicHint")}>
          <TextInput id="p-esic" inputMode="numeric" value={form.esic_ip_number} onChange={(e) => set("esic_ip_number", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <CheckRow
            checked={form.pf_on_actual_wages}
            onChange={(v) => set("pf_on_actual_wages", v)}
            label={t("team.profile.pfActual")}
            hint={t("team.profile.pfActualHint")}
          />
        </div>
      </Card>

      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("team.myDetails.address")} htmlFor="p-address">
            <textarea
              id="p-address"
              rows={2}
              maxLength={500}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text"
            />
          </Field>
        </div>
        <Field label={t("team.profile.emergencyName")} htmlFor="p-ename">
          <TextInput id="p-ename" value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} />
        </Field>
        <Field label={t("team.profile.emergencyPhone")} htmlFor="p-ephone">
          <TextInput
            id="p-ephone"
            type="tel"
            inputMode="numeric"
            value={form.emergency_contact_phone}
            onChange={(e) => set("emergency_contact_phone", e.target.value)}
          />
        </Field>
      </Card>

      {form.gender === "female" && (
        <Card className="flex flex-col gap-3">
          <CheckRow
            checked={form.late_shift_consent}
            onChange={(v) => set("late_shift_consent", v)}
            label={t("team.profile.lateConsent")}
            hint={t("team.profile.lateConsentHint")}
          />
          <Field label={t("team.profile.transport")} htmlFor="p-transport">
            <TextInput id="p-transport" value={form.transport_note} onChange={(e) => set("transport_note", e.target.value)} />
          </Field>
        </Card>
      )}

      <Button type="submit" loading={saving} className="self-start">
        {saving ? t("auth.reset.saving") : t("team.profile.save")}
      </Button>
    </form>
  );
}
