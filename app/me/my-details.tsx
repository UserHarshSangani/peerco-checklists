"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, Landmark, Pencil, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { processPhoto, staffPhotoPath, uploadStaffPhoto } from "@/lib/photo-upload";
import { formatDateLabel } from "@/lib/date";
import { normalizeAccountNumber, normalizeEsicIp, normalizeIfsc, normalizeMobile, normalizeUan } from "@/lib/team/validate";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { Field, SelectInput, TextInput } from "@/components/team/fields";

export type MyDetails = {
  staffId: string;
  outletId: string;
  name: string;
  photoUrl: string | null;
  gender: "male" | "female" | "other" | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  uan: string | null;
  esicIp: string | null;
};

export type MyBank = {
  current: { holder: string; last4: string; ifsc: string } | null;
  request: { status: "pending" | "approved" | "rejected" | "cancelled"; last4: string; ifsc: string; note: string | null } | null;
};

const REASONS: Record<string, TranslationKey> = {
  bad_gender: "team.myDetails.reason.bad_gender",
  bad_dob: "team.myDetails.reason.bad_dob",
  bad_address: "team.myDetails.reason.bad_address",
  bad_emergency_name: "team.myDetails.reason.bad_emergency_name",
  bad_phone: "team.myDetails.reason.bad_phone",
  bad_uan: "team.myDetails.reason.bad_uan",
  bad_esic: "team.myDetails.reason.bad_esic",
  bad_photo: "team.myDetails.reason.bad_photo",
  not_allowed: "team.myDetails.reason.not_allowed",
};

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-text">{value || "—"}</dd>
    </>
  );
}

