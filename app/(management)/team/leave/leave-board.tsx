"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, FileImage } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { todayInKolkata } from "@/lib/date";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import type { CoverageShift, StaffingMinimum } from "@/lib/team/engines/coverage";
import {
  balances as sumBalances,
  datesBetween,
  formatLeaveDays,
  leaveImpact,
  parseRules,
  rulesToJson,
  splitPaid,
  type DayImpact,
  type LeaveType,
} from "@/lib/team/engines/leave";
import { addDays, type Segment } from "@/lib/team/engines/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { CheckRow, Field, SelectInput, TextInput } from "@/components/team/fields";
import { dateRangeLabel } from "@/app/me/my-leave";

type Request = {
  id: string;
  staff_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  leaving_at: string | null;
  reason: string | null;
  proof_path: string | null;
  status: "pending" | "approved";
  requested_minutes: number | null;
  paid_minutes: number | null;
  unpaid_minutes: number | null;
};
type Person = { id: string; name: string };
type TypeRow = LeaveType & { accrualRaw: unknown };
type RosterRow = {
  staff_id: string;
  business_date: string;
  kind: "work" | "weekly_off";
  segments: Segment[];
  extended_until: string | null;
  role_skill: string | null;
};

type Data = {
  people: Person[];
  types: TypeRow[];
  requests: Request[];
  balances: Map<string, Map<string, number>>;
  roster: RosterRow[];
  minimums: StaffingMinimum[];
  dayMinutes: number;
  proofs: Record<string, string>;
};

type Dialog =
  | { kind: "reject"; request: Request }
  | { kind: "cancel"; request: Request }
  | { kind: "adjust"; person: Person };

const REQUEST_COLUMNS =
  "id, staff_id, leave_type_id, from_date, to_date, leaving_at, reason, proof_path, status, requested_minutes, paid_minutes, unpaid_minutes";

