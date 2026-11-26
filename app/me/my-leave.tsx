"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatDateLabel } from "@/lib/date";
import { leaveProofPath, processPhoto, uploadLeaveProof } from "@/lib/photo-upload";
import {
  checkRequest,
  formatLeaveDays,
  leaveMinutes,
  needsProof,
  splitPaid,
  type LeaveType,
} from "@/lib/team/engines/leave";
import { addDays } from "@/lib/team/engines/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, SelectInput, TextInput } from "@/components/team/fields";

export type MyLeaveRequest = {
  id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  leaving_at: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  paid_minutes: number | null;
  unpaid_minutes: number | null;
  decision_note: string | null;
};

export type MyLeave = {
  staffId: string;
  outletId: string;
  today: string;
  noticeDays: number;
  dayMinutes: number;
  types: LeaveType[];
  /** typeId → minutes */
  balances: Record<string, number>;
  requests: MyLeaveRequest[];
  weeklyOffs: string[];
};

export const STATUS_TONE: Record<MyLeaveRequest["status"], PillTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export function dateRangeLabel(from: string, to: string): string {
  return from === to ? formatDateLabel(from) : `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
}

export function MyLeaveCard({ leave }: { leave: MyLeave }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const typeName = (id: string) => leave.types.find((x) => x.id === id)?.name ?? "";
  const balanceTypes = leave.types.filter((x) => x.paid && x.active && (x.rules.perYearDays > 0 || (leave.balances[x.id] ?? 0) !== 0));
  const days = (minutes: number) => formatLeaveDays(minutes, leave.dayMinutes);

  async function cancel(request: MyLeaveRequest) {
    setBusy(request.id);
    const { data, error } = await supabase.rpc("team_cancel_leave", { p_request: request.id });
    setBusy(null);
    const reply = data as { ok: boolean; reason?: string } | null;
    if (error || !reply?.ok) return showError(t(`team.leave.reason.${reply?.reason ?? "bad_request"}` as TranslationKey));
    showSuccess(t("team.leave.cancelled"));
    router.refresh();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {t("team.leave.heading")}
        </h2>
        <Button className="min-h-[44px] px-4" onClick={() => setAsking(true)}>
          {t("team.leave.ask")}
        </Button>
      </div>

      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("team.leave.balances")}</h3>
      <dl className="mb-1 grid grid-cols-2 gap-y-2 text-sm">
        {balanceTypes.map((type) => (
          <div key={type.id} className="contents">
            <dt className="text-text">{type.name}</dt>
            <dd className="text-right font-medium text-text">{days(Math.max(0, leave.balances[type.id] ?? 0))}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-4 text-xs text-muted">{t("team.leave.balanceHint")}</p>

      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("team.leave.yourRequests")}</h3>
      {leave.requests.length === 0 ? (
        <p className="text-sm text-muted">{t("team.leave.noRequests")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {leave.requests.map((r) => {
            const canCancel = r.status === "pending" || (r.status === "approved" && r.from_date > leave.today);
            return (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-text">{typeName(r.leave_type_id)}</span>
                  <StatusPill tone={STATUS_TONE[r.status]}>{t(`team.leave.status.${r.status}` as TranslationKey)}</StatusPill>
                </div>
                <span className="text-text">
                  {dateRangeLabel(r.from_date, r.to_date)}
                  {r.leaving_at && ` · ${t("team.leave.halfDayLeaving", { time: r.leaving_at.slice(0, 5) })}`}
                </span>
                {r.status === "approved" && (r.unpaid_minutes ?? 0) > 0 && (
                  <span className="text-xs text-muted">
                    {t("team.leave.paidUnpaid", { paid: days(r.paid_minutes ?? 0), unpaid: days(r.unpaid_minutes ?? 0) })}
                  </span>
                )}
                {r.decision_note && r.status !== "pending" && (
                  <span className="text-xs text-muted">{t("team.leave.managerNote", { note: r.decision_note })}</span>
                )}
                {canCancel && (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void cancel(r)}
                    className="min-h-[44px] self-start text-sm font-semibold text-danger-fg disabled:opacity-50"
                  >
                    {r.status === "pending" ? t("team.leave.cancel") : t("team.leave.cancelLeave")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {asking && <AskLeaveModal leave={leave} onClose={() => setAsking(false)} />}
    </Card>
  );
}

function AskLeaveModal({ leave, onClose }: { leave: MyLeave; onClose: () => void }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const types = leave.types.filter((x) => x.active);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const type = types.find((x) => x.id === typeId) ?? null;
  const firstDay = type?.rules.sameDay ? leave.today : addDays(leave.today, leave.noticeDays);
  const [from, setFrom] = useState(addDays(leave.today, leave.noticeDays));
  const [to, setTo] = useState(addDays(leave.today, leave.noticeDays));
  const [halfDay, setHalfDay] = useState(false);
  const [leavingAt, setLeavingAt] = useState("17:00");
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const half = halfDay && from === to;
  const offs = useMemo(() => new Set(leave.weeklyOffs), [leave.weeklyOffs]);
  const minutes = from && to && to >= from ? leaveMinutes(from, to, half, leave.dayMinutes, offs) : 0;
  const showProof = type ? needsProof(type, from, to, half) : false;
  const split = type ? splitPaid(minutes, leave.balances[type.id] ?? 0, type.paid) : null;
  const days = (m: number) => formatLeaveDays(m, leave.dayMinutes);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!type) return showError(t("team.leave.reason.bad_type"));
    const problem = checkRequest({
      type, from, to, halfDay: half, today: leave.today, noticeDays: leave.noticeDays, hasProof: Boolean(proof), minutes,
    });
    if (problem) return showError(t(`team.leave.reason.${problem}` as TranslationKey, { days: leave.noticeDays }));

    setSaving(true);
    let proofPath: string | null = null;
    if (proof && showProof) {
      proofPath = leaveProofPath(leave.outletId, leave.staffId);
      try {
        const { error } = await uploadLeaveProof(supabase, proofPath, await processPhoto(proof.file));
        if (error) throw new Error(error);
      } catch {
        setSaving(false);
        return showError(t("team.leave.reason.bad_proof"));
      }
    }
    const { data, error } = await supabase.rpc("team_request_leave", {
      p_type: type.id,
      p_from: from,
      p_to: to,
      p_leaving_at: half ? leavingAt : null,
      p_reason: reason.trim() || null,
      p_proof_path: proofPath,
    });
    setSaving(false);
    const reply = data as { ok: boolean; reason?: string; notice_days?: number } | null;
    if (error || !reply?.ok) {
      return showError(
        t(`team.leave.reason.${reply?.reason ?? "bad_request"}` as TranslationKey, { days: reply?.notice_days ?? leave.noticeDays }),
      );
    }
    if (proof) URL.revokeObjectURL(proof.url);
    showSuccess(t("team.leave.sent"));
    onClose();
    router.refresh();
  }

  return (
    <Modal title={t("team.leave.ask")} onClose={onClose} variant="bottom">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label={t("team.leave.type")}
          htmlFor="l-type"
          hint={type?.rules.sameDay ? t("team.leave.sameDayHint") : t("team.leave.noticeHint", { days: leave.noticeDays })}
        >
          <SelectInput id="l-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.paid ? ` (${days(Math.max(0, leave.balances[x.id] ?? 0))})` : ""}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("team.leave.from")} htmlFor="l-from">
            <TextInput
              id="l-from"
              type="date"
              min={firstDay}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (!to || to < e.target.value) setTo(e.target.value);
              }}
            />
          </Field>
          <Field label={t("team.leave.to")} htmlFor="l-to">
            <TextInput id="l-to" type="date" min={from || firstDay} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        {from === to && (
          <div>
            <CheckRow checked={halfDay} onChange={setHalfDay} label={t("team.leave.halfDay")} hint={t("team.leave.halfDayHint")} />
            {halfDay && (
              <Field label={t("team.leave.leavingAt")} htmlFor="l-leaving">
                <TextInput id="l-leaving" type="time" value={leavingAt} onChange={(e) => setLeavingAt(e.target.value)} />
              </Field>
            )}
          </div>
        )}
        <Field label={t("team.leave.reasonLabel")} htmlFor="l-reason">
          <textarea
            id="l-reason"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text"
          />
        </Field>
        {showProof && type && (
          <Field label={t("team.leave.proof")} hint={t("team.leave.proofHint", { days: type.rules.proofAfterDays ?? 0 })}>
            <label className="relative flex min-h-[44px] cursor-pointer items-center gap-2 self-start rounded-2xl px-4 text-sm font-semibold text-accent ring-1 ring-border">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="absolute h-px w-px opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (proof) URL.revokeObjectURL(proof.url);
                  setProof({ file, url: URL.createObjectURL(file) });
                }}
              />
              <Camera className="h-4 w-4" aria-hidden="true" />
              {proof ? proof.file.name : t("team.myDetails.addPhoto")}
            </label>
          </Field>
        )}
        {minutes > 0 && split && (
          <p className="rounded-xl bg-info-bg px-3 py-2 text-sm text-info-fg">
            {t("team.leave.uses", { days: days(minutes) })}{" "}
            {split.unpaid === 0
              ? t("team.leave.allPaid")
              : split.paid === 0
                ? t("team.leave.allUnpaid")
                : t("team.leave.split", { paid: days(split.paid), unpaid: days(split.unpaid) })}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t("team.common.cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving || !type}>
            {t("team.leave.send")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
