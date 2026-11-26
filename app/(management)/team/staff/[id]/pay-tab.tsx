"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { todayInKolkata } from "@/lib/date";
import { formatINR } from "@/lib/team/money";
import { monthlyGrossPaise, structureOn, type AllowanceLine, type SalaryStructure } from "@/lib/team/salary";
import { normalizeAccountNumber, normalizeIfsc } from "@/lib/team/validate";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, SelectInput, TextInput, paiseToRupeesInput, rupeesToPaise } from "@/components/team/fields";
import type { StaffRecord } from "./types";

type AllowanceDraft = { label: string; rupees: string; excluded: boolean };

function slug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "allowance";
}

export function PayTab({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const current = structureOn(record.salaries, todayInKolkata());

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-3 text-sm font-semibold text-text">{t("team.pay.history")}</p>
        {record.salaries.length === 0 ? (
          <p className="text-sm text-muted">{t("team.pay.none")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {record.salaries.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="flex items-center gap-2 text-text">
                  {t("team.pay.from", { date: s.effective_from })}
                  {current?.id === s.id && <StatusPill tone="success">{t("team.pay.current")}</StatusPill>}
                  {s.effective_from > todayInKolkata() && <StatusPill tone="info">{t("team.pay.upcoming")}</StatusPill>}
                </span>
                <span className="font-medium text-text">
                  {s.wage_type === "daily"
                    ? t("team.pay.perDay", { amount: formatINR(s.daily_rate_paise ?? 0) })
                    : t("team.pay.perMonth", { amount: formatINR(monthlyGrossPaise(s)) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <NewStructureForm record={record} base={current ?? record.salaries[0] ?? null} onSaved={onSaved} />
      {record.bankRequest && <BankRequestCard record={record} onSaved={onSaved} />}
      <BankCard record={record} onSaved={onSaved} />
    </div>
  );
}

function NewStructureForm({
  record,
  base,
  onSaved,
}: {
  record: StaffRecord;
  base: SalaryStructure | null;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [effectiveFrom, setEffectiveFrom] = useState(
    base ? todayInKolkata() : (record.profile?.joining_date ?? todayInKolkata()),
  );
  const [wageType, setWageType] = useState<"monthly" | "daily">(base?.wage_type ?? record.profile?.wage_type ?? "monthly");
  const [basic, setBasic] = useState(paiseToRupeesInput(base?.basic_paise));
  const [da, setDa] = useState(paiseToRupeesInput(base?.da_paise));
  const [hra, setHra] = useState(paiseToRupeesInput(base?.hra_paise));
  const [daily, setDaily] = useState(paiseToRupeesInput(base?.daily_rate_paise));
  const [allowances, setAllowances] = useState<AllowanceDraft[]>(
    (base?.other_allowances ?? []).map((a) => ({ label: a.label, rupees: paiseToRupeesInput(a.paise), excluded: Boolean(a.excluded_from_wages) })),
  );
  const [saving, setSaving] = useState(false);

  const parsedAllowances = allowances.map((a) => ({ ...a, paise: rupeesToPaise(a.rupees) }));
  const amounts = [rupeesToPaise(basic), rupeesToPaise(da), rupeesToPaise(hra), ...parsedAllowances.map((a) => a.paise)];
  const preview =
    wageType === "monthly" && amounts.every((a) => a !== null)
      ? (amounts as number[]).reduce((sum, a) => sum + a, 0)
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (amounts.some((a) => a === null) || (wageType === "daily" && rupeesToPaise(daily) === null)) {
      return showError(t("team.pay.badAmount"));
    }
    if (wageType === "daily" && !rupeesToPaise(daily)) return showError(t("team.pay.dailyNeeded"));
    if (wageType === "monthly" && !rupeesToPaise(basic)) return showError(t("team.pay.basicNeeded"));
    if (parsedAllowances.some((a) => !a.label.trim())) return showError(t("team.pay.allowanceLabel"));

    const other: AllowanceLine[] = parsedAllowances.map((a) => ({
      code: slug(a.label),
      label: a.label.trim(),
      paise: a.paise ?? 0,
      excluded_from_wages: a.excluded,
    }));

    setSaving(true);
    const { error } = await supabase.from("salary_structures").insert({
      staff_id: record.staff.id,
      outlet_id: record.outletId,
      effective_from: effectiveFrom,
      wage_type: wageType,
      basic_paise: wageType === "monthly" ? rupeesToPaise(basic) : 0,
      da_paise: wageType === "monthly" ? rupeesToPaise(da) : 0,
      hra_paise: wageType === "monthly" ? rupeesToPaise(hra) : 0,
      other_allowances: wageType === "monthly" ? other : [],
      fixed_incentives: [],
      daily_rate_paise: wageType === "daily" ? rupeesToPaise(daily) : null,
    });
    setSaving(false);
    if (error) {
      showError(error.code === "23505" ? t("team.pay.sameDate") : error.message);
      return;
    }
    showSuccess(t("team.settings.saved"));
    await onSaved();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-text">{base ? t("team.pay.changeHeading") : t("team.pay.firstHeading")}</p>
          <p className="text-xs text-muted">{t("team.pay.versionHint")}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("team.pay.effectiveFrom")} htmlFor="s-from">
            <TextInput id="s-from" type="date" required value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label={t("team.profile.wageType")} htmlFor="s-wage">
            <SelectInput id="s-wage" value={wageType} onChange={(e) => setWageType(e.target.value as "monthly" | "daily")}>
              <option value="monthly">{t("team.wage.monthly")}</option>
              <option value="daily">{t("team.wage.daily")}</option>
            </SelectInput>
          </Field>
          {wageType === "daily" ? (
            <Field label={t("team.pay.dailyRate")} htmlFor="s-daily">
              <TextInput id="s-daily" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label={t("team.pay.basic")} htmlFor="s-basic">
                <TextInput id="s-basic" inputMode="decimal" value={basic} onChange={(e) => setBasic(e.target.value)} />
              </Field>
              <Field label={t("team.pay.da")} htmlFor="s-da">
                <TextInput id="s-da" inputMode="decimal" value={da} onChange={(e) => setDa(e.target.value)} />
              </Field>
              <Field label={t("team.pay.hra")} htmlFor="s-hra">
                <TextInput id="s-hra" inputMode="decimal" value={hra} onChange={(e) => setHra(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {wageType === "monthly" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-muted">{t("team.pay.allowances")}</p>
            {allowances.map((a, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl bg-bg p-3 ring-1 ring-border">
                <div className="flex gap-2">
                  <TextInput
                    aria-label={t("team.pay.allowanceName")}
                    placeholder={t("team.pay.allowanceName")}
                    value={a.label}
                    onChange={(e) => setAllowances((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  />
                  <TextInput
                    aria-label={t("team.pay.amount")}
                    placeholder="₹"
                    inputMode="decimal"
                    className="max-w-[8rem]"
                    value={a.rupees}
                    onChange={(e) => setAllowances((prev) => prev.map((x, j) => (j === i ? { ...x, rupees: e.target.value } : x)))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t("team.pay.removeAllowance")}
                    onClick={() => setAllowances((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <CheckRow
                  checked={a.excluded}
                  onChange={(v) => setAllowances((prev) => prev.map((x, j) => (j === i ? { ...x, excluded: v } : x)))}
                  label={t("team.pay.excluded")}
                  hint={t("team.pay.excludedHint")}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => setAllowances((prev) => [...prev, { label: "", rupees: "", excluded: true }])}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("team.pay.addAllowance")}
            </Button>
          </div>
        )}

        {preview !== null && (
          <p className="text-sm text-text">{t("team.pay.preview", { amount: formatINR(preview) })}</p>
        )}
        <Button type="submit" loading={saving} className="self-start">
          {t("team.pay.save")}
        </Button>
      </form>
    </Card>
  );
}

// A bank change the staff member asked for from their phone. Nothing is
// used for salary until someone allowed to see pay approves it.
function BankRequestCard({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const req = record.bankRequest!;

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = await supabase.rpc("team_decide_bank_change", { p_request: req.id, p_approve: approve, p_note: note });
    setBusy(false);
    const reply = data as { ok: boolean; reason?: string } | null;
    if (error || !reply?.ok) {
      return showError(reply?.reason === "note_required" ? t("team.bankRequest.noteRequired") : t("team.bank.failed"));
    }
    showSuccess(approve ? t("team.bankRequest.approved") : t("team.bankRequest.rejected"));
    await onSaved();
  }

  return (
    <Card className="ring-2 ring-warning-icon">
      <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
        <StatusPill tone="warning">{t("team.bankRequest.pill")}</StatusPill>
        {t("team.bankRequest.heading")}
      </p>
      <p className="mb-1 text-sm text-text">
        {req.account_holder_name} · ••••{req.account_last4} · {req.ifsc}
      </p>
      <p className="mb-3 text-xs text-muted">
        {t("team.bankRequest.hint", { current: record.bank ? `••••${record.bank.account_last4}` : t("team.bankRequest.noCurrent") })}
      </p>
      {rejecting ? (
        <div className="flex flex-col gap-3">
          <Field label={t("team.bankRequest.reason")} htmlFor="br-note">
            <TextInput id="br-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => decide(false)}>
              {t("team.bankRequest.reject")}
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button loading={busy} onClick={() => decide(true)}>
            {t("team.bankRequest.approve")}
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            {t("team.bankRequest.reject")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function BankCard({ record, onSaved }: { record: StaffRecord; onSaved: () => Promise<void> }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const [editing, setEditing] = useState(!record.bank);
  const [holder, setHolder] = useState(record.bank?.account_holder_name ?? record.staff.name);
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState(record.bank?.ifsc ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!normalizeAccountNumber(account)) return showError(t("team.bank.badAccount"));
    if (!normalizeIfsc(ifsc)) return showError(t("team.bank.badIfsc"));
    setSaving(true);
    const response = await fetch(`/api/team/staff/${record.staff.id}/bank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holder, account_number: account, ifsc }),
    });
    const reply = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    setSaving(false);
    if (!reply.ok) {
      showError(reply.reason === "not_configured" ? t("team.bank.notConfigured") : t("team.bank.failed"));
      return;
    }
    setAccount("");
    setEditing(false);
    showSuccess(t("team.settings.saved"));
    await onSaved();
  }

  return (
    <Card>
      <p className="mb-1 text-sm font-semibold text-text">{t("team.bank.heading")}</p>
      <p className="mb-3 text-xs text-muted">{t("team.bank.privacy")}</p>
      {record.bank && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text">
            {record.bank.account_holder_name} · ••••{record.bank.account_last4} · {record.bank.ifsc}
          </p>
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            {t("team.bank.change")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("team.bank.holder")} htmlFor="b-holder">
            <TextInput id="b-holder" required value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
          <Field label={t("team.bank.account")} htmlFor="b-account">
            <TextInput
              id="b-account"
              required
              inputMode="numeric"
              autoComplete="off"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </Field>
          <Field label={t("team.bank.ifsc")} htmlFor="b-ifsc">
            <TextInput id="b-ifsc" required autoCapitalize="characters" value={ifsc} onChange={(e) => setIfsc(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" loading={saving}>
              {t("team.bank.save")}
            </Button>
            {record.bank && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
