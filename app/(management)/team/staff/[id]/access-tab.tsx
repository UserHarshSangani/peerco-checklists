"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileText, Smartphone, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { SelectInput } from "@/components/team/fields";
import type { StaffRecord } from "./types";

const DOC_KINDS = ["appointment_letter_signed", "id_proof", "address_proof", "bank_proof", "photo", "other"] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const LOGIN_ERRORS = new Set(["no_mobile", "no_profile", "inactive", "mobile_in_use", "not_configured", "create_failed"]);

export function AccessTab({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  return (
    <div className="flex flex-col gap-4">
      <PhoneLoginCard record={record} onSaved={onSaved} />
      {record.canSeePay && <LetterCard record={record} />}
      <DocumentsCard record={record} onSaved={onSaved} />
    </div>
  );
}

function PhoneLoginCard({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(record.profile?.login_enabled);
  const mobile = record.profile?.mobile;

  async function toggle() {
    setBusy(true);
    const response = await fetch(`/api/team/staff/${record.staff.id}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    const reply = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    setBusy(false);
    if (!reply.ok) {
      const reason = LOGIN_ERRORS.has(reply.reason ?? "") ? reply.reason : "save_failed";
      showError(t(`team.login.error.${reason}` as TranslationKey));
      return;
    }
    showSuccess(enabled ? t("team.login.turnedOff") : t("team.login.turnedOn"));
    await onSaved();
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          {t("team.login.heading")}
        </p>
        <StatusPill tone={enabled ? "success" : "neutral"}>{enabled ? t("team.login.on") : t("team.login.off")}</StatusPill>
      </div>
      <p className="text-sm text-muted">
        {enabled ? t("team.login.howOn", { mobile: mobile ?? "" }) : t("team.login.howOff")}
      </p>
      {!mobile && !enabled && <p className="text-sm text-danger">{t("team.login.needMobile")}</p>}
      <Button
        type="button"
        variant={enabled ? "danger" : "primary"}
        loading={busy}
        disabled={!enabled && (!mobile || !record.staff.active)}
        onClick={toggle}
        className="self-start"
      >
        {enabled ? t("team.login.turnOff") : t("team.login.turnOn")}
      </Button>
    </Card>
  );
}

function LetterCard({ record }: { record: StaffRecord }) {
  const { t } = useLanguage();
  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        <FileText className="h-4 w-4" aria-hidden="true" />
        {t("team.letter.heading")}
      </p>
      <p className="text-sm text-muted">{t("team.letter.intro")}</p>
      {record.salaries.length === 0 && <p className="text-sm text-danger">{t("team.letter.needPay")}</p>}
      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/team/staff/${record.staff.id}/letter`}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-[44px] items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:bg-accent-pressed"
        >
          {t("team.letter.open")}
        </a>
        <Link
          href="/team/letter"
          className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium text-muted ring-1 ring-border hover:text-text"
        >
          {t("team.letter.editTemplate")}
        </Link>
      </div>
    </Card>
  );
}

function DocumentsCard({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<(typeof DOC_KINDS)[number]>("appointment_letter_signed");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (file.size > MAX_BYTES) return showError(t("team.docs.tooBig"));
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${record.outletId}/${record.staff.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("staff-documents")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setUploading(false);
      return showError(uploadError.message);
    }
    const { error } = await supabase
      .from("staff_documents")
      .insert({ staff_id: record.staff.id, outlet_id: record.outletId, kind, storage_path: path, note: file.name });
    setUploading(false);
    if (error) return showError(error.message);
    showSuccess(t("team.docs.uploaded"));
    await onSaved();
  }

  async function view(path: string) {
    const { data, error } = await supabase.storage.from("staff-documents").createSignedUrl(path, 60);
    if (error || !data) return showError(error?.message ?? "");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-text">{t("team.docs.heading")}</p>
      {record.documents.length === 0 ? (
        <p className="text-sm text-muted">{t("team.docs.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {record.documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block text-text">{t(`team.docs.kind.${d.kind}` as TranslationKey)}</span>
                <span className="block truncate text-xs text-muted">
                  {d.note} · {d.created_at.slice(0, 10)}
                </span>
              </span>
              <Button type="button" variant="ghost" onClick={() => view(d.storage_path)}>
                {t("team.docs.view")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SelectInput
          aria-label={t("team.docs.kindLabel")}
          className="max-w-xs"
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof DOC_KINDS)[number])}
        >
          {DOC_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`team.docs.kind.${k}` as TranslationKey)}
            </option>
          ))}
        </SelectInput>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Button type="button" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t("team.docs.upload")}
        </Button>
      </div>
    </Card>
  );
}
