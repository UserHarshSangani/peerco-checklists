"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, HandHelping, RefreshCw, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatDateLabel, todayInKolkata } from "@/lib/date";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import type { TeamSettings } from "@/lib/team/settings/registry";
import { clockIST } from "@/lib/team/engines/attendance";
import { coverEligibility, slotMinutes, waves, type Candidate, type EligibilityResult } from "@/lib/team/engines/eligibility";
import type { RosterDay } from "@/lib/team/engines/roster-rules";
import { addDays, formatDuration, isTime, weekDates, weekStartOf, type Segment, type WeekStart } from "@/lib/team/engines/time";
import { kickPush } from "@/lib/team/push-kick";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { Field, SelectInput, TextInput } from "@/components/team/fields";
import { PushToggle } from "@/components/pwa/push-toggle";
import { skillLabel } from "../shifts/minimums-tab";

type Mode = "first_accept" | "manager_pick";
type Request = {
  id: string;
  business_date: string;
  role_skill: string;
  slot_start: string;
  slot_end: string;
  mode: Mode;
  status: "open" | "filled" | "escalated" | "expired" | "cancelled";
  wave: number;
  offer_expires_at: string | null;
  filled_by_staff_id: string | null;
  note: string | null;
  cancel_note: string | null;
};
type Offer = {
  id: string;
  cover_request_id: string;
  staff_id: string;
  wave: number;
  sent_at: string | null;
  response: "accepted" | "declined" | "expired" | null;
  chose_comp_off: boolean;
  selected: boolean;
};
type Person = { id: string; name: string; active: boolean };

export type CoverPrefill = { date?: string; skill?: string; start?: string; end?: string };

type Form = { date: string; skill: string; start: string; end: string; mode: Mode; note: string };
type Preview = { slot: { date: string; skill: string; start: string; end: string }; result: EligibilityResult; waves: string[][] };
type Dialog = { kind: "cancel"; request: Request } | { kind: "assign"; request: Request };

const REQUEST_COLUMNS =
  "id, business_date, role_skill, slot_start, slot_end, mode, status, wave, offer_expires_at, filled_by_staff_id, note, cancel_note";
const OFFER_COLUMNS = "id, cover_request_id, staff_id, wave, sent_at, response, chose_comp_off, selected";
const hhmm = (time: string) => time.slice(0, 5);

const STATUS_TONE: Record<Request["status"], PillTone> = {
  open: "warning",
  filled: "success",
  escalated: "danger",
  expired: "neutral",
  cancelled: "neutral",
};

function offerState(o: Offer): { key: string; tone: PillTone } {
  if (o.selected) return { key: "covering", tone: "success" };
  if (o.response === "accepted") return { key: "saidYes", tone: "info" };
  if (o.response === "declined") return { key: "saidNo", tone: "neutral" };
  if (o.response === "expired") return { key: "noAnswer", tone: "neutral" };
  if (o.sent_at) return { key: "asked", tone: "warning" };
  return { key: "queued", tone: "neutral" };
}