export function LeaveBoard({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const today = todayInKolkata();
  const [data, setData] = useState<Data | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const horizon = addDays(today, 60);
    const [staffRes, typesRes, requestsRes, ledgerRes, minimumsRes] = await Promise.all([
      supabase.from("staff").select("id, name").eq("outlet_id", outletId).eq("active", true).order("name"),
      supabase.from("leave_types").select("id, code, name, paid, needs_proof, active, accrual").eq("outlet_id", outletId).order("name"),
      supabase
        .from("leave_requests")
        .select(REQUEST_COLUMNS)
        .eq("outlet_id", outletId)
        .or(`status.eq.pending,and(status.eq.approved,to_date.gte.${today},from_date.lte.${horizon})`)
        .order("from_date"),
      supabase.from("leave_ledger").select("staff_id, leave_type_id, delta_minutes").eq("outlet_id", outletId),
      supabase.from("staffing_minimums").select("role_skill, weekday, slot_start, slot_end, min_count").eq("outlet_id", outletId),
    ]);
    const failed = [staffRes, typesRes, requestsRes, ledgerRes, minimumsRes].find((r) => r.error);
    if (failed?.error) return showError(t("team.leave.loadError", { error: failed.error.message }));

    const requests = (requestsRes.data ?? []) as Request[];
    const pending = requests.filter((r) => r.status === "pending");
    let roster: RosterRow[] = [];
    if (pending.length) {
      const from = pending.reduce((m, r) => (r.from_date < m ? r.from_date : m), pending[0].from_date);
      const to = pending.reduce((m, r) => (r.to_date > m ? r.to_date : m), pending[0].to_date);
      const rosterRes = await supabase
        .from("roster_entries")
        .select("staff_id, business_date, kind, segments, extended_until, role_skill")
        .eq("outlet_id", outletId)
        .gte("business_date", from)
        .lte("business_date", to < addDays(from, 62) ? to : addDays(from, 62));
      if (rosterRes.error) return showError(t("team.leave.loadError", { error: rosterRes.error.message }));
      roster = (rosterRes.data ?? []) as RosterRow[];
    }

    const proofPaths = pending.map((r) => r.proof_path).filter((p): p is string => Boolean(p));
    const proofs: Record<string, string> = {};
    if (proofPaths.length) {
      const { data: signed } = await supabase.storage.from("staff-documents").createSignedUrls(proofPaths, 3600);
      for (const d of signed ?? []) if (d.path && d.signedUrl) proofs[d.path] = d.signedUrl;
    }

    let dayMinutes = 480;
    try {
      dayMinutes = (await getTeamSettings(supabase, outletId))["hours.standard_shift_minutes"];
    } catch {
      // Defaults are fine for display if settings can't be read.
    }

    setData({
      people: (staffRes.data ?? []) as Person[],
      types: (typesRes.data ?? []).map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        paid: row.paid,
        needsProof: row.needs_proof,
        active: row.active,
        rules: parseRules(row.accrual),
        accrualRaw: row.accrual,
      })),
      requests,
      balances: sumBalances((ledgerRes.data ?? []) as { staff_id: string; leave_type_id: string; delta_minutes: number }[]),
      roster,
      minimums: (minimumsRes.data ?? []).map((m) => ({
        skill: m.role_skill as string,
        weekday: m.weekday as number | null,
        slotStart: (m.slot_start as string).slice(0, 5),
        slotEnd: (m.slot_end as string).slice(0, 5),
        minCount: m.min_count as number,
      })),
      dayMinutes,
      proofs,
    });
  }, [supabase, outletId, today, showError, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the outlet's leave
    void load();
  }, [load]);

  if (!data) {
    return (
      <main className="flex-1 p-4 sm:p-6">
        <h2 className="mb-4 font-serif text-xl font-bold text-text">{t("team.leave.heading")}</h2>
        <SkeletonList />
      </main>
    );
  }

  const nameOf = (id: string) => data.people.find((p) => p.id === id)?.name ?? "";
  const typeOf = (id: string) => data.types.find((x) => x.id === id);
  const days = (m: number) => formatLeaveDays(m, data.dayMinutes);
  const pending = data.requests.filter((r) => r.status === "pending");
  const upcoming = data.requests.filter((r) => r.status === "approved");
  const balanceTypes = data.types.filter((x) => x.paid);

  async function rpc(fn: string, args: Record<string, unknown>, success: TranslationKey) {
    setBusy(String(args.p_request ?? args.p_staff ?? fn));
    const { data: reply, error } = await supabase.rpc(fn, args);
    setBusy(null);
    const result = reply as { ok: boolean; reason?: string } | null;
    if (error || !result?.ok) {
      showError(result?.reason ? t(`team.leave.reason.${result.reason}` as TranslationKey) : t("team.common.saveError", { error: error?.message ?? "" }));
      return false;
    }
    showSuccess(t(success));
    setDialog(null);
    void load();
    return true;
  }

  function impactFor(request: Request): DayImpact[] {
    const dates = datesBetween(request.from_date, request.to_date);
    const awayFull = new Set(
      upcoming
        .filter((r) => !r.leaving_at)
        .flatMap((r) => datesBetween(r.from_date, r.to_date).map((d) => `${r.staff_id}|${d}`)),
    );
    const shiftsByDate = new Map<string, CoverageShift[]>();
    for (const e of data!.roster) {
      if (e.kind !== "work" || awayFull.has(`${e.staff_id}|${e.business_date}`)) continue;
      const list = shiftsByDate.get(e.business_date) ?? [];
      list.push({
        staffId: e.staff_id,
        skill: e.role_skill,
        segments: e.segments,
        extendedUntil: e.extended_until ? e.extended_until.slice(0, 5) : null,
      });
      shiftsByDate.set(e.business_date, list);
    }
    return leaveImpact({
      staffId: request.staff_id,
      dates,
      shiftsByDate,
      minimums: data!.minimums,
      leavingAt: request.leaving_at ? request.leaving_at.slice(0, 5) : null,
    });
  }

  function isRostered(request: Request) {
    return data!.roster.some(
      (e) => e.staff_id === request.staff_id && e.business_date >= request.from_date && e.business_date <= request.to_date,
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-4 font-serif text-xl font-bold text-text">{t("team.leave.heading")}</h2>

      <section className="mb-6 max-w-3xl">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.leave.waiting")}</h3>
        {pending.length === 0 ? (
          <EmptyState title={t("team.leave.noneWaiting")} />
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((r) => {
              const type = typeOf(r.leave_type_id);
              const balance = data.balances.get(r.staff_id)?.get(r.leave_type_id) ?? 0;
              const minutes = r.requested_minutes ?? 0;
              const split = splitPaid(minutes, balance, type?.paid ?? false);
              const impact = impactFor(r);
              const rostered = isRostered(r);
              return (
                <Card key={r.id}>
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-text">{nameOf(r.staff_id)}</p>
                      <p className="text-sm text-text">
                        {type?.name} · {dateRangeLabel(r.from_date, r.to_date)}
                        {r.leaving_at && ` · ${t("team.leave.halfDayLeaving", { time: r.leaving_at.slice(0, 5) })}`}
                      </p>
                      {r.reason && <p className="text-sm text-muted">“{r.reason}”</p>}
                    </div>
                    {r.proof_path && data.proofs[r.proof_path] && (
                      <a
                        href={data.proofs[r.proof_path]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent"
                      >
                        <FileImage className="h-4 w-4" aria-hidden="true" />
                        {t("team.leave.viewProof")}
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-text">
                    {t("team.leave.uses", { days: days(minutes) })}{" "}
                    {type?.paid && t("team.leave.balanceLine", { type: type.name, days: days(Math.max(0, balance)) })}
                  </p>
                  {split.unpaid > 0 && (
                    <p className="text-sm text-warning-fg">
                      {t("team.leave.paidUnpaid", { paid: days(split.paid), unpaid: days(split.unpaid) })}
                    </p>
                  )}
                  <div className="mt-3 rounded-xl border border-border p-3 text-sm">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("team.leave.impact")}</p>
                    {!rostered ? (
                      <p className="text-muted">{t("team.leave.notRostered")}</p>
                    ) : impact.length === 0 ? (
                      <p className="flex items-center gap-2 text-success-fg">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t("team.leave.noImpact")}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {impact.map((day) => (
                          <li key={day.date} className="flex items-start gap-2 text-danger-fg">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>
                              {dateRangeLabel(day.date, day.date)}:{" "}
                              {day.newGaps
                                .map((g) => t("team.leave.gap", { skill: g.skill, short: g.short, start: g.start, end: g.end }))
                                .join("; ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <Button variant="secondary" className="flex-1" disabled={busy === r.id} onClick={() => setDialog({ kind: "reject", request: r })}>
                      {t("team.leave.reject")}
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={busy === r.id}
                      onClick={() =>
                        void rpc(
                          "team_decide_leave",
                          { p_request: r.id, p_approve: true, p_note: null, p_impact: impact.map((d) => ({ date: d.date, gaps: d.newGaps, added: d.addedShortfall })) },
                          "team.leave.approved",
                        )
                      }
                    >
                      {t("team.leave.approve")}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-6 max-w-3xl">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.leave.comingUp")}</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{t("team.leave.noneComingUp")}</p>
        ) : (
          <Card>
            <ul className="flex flex-col divide-y divide-border text-sm">
              {upcoming.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-text">
                    <span className="font-medium">{nameOf(r.staff_id)}</span> · {typeOf(r.leave_type_id)?.name} ·{" "}
                    {dateRangeLabel(r.from_date, r.to_date)}
                    {r.leaving_at && ` · ${t("team.leave.halfDayLeaving", { time: r.leaving_at.slice(0, 5) })}`}
                    {(r.unpaid_minutes ?? 0) > 0 && (
                      <span className="text-muted">
                        {" "}
                        · {t("team.leave.paidUnpaid", { paid: days(r.paid_minutes ?? 0), unpaid: days(r.unpaid_minutes ?? 0) })}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="min-h-[44px] text-sm font-medium text-danger-fg"
                    onClick={() => setDialog({ kind: "cancel", request: r })}
                  >
                    {t("team.leave.cancelLeave")}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="mb-6 max-w-3xl">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.leave.balancesHeading")}</h3>
        <p className="mb-2 text-sm text-muted">{t("team.leave.balancesHint")}</p>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-semibold">{t("team.leave.person")}</th>
                {balanceTypes.map((x) => (
                  <th key={x.id} className="px-2 py-2 text-right font-semibold">
                    {x.code === "comp_off" ? x.name : x.code.toUpperCase()}
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-text">{p.name}</td>
                  {balanceTypes.map((x) => (
                    <td key={x.id} className="px-2 py-2 text-right tabular-nums text-text">
                      {days(data.balances.get(p.id)?.get(x.id) ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-1 text-right">
                    <button
                      type="button"
                      className="min-h-[44px] text-sm font-medium text-accent"
                      onClick={() => setDialog({ kind: "adjust", person: p })}
                    >
                      {t("team.leave.adjust")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <LeaveTypesEditor types={data.types} onSaved={load} />

      {dialog?.kind === "reject" && (
        <NoteModal
          title={t("team.leave.reject")}
          label={t("team.leave.rejectReason")}
          confirm={t("team.leave.reject")}
          onClose={() => setDialog(null)}
          onSubmit={(note) =>
            rpc("team_decide_leave", { p_request: dialog.request.id, p_approve: false, p_note: note, p_impact: null }, "team.leave.rejected")
          }
        />
      )}
      {dialog?.kind === "cancel" && (
        <NoteModal
          title={t("team.leave.cancelLeave")}
          label={t("team.leave.cancelReason")}
          confirm={t("team.leave.cancelLeave")}
          onClose={() => setDialog(null)}
          onSubmit={(note) => rpc("team_cancel_leave", { p_request: dialog.request.id, p_note: note }, "team.leave.cancelled")}
        />
      )}
      {dialog?.kind === "adjust" && (
        <AdjustModal
          person={dialog.person}
          types={balanceTypes}
          dayMinutes={data.dayMinutes}
          onClose={() => setDialog(null)}
          onSubmit={(typeId, minutes, note) =>
            rpc("team_adjust_leave", { p_staff: dialog.person.id, p_type: typeId, p_delta_minutes: minutes, p_note: note }, "team.common.saved")
          }
        />
      )}
    </main>
  );
}

function NoteModal({
  title,
  label,
  confirm,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (note: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return showError(t("team.leave.reason.note_required"));
    setSaving(true);
    await onSubmit(note.trim());
    setSaving(false);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={label} htmlFor="leave-note">
          <textarea
            id="leave-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text"
          />
        </Field>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t("team.common.cancel")}
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={saving}>
            {confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({
  person,
  types,
  dayMinutes,
  onClose,
  onSubmit,
}: {
  person: Person;
  types: TypeRow[];
  dayMinutes: number;
  onClose: () => void;
  onSubmit: (typeId: string, minutes: number, note: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [daysText, setDaysText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(daysText.replace(",", "."));
    // Half-day steps, so balances stay readable.
    if (!daysText.trim() || !Number.isFinite(value) || value === 0 || Math.round(value * 2) !== value * 2) {
      return showError(t("team.leave.reason.bad_amount"));
    }
    if (!note.trim()) return showError(t("team.leave.reason.note_required"));
    setSaving(true);
    await onSubmit(typeId, Math.round(value * dayMinutes), note.trim());
    setSaving(false);
  }

  return (
    <Modal title={t("team.leave.adjustTitle", { name: person.name })} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={t("team.leave.type")} htmlFor="adj-type">
          <SelectInput id="adj-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label={t("team.leave.adjustDays")} htmlFor="adj-days">
          <TextInput id="adj-days" inputMode="decimal" value={daysText} onChange={(e) => setDaysText(e.target.value)} placeholder="2.5" />
        </Field>
        <Field label={t("team.leave.adjustReason")} htmlFor="adj-note">
          <TextInput
            id="adj-note"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("team.leave.adjustReasonPlaceholder")}
          />
        </Field>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            {t("team.common.cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {t("team.common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function LeaveTypesEditor({ types, onSaved }: { types: TypeRow[]; onSaved: () => void }) {
  const { t } = useLanguage();
  return (
    <section className="mb-6 max-w-3xl">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("team.leave.typesHeading")}</h3>
        <StatusPill tone="warning">{t("team.settings.verifyBadge")}</StatusPill>
      </div>
      <p className="mb-2 text-sm text-muted">{t("team.leave.typesHint")}</p>
      <div className="flex flex-col gap-3">
        {types.map((type) => (
          <LeaveTypeRow key={type.id} type={type} onSaved={onSaved} />
        ))}
      </div>
    </section>
  );
}

function LeaveTypeRow({ type, onSaved }: { type: TypeRow; onSaved: () => void }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [perYear, setPerYear] = useState(String(type.rules.perYearDays));
  const [carry, setCarry] = useState(type.rules.carryForwardMaxDays === null ? "" : String(type.rules.carryForwardMaxDays));
  const [proofAfter, setProofAfter] = useState(type.rules.proofAfterDays === null ? "" : String(type.rules.proofAfterDays));
  const [active, setActive] = useState(type.active);
  const [saving, setSaving] = useState(false);
  const accrues = type.paid && type.code !== "comp_off";

  async function save(event: FormEvent) {
    event.preventDefault();
    const whole = (raw: string, max: number) => {
      const n = Number(raw);
      return raw.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
    };
    const perYearDays = accrues ? whole(perYear, 60) : 0;
    const carryDays = carry.trim() === "" ? null : whole(carry, 365);
    const proofDays = type.needsProof ? whole(proofAfter || "0", 30) : null;
    if (perYearDays === null || (carry.trim() !== "" && carryDays === null) || (type.needsProof && proofDays === null)) {
      return showError(t("team.leave.reason.bad_amount"));
    }
    setSaving(true);
    const { error } = await supabase
      .from("leave_types")
      .update({
        active,
        accrual: rulesToJson(
          { ...type.rules, perYearDays, carryForwardMaxDays: type.paid ? carryDays : type.rules.carryForwardMaxDays, proofAfterDays: proofDays },
          type.accrualRaw,
        ),
      })
      .eq("id", type.id);
    setSaving(false);
    if (error) return showError(t("team.common.saveError", { error: error.message }));
    showSuccess(t("team.common.saved"));
    onSaved();
  }

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-text">{type.name}</p>
          {!type.paid && <span className="text-xs text-muted">{t("team.leave.unpaidType")}</span>}
        </div>
        {type.paid && (
          <div className="grid gap-3 sm:grid-cols-3">
            {accrues && (
              <Field label={t("team.leave.perYear")} htmlFor={`py-${type.id}`}>
                <TextInput id={`py-${type.id}`} inputMode="numeric" value={perYear} onChange={(e) => setPerYear(e.target.value)} />
              </Field>
            )}
            <Field label={t("team.leave.carry")} hint={t("team.leave.carryAll")} htmlFor={`cf-${type.id}`}>
              <TextInput id={`cf-${type.id}`} inputMode="numeric" value={carry} onChange={(e) => setCarry(e.target.value)} />
            </Field>
            {type.needsProof && (
              <Field label={t("team.leave.proofAfter")} htmlFor={`pa-${type.id}`}>
                <TextInput id={`pa-${type.id}`} inputMode="numeric" value={proofAfter} onChange={(e) => setProofAfter(e.target.value)} />
              </Field>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <CheckRow checked={active} onChange={setActive} label={t("team.leave.active")} />
          <Button type="submit" variant="secondary" className="min-h-[44px] px-4" disabled={saving}>
            {t("team.common.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