export function MyDetailsCard({ details }: { details: MyDetails }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [form, setForm] = useState({
    gender: details.gender ?? "",
    dob: details.dateOfBirth ?? "",
    address: details.address ?? "",
    emergencyName: details.emergencyName ?? "",
    emergencyPhone: details.emergencyPhone ?? "",
    uan: details.uan ?? "",
    esic: details.esicIp ?? "",
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const missing = !details.dateOfBirth || !details.emergencyPhone || !details.address;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.emergencyPhone.trim() && !normalizeMobile(form.emergencyPhone)) return showError(t("team.myDetails.reason.bad_phone"));
    if (form.uan.trim() && !normalizeUan(form.uan)) return showError(t("team.myDetails.reason.bad_uan"));
    if (form.esic.trim() && !normalizeEsicIp(form.esic)) return showError(t("team.myDetails.reason.bad_esic"));

    setSaving(true);
    let photoPath: string | null = null;
    if (photo) {
      photoPath = staffPhotoPath(details.outletId, details.staffId);
      try {
        const { error } = await uploadStaffPhoto(supabase, photoPath, await processPhoto(photo.file));
        if (error) throw new Error(error);
      } catch {
        setSaving(false);
        return showError(t("team.myDetails.photoFailed"));
      }
    }
    const { data, error } = await supabase.rpc("team_update_my_profile", {
      p_gender: form.gender || null,
      p_date_of_birth: form.dob || null,
      p_address: form.address,
      p_emergency_name: form.emergencyName,
      p_emergency_phone: form.emergencyPhone.trim() ? normalizeMobile(form.emergencyPhone) : null,
      p_uan: form.uan,
      p_esic_ip: form.esic,
      p_photo_path: photoPath,
    });
    setSaving(false);
    const reply = data as { ok: boolean; reason?: string } | null;
    if (error || !reply?.ok) {
      return showError(t(REASONS[reply?.reason ?? ""] ?? "team.myDetails.failed"));
    }
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setEditing(false);
    showSuccess(t("team.myDetails.saved"));
    router.refresh();
  }

  if (!editing) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            {t("team.myDetails.heading")}
          </h2>
          <Button variant="secondary" className="min-h-[44px] px-4" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {t("team.myDetails.edit")}
          </Button>
        </div>
        {missing && <p className="mb-3 rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-fg">{t("team.myDetails.missing")}</p>}
        <div className="mb-3 flex items-center gap-3">
          <Avatar name={details.name} size="lg" src={details.photoUrl} />
          {!details.photoUrl && <p className="text-sm text-muted">{t("team.myDetails.noPhoto")}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <Row label={t("team.profile.gender")} value={details.gender ? t(`team.gender.${details.gender}` as TranslationKey) : null} />
          <Row label={t("team.profile.dob")} value={details.dateOfBirth ? formatDateLabel(details.dateOfBirth) : null} />
          <Row label={t("team.myDetails.address")} value={details.address} />
          <Row
            label={t("team.myDetails.emergency")}
            value={details.emergencyName || details.emergencyPhone ? [details.emergencyName, details.emergencyPhone].filter(Boolean).join(", ") : null}
          />
          <Row label={t("team.profile.uan")} value={details.uan} />
          <Row label={t("team.profile.esic")} value={details.esicIp} />
        </dl>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.myDetails.heading")}</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={details.name} size="lg" src={photo?.url ?? details.photoUrl} />
          <label className="relative flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-accent ring-1 ring-border">
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="absolute h-px w-px opacity-0"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (photo) URL.revokeObjectURL(photo.url);
                setPhoto({ file, url: URL.createObjectURL(file) });
              }}
            />
            <Camera className="h-4 w-4" aria-hidden="true" />
            {details.photoUrl || photo ? t("team.myDetails.changePhoto") : t("team.myDetails.addPhoto")}
          </label>
        </div>
        <Field label={t("team.profile.gender")} htmlFor="m-gender">
          <SelectInput id="m-gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">—</option>
            <option value="female">{t("team.gender.female")}</option>
            <option value="male">{t("team.gender.male")}</option>
            <option value="other">{t("team.gender.other")}</option>
          </SelectInput>
        </Field>
        <Field label={t("team.profile.dob")} htmlFor="m-dob">
          <TextInput id="m-dob" type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
        </Field>
        <Field label={t("team.myDetails.address")} htmlFor="m-address">
          <textarea
            id="m-address"
            rows={3}
            maxLength={500}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text"
          />
        </Field>
        <Field label={t("team.profile.emergencyName")} htmlFor="m-ename">
          <TextInput id="m-ename" maxLength={120} value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
        </Field>
        <Field label={t("team.profile.emergencyPhone")} htmlFor="m-ephone">
          <TextInput id="m-ephone" type="tel" inputMode="numeric" value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
        </Field>
        <Field label={t("team.profile.uan")} htmlFor="m-uan" hint={t("team.myDetails.uanHint")}>
          <TextInput id="m-uan" inputMode="numeric" value={form.uan} onChange={(e) => set("uan", e.target.value)} />
        </Field>
        <Field label={t("team.profile.esic")} htmlFor="m-esic" hint={t("team.myDetails.esicHint")}>
          <TextInput id="m-esic" inputMode="numeric" value={form.esic} onChange={(e) => set("esic", e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>
            {t("team.common.save")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (photo) URL.revokeObjectURL(photo.url);
              setPhoto(null);
              setEditing(false);
            }}
          >
            {t("team.common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function MyBankCard({ bank, name }: { bank: MyBank; name: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [holder, setHolder] = useState(bank.current?.holder ?? name);
  const [account, setAccount] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = bank.request?.status === "pending" ? bank.request : null;
  const rejected = bank.request?.status === "rejected" ? bank.request : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const clean = normalizeAccountNumber(account);
    if (!holder.trim()) return showError(t("team.myBank.reason.invalid_holder"));
    if (!clean) return showError(t("team.bank.badAccount"));
    if (clean !== normalizeAccountNumber(confirmAccount)) return showError(t("team.myBank.mismatch"));
    if (!normalizeIfsc(ifsc)) return showError(t("team.bank.badIfsc"));
    setSaving(true);
    const response = await fetch("/api/me/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holder, account_number: account, ifsc }),
    });
    const reply = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    setSaving(false);
    if (!reply.ok) return showError(reply.reason === "not_configured" ? t("team.bank.notConfigured") : t("team.bank.failed"));
    setAccount("");
    setConfirmAccount("");
    setEditing(false);
    showSuccess(t("team.myBank.sent"));
    router.refresh();
  }

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Landmark className="h-4 w-4" aria-hidden="true" />
        {t("team.myBank.heading")}
      </h2>
      <p className="mb-3 text-xs text-muted">{t("team.myBank.intro")}</p>

      {bank.current ? (
        <p className="mb-3 text-sm text-text">
          {bank.current.holder} · ••••{bank.current.last4} · {bank.current.ifsc}
        </p>
      ) : (
        <p className="mb-3 text-sm text-muted">{t("team.myBank.none")}</p>
      )}

      {pending && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-text">
          <StatusPill tone="warning">{t("team.myBank.waiting")}</StatusPill>
          {t("team.myBank.waitingDetail", { last4: pending.last4, ifsc: pending.ifsc })}
        </p>
      )}
      {rejected && !pending && (
        <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {t("team.myBank.rejected", { last4: rejected.last4, note: rejected.note ?? "" })}
        </p>
      )}

      {!editing ? (
        <Button variant="secondary" onClick={() => setEditing(true)}>
          {bank.current || pending ? t("team.myBank.change") : t("team.myBank.add")}
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label={t("team.bank.holder")} htmlFor="mb-holder">
            <TextInput id="mb-holder" required maxLength={120} value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field label={t("team.bank.account")} htmlFor="mb-account">
            <TextInput id="mb-account" required inputMode="numeric" autoComplete="off" value={account} onChange={(e) => setAccount(e.target.value)} />
          </Field>
          <Field label={t("team.myBank.confirm")} htmlFor="mb-confirm">
            <TextInput
              id="mb-confirm"
              required
              inputMode="numeric"
              autoComplete="off"
              value={confirmAccount}
              onChange={(e) => setConfirmAccount(e.target.value)}
            />
          </Field>
          <Field label={t("team.bank.ifsc")} htmlFor="mb-ifsc">
            <TextInput id="mb-ifsc" required autoCapitalize="characters" value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              {t("team.myBank.send")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {t("team.common.cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