export function CoverBoard({ outletId, prefill }: { outletId: string; prefill: CoverPrefill }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const today = todayInKolkata();

  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [form, setForm] = useState<Form>({
    date: prefill.date && prefill.date >= today ? prefill.date : today,
    skill: prefill.skill ?? "",
    start: prefill.start && isTime(prefill.start) ? prefill.start : "",
    end: prefill.end && isTime(prefill.end) ? prefill.end : "",
    mode: "first_accept",
    note: "",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const load = useCallback(async () => {
    const [staffRes, reqRes] = await Promise.all([
      supabase.from("staff").select("id, name, active").eq("outlet_id", outletId).order("name"),
      supabase
        .from("cover_requests")
        .select(REQUEST_COLUMNS)
        .eq("outlet_id", outletId)
        .gte("business_date", addDays(today, -7))
        .order("business_date", { ascending: false })
        .order("slot_start", { ascending: false })
        .limit(50),
    ]);
    const failed = [staffRes, reqRes].find((r) => r.error);
    if (failed?.error) return showError(t("team.cover.loadError", { error: failed.error.message }));
    const reqs = (reqRes.data ?? []) as Request[];
    let offerRows: Offer[] = [];
    if (reqs.length) {
      const { data, error } = await supabase.from("cover_offers").select(OFFER_COLUMNS).in("cover_request_id", reqs.map((r) => r.id));
      if (error) return showError(t("team.cover.loadError", { error: error.message }));
      offerRows = (data ?? []) as Offer[];
    }
    setPeople((staffRes.data ?? []) as Person[]);
    setRequests(reqs);
    setOffers(offerRows);
  }, [supabase, outletId, today, showError, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the outlet's cover requests
    void load();
    getTeamSettings(supabase, outletId)
      .then((s) => {
        setSettings(s);
        setForm((f) => ({ ...f, mode: s["cover.award_mode"] as Mode, skill: f.skill || s["team.skills"][0] || "" }));
      })
      .catch((e: Error) => showError(t("team.cover.loadError", { error: e.message })));
  }, [load, supabase, outletId, showError, t]);

  // Offers move on by themselves (every minute in the database); keep up while something is open.
  const anyOpen = (requests ?? []).some((r) => r.status === "open");
  useEffect(() => {
    if (!anyOpen) return;
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [anyOpen, load]);

  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setPreview(null);
  };

  async function findPeople(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    if (!form.skill || !isTime(form.start) || !isTime(form.end) || form.end <= form.start || form.date < today) {
      return showError(t("team.cover.reason.bad_slot"));
    }
    setBusy("preview");
    const date = form.date;
    const weekStart = weekStartOf(date, settings["hours.week_start"] as WeekStart);
    const days = weekDates(weekStart);
    const monthStart = `${date.slice(0, 7)}-01`;
    const monthEnd = addDays(addDays(monthStart, 32).slice(0, 7) + "-01", -1);
    const [profilesRes, skillsRes, rosterRes, templatesRes, leaveRes, availRes, otRes] = await Promise.all([
      supabase.from("staff_profiles").select("staff_id, gender, late_shift_consent, employment_status").eq("outlet_id", outletId),
      supabase.from("staff_skills").select("staff_id, skill").eq("outlet_id", outletId),
      supabase
        .from("roster_entries")
        .select("staff_id, business_date, kind, segments, extended_until, shift_template_id")
        .eq("outlet_id", outletId)
        .gte("business_date", days[0])
        .lte("business_date", days[6]),
      supabase.from("shift_templates").select("id, break_minutes, paid_break").eq("outlet_id", outletId),
      supabase
        .from("leave_requests")
        .select("staff_id")
        .eq("outlet_id", outletId)
        .eq("status", "approved")
        .lte("from_date", date)
        .gte("to_date", date),
      supabase.from("staff_availability").select("staff_id").eq("outlet_id", outletId).eq("business_date", date).eq("available", false),
      supabase
        .from("overtime_entries")
        .select("staff_id, planned_minutes, actual_minutes, status")
        .eq("outlet_id", outletId)
        .neq("status", "cancelled")
        .gte("business_date", monthStart)
        .lte("business_date", monthEnd),
    ]);
    setBusy(null);
    const failed = [profilesRes, skillsRes, rosterRes, templatesRes, leaveRes, availRes, otRes].find((r) => r.error);
    if (failed?.error) return showError(t("team.cover.loadError", { error: failed.error.message }));

    const breaks = new Map(
      (templatesRes.data ?? []).map((tpl) => [tpl.id as string, tpl.paid_break ? 0 : (tpl.break_minutes as number)]),
    );
    const weekByStaff = new Map<string, RosterDay[]>();
    for (const r of rosterRes.data ?? []) {
      const list = weekByStaff.get(r.staff_id) ?? [];
      list.push({
        date: r.business_date,
        kind: r.kind,
        segments: r.segments as Segment[],
        extendedUntil: r.extended_until ? hhmm(r.extended_until) : null,
        unpaidBreakMinutes: r.shift_template_id ? breaks.get(r.shift_template_id) ?? 0 : 0,
      });
      weekByStaff.set(r.staff_id, list);
    }
    const skills = new Map<string, string[]>();
    for (const s of skillsRes.data ?? []) skills.set(s.staff_id, [...(skills.get(s.staff_id) ?? []), s.skill]);
    const onLeave = new Set((leaveRes.data ?? []).map((l) => l.staff_id as string));
    const unavailable = new Set((availRes.data ?? []).map((a) => a.staff_id as string));
    const ot = new Map<string, number>();
    for (const o of otRes.data ?? []) {
      const minutes = (o.status === "worked" ? o.actual_minutes : o.planned_minutes) ?? 0;
      ot.set(o.staff_id, (ot.get(o.staff_id) ?? 0) + minutes);
    }
    const profiles = new Map((profilesRes.data ?? []).map((p) => [p.staff_id as string, p]));

    const candidates: Candidate[] = people
      .filter((p) => p.active && ["active", "on_notice", undefined].includes(profiles.get(p.id)?.employment_status))
      .map((p) => ({
        staffId: p.id,
        name: p.name,
        gender: (profiles.get(p.id)?.gender ?? null) as Candidate["gender"],
        lateShiftConsent: Boolean(profiles.get(p.id)?.late_shift_consent),
        skills: skills.get(p.id) ?? [],
        week: weekByStaff.get(p.id) ?? [],
        onLeave: onLeave.has(p.id),
        unavailable: unavailable.has(p.id),
        otMinutesThisMonth: ot.get(p.id) ?? 0,
      }));
    const slot = { date, skill: form.skill, start: form.start, end: form.end };
    const result = coverEligibility(slot, candidates, {
      maxDailyMinutes: settings["hours.max_daily_minutes"],
      maxWeeklyMinutes: settings["hours.max_weekly_minutes"],
      minRestMinutes: settings["hours.min_rest_minutes"],
      womenLateCutoff: settings["hours.women_late_cutoff"],
    });
    setPreview({ slot, result, waves: waves(result.eligible.map((e) => e.staffId), settings["cover.offer_batch_size"]) });
  }

  async function send() {
    if (!preview) return;
    setBusy("send");
    const { data, error } = await supabase.rpc("team_create_cover", {
      p_outlet: outletId,
      p_date: preview.slot.date,
      p_skill: preview.slot.skill,
      p_start: preview.slot.start,
      p_end: preview.slot.end,
      p_candidates: preview.result.eligible.map((e) => e.staffId),
      p_mode: form.mode,
      p_note: form.note.trim() || null,
    });
    setBusy(null);
    const reply = data as { ok: boolean; reason?: string; offers?: number; state?: string } | null;
    if (error || !reply?.ok) return showError(t(`team.cover.reason.${reply?.reason ?? "bad_request"}` as TranslationKey));
    kickPush();
    showSuccess(reply.state === "escalated" ? t("team.cover.sentNobody") : t("team.cover.sent", { count: reply.offers ?? 0 }));
    setPreview(null);
    setForm((f) => ({ ...f, note: "" }));
    load();
  }

  async function award(request: Request, staffId: string) {
    setBusy(`award:${request.id}:${staffId}`);
    const { data, error } = await supabase.rpc("team_award_cover", { p_request: request.id, p_staff: staffId });
    setBusy(null);
    const reply = data as { ok: boolean; reason?: string } | null;
    if (error || !reply?.ok) return showError(t(`team.cover.reason.${reply?.reason ?? "bad_request"}` as TranslationKey));
    kickPush();
    showSuccess(t("team.cover.awarded", { name: nameOf(staffId) }));
    setDialog(null);
    load();
  }

  async function cancel(request: Request, note: string) {
    setBusy(`cancel:${request.id}`);
    const { data, error } = await supabase.rpc("team_cancel_cover", { p_request: request.id, p_note: note.trim() || null });
    setBusy(null);
    const reply = data as { ok: boolean; reason?: string } | null;
    if (error || !reply?.ok) return showError(t(`team.cover.reason.${reply?.reason ?? "bad_request"}` as TranslationKey));
    kickPush();
    showSuccess(t("team.cover.cancelled"));
    setDialog(null);
    load();
  }

  if (!settings || !requests) {
    return (
      <main className="flex-1 p-4 sm:p-6">
        <SkeletonList />
      </main>
    );
  }

  const skillsList = settings["team.skills"];
  const active = requests.filter((r) => r.status === "open" || r.status === "escalated" || (r.status === "filled" && r.business_date >= today));
  const past = requests.filter((r) => !active.includes(r));
  const minutes = isTime(form.start) && isTime(form.end) ? slotMinutes(form.start, form.end) : 0;

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.cover.heading")}</h2>
          <p className="text-sm text-muted">{t("team.cover.intro")}</p>
        </div>
        <PushToggle />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <HandHelping className="h-4 w-4" aria-hidden="true" />
            {t("team.cover.ask")}
          </h3>
          <form className="flex flex-col gap-3" onSubmit={findPeople}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("team.cover.date")} htmlFor="cover-date">
                <TextInput id="cover-date" type="date" min={today} value={form.date} onChange={(e) => set("date", e.target.value)} required />
              </Field>
              <Field label={t("team.cover.skill")} htmlFor="cover-skill">
                <SelectInput id="cover-skill" value={form.skill} onChange={(e) => set("skill", e.target.value)} required>
                  {skillsList.map((s) => (
                    <option key={s} value={s}>
                      {skillLabel(s)}
                    </option>
                  ))}
                  {form.skill && !skillsList.includes(form.skill) && <option value={form.skill}>{skillLabel(form.skill)}</option>}
                </SelectInput>
              </Field>
              <Field label={t("team.cover.from")} htmlFor="cover-start">
                <TextInput id="cover-start" type="time" step={900} value={form.start} onChange={(e) => set("start", e.target.value)} required />
              </Field>
              <Field label={t("team.cover.to")} htmlFor="cover-end" hint={minutes > 0 ? formatDuration(minutes) : undefined}>
                <TextInput id="cover-end" type="time" step={900} value={form.end} onChange={(e) => set("end", e.target.value)} required />
              </Field>
            </div>
            <Field label={t("team.cover.mode")} htmlFor="cover-mode">
              <SelectInput id="cover-mode" value={form.mode} onChange={(e) => set("mode", e.target.value as Mode)}>
                <option value="first_accept">{t("team.option.first_accept")}</option>
                <option value="manager_pick">{t("team.option.manager_pick")}</option>
              </SelectInput>
            </Field>
            <Field label={t("team.cover.note")} htmlFor="cover-note" hint={t("team.cover.noteHint")}>
              <TextInput id="cover-note" maxLength={300} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </Field>
            <Button type="submit" variant="secondary" loading={busy === "preview"}>
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("team.cover.findPeople")}
            </Button>
          </form>

          {preview && (
            <div className="mt-4 border-t border-border pt-4">
              {preview.waves.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-text">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                  {t("team.cover.nobodyEligible")}
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {preview.waves.map((wave, i) => (
                    <li key={i}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {i === 0
                          ? t("team.cover.wave1")
                          : t("team.cover.waveN", { n: i + 1, minutes: i * settings["cover.offer_expiry_minutes"] })}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {wave.map((id) => {
                          const e = preview.result.eligible.find((x) => x.staffId === id)!;
                          return (
                            <li key={id} className="rounded-full bg-border/40 px-3 py-1 text-sm text-text">
                              {e.name}
                              <span className="text-muted"> · {t("team.cover.otSoFar", { hours: formatDuration(e.otMinutesThisMonth) })}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
              {preview.result.excluded.filter((x) => x.reason !== "no_skill").length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-muted">
                    {t("team.cover.notAsked", { count: preview.result.excluded.filter((x) => x.reason !== "no_skill").length })}
                  </summary>
                  <ul className="flex flex-col gap-1">
                    {preview.result.excluded
                      .filter((x) => x.reason !== "no_skill")
                      .map((x) => (
                        <li key={x.staffId} className="text-text">
                          <span className="font-medium">{x.name}</span>
                          <span className="text-muted"> — {t(`team.cover.excluded.${x.reason}` as TranslationKey)}</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
              <Button className="mt-4 w-full" loading={busy === "send"} onClick={send}>
                {preview.waves.length ? t("team.cover.send", { count: preview.waves[0].length }) : t("team.cover.sendAnyway")}
              </Button>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("team.cover.requests")}</h3>
            <button type="button" className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent" onClick={load}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("team.cover.refresh")}
            </button>
          </div>
          {active.length === 0 && past.length === 0 ? (
            <EmptyState title={t("team.cover.emptyTitle")} description={t("team.cover.emptyBody")} />
          ) : (
            [...active, ...past].map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                offers={offers.filter((o) => o.cover_request_id === r.id)}
                nameOf={nameOf}
                busy={busy}
                onAward={(staffId) => award(r, staffId)}
                onAssign={() => setDialog({ kind: "assign", request: r })}
                onCancel={() => setDialog({ kind: "cancel", request: r })}
              />
            ))
          )}
        </div>
      </div>

      {dialog?.kind === "cancel" && (
        <CancelDialog
          request={dialog.request}
          busy={busy === `cancel:${dialog.request.id}`}
          onClose={() => setDialog(null)}
          onConfirm={(note) => cancel(dialog.request, note)}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog
          request={dialog.request}
          people={people.filter((p) => p.active)}
          busy={Boolean(busy?.startsWith(`award:${dialog.request.id}`))}
          onClose={() => setDialog(null)}
          onConfirm={(staffId) => award(dialog.request, staffId)}
        />
      )}
    </main>
  );
}

function RequestCard({
  request: r,
  offers,
  nameOf,
  busy,
  onAward,
  onAssign,
  onCancel,
}: {
  request: Request;
  offers: Offer[];
  nameOf: (id: string | null) => string;
  busy: string | null;
  onAward: (staffId: string) => void;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const live = r.status === "open" || r.status === "escalated";
  const accepted = offers.filter((o) => o.response === "accepted" && !o.selected);
  const statusText =
    r.status === "filled"
      ? t("team.cover.status.filled", { name: nameOf(r.filled_by_staff_id) })
      : r.status === "open"
        ? r.mode === "manager_pick" && accepted.length
          ? t("team.cover.status.pick")
          : t("team.cover.status.open", { wave: r.wave })
        : t(`team.cover.status.${r.status}` as TranslationKey);
  const sorted = [...offers].sort((a, b) => a.wave - b.wave || nameOf(a.staff_id).localeCompare(nameOf(b.staff_id)));

  return (
    <Card className={live ? "" : "opacity-80"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-text">
            {formatDateLabel(r.business_date)} · {hhmm(r.slot_start)}–{hhmm(r.slot_end)}
          </p>
          <p className="text-sm text-muted">
            {skillLabel(r.role_skill)} · {r.mode === "manager_pick" ? t("team.option.manager_pick") : t("team.option.first_accept")}
          </p>
        </div>
        <StatusPill
          tone={r.mode === "manager_pick" && accepted.length && r.status === "open" ? "info" : STATUS_TONE[r.status]}
          icon={r.status === "filled" ? <CheckCircle2 className="h-3.5 w-3.5" /> : r.status === "escalated" ? <AlertTriangle className="h-3.5 w-3.5" /> : undefined}
        >
          {statusText}
        </StatusPill>
      </div>
      {r.note && <p className="mt-1 text-sm text-muted">“{r.note}”</p>}
      {r.status === "open" && r.offer_expires_at && (
        <p className="mt-1 text-xs text-muted">{t("team.cover.nextWaveAt", { time: clockIST(r.offer_expires_at) })}</p>
      )}
      {r.status === "escalated" && <p className="mt-2 text-sm text-danger-fg">{t("team.cover.escalatedHelp")}</p>}
      {r.cancel_note && <p className="mt-1 text-sm text-muted">{t("team.cover.cancelNote", { note: r.cancel_note })}</p>}

      {sorted.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
          {sorted.map((o) => {
            const s = offerState(o);
            return (
              <li key={o.id} className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="text-text">
                  {nameOf(o.staff_id)}
                  {o.response === "accepted" && o.chose_comp_off && <span className="text-muted"> · {t("team.cover.compOff")}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={s.tone}>{t(`team.cover.offer.${s.key}` as TranslationKey, { wave: o.wave })}</StatusPill>
                  {live && o.response === "accepted" && !o.selected && (
                    <Button
                      className="min-h-[40px] px-3 text-sm"
                      loading={busy === `award:${r.id}:${o.staff_id}`}
                      disabled={Boolean(busy)}
                      onClick={() => onAward(o.staff_id)}
                    >
                      {t("team.cover.giveTo")}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {(live || (r.status === "filled" && r.business_date >= todayInKolkata())) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {live && (
            <Button variant="secondary" className="min-h-[44px] px-4 text-sm" onClick={onAssign}>
              {t("team.cover.assign")}
            </Button>
          )}
          <Button variant="ghost" className="min-h-[44px] px-4 text-sm" onClick={onCancel}>
            {t("team.cover.cancel")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CancelDialog({ request, busy, onClose, onConfirm }: { request: Request; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const needsNote = request.status === "filled";
  return (
    <Modal title={t("team.cover.cancelTitle")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note);
        }}
      >
        <p className="text-sm text-text">
          {needsNote ? t("team.cover.cancelFilled") : t("team.cover.cancelOpen")}
        </p>
        <Field label={needsNote ? t("team.cover.reasonRequired") : t("team.cover.reasonOptional")} htmlFor="cover-cancel-note">
          <TextInput id="cover-cancel-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} required={needsNote} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("team.cover.keep")}
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            {t("team.cover.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignDialog({
  request,
  people,
  busy,
  onClose,
  onConfirm,
}: {
  request: Request;
  people: Person[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (staffId: string) => void;
}) {
  const { t } = useLanguage();
  const [staffId, setStaffId] = useState("");
  return (
    <Modal title={t("team.cover.assignTitle")} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (staffId) onConfirm(staffId);
        }}
      >
        <p className="text-sm text-text">
          {t("team.cover.assignHelp", {
            date: formatDateLabel(request.business_date),
            start: hhmm(request.slot_start),
            end: hhmm(request.slot_end),
          })}
        </p>
        <Field label={t("team.cover.person")} htmlFor="cover-assign">
          <SelectInput id="cover-assign" value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
            <option value="">{t("team.cover.choosePerson")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("team.cover.keep")}
          </Button>
          <Button type="submit" loading={busy} disabled={!staffId}>
            {t("team.cover.giveTo")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
