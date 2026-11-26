"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Camera, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { addDaysToDateString, formatDateLabel, todayInKolkata } from "@/lib/date";
import { clockIST, istToIso, type AttendanceEvent } from "@/lib/team/engines/attendance";
import { formatDuration, formatSegments, type Segment } from "@/lib/team/engines/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { Field, SelectInput, TextInput } from "@/components/team/fields";

type Event = AttendanceEvent & { staff_id: string; business_date: string; photo_path: string | null; note: string | null };
type Person = { id: string; name: string };
type Roster = { staff_id: string; kind: "work" | "weekly_off"; segments: Segment[]; extended_until: string | null };
type DayRow = { staff_id: string; status: string; late_minutes: number; payable_minutes: number };
type Alert = { id: string; kind: string; payload: Record<string, string | number>; created_at: string };

type Fix =
  | { kind: "edit"; event: Event; name: string }
  | { kind: "void"; event: Event; name: string }
  | { kind: "add"; person: Person };

const EVENT_COLUMNS = "id, staff_id, business_date, kind, at, status, source, photo_path, note";

const STATUS_TONE: Record<string, PillTone> = {
  present: "success",
  needs_confirmation: "warning",
  absent_unapproved: "danger",
  weekly_off: "neutral",
  leave: "info",
  half_day: "info",
  not_rostered: "neutral",
};

export function AttendanceDay({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const today = todayInKolkata();
  const [date, setDate] = useState(today);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [pending, setPending] = useState<Event[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [photoOpen, setPhotoOpen] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);

  const load = useCallback(async () => {
    const weekAgo = addDaysToDateString(today, -7);
    const [staffRes, rosterRes, eventsRes, daysRes, pendingRes, alertsRes] = await Promise.all([
      supabase.from("staff").select("id, name").eq("outlet_id", outletId).eq("active", true).order("name"),
      supabase.from("roster_entries").select("staff_id, kind, segments, extended_until").eq("outlet_id", outletId).eq("business_date", date),
      supabase.from("attendance_events").select(EVENT_COLUMNS).eq("outlet_id", outletId).eq("business_date", date).order("at"),
      supabase.from("attendance_days").select("staff_id, status, late_minutes, payable_minutes").eq("outlet_id", outletId).eq("business_date", date),
      supabase
        .from("attendance_events")
        .select(EVENT_COLUMNS)
        .eq("outlet_id", outletId)
        .eq("status", "needs_confirmation")
        .gte("business_date", weekAgo)
        .order("at"),
      supabase
        .from("notifications")
        .select("id, kind, payload, created_at")
        .eq("outlet_id", outletId)
        .is("read_at", null)
        .like("kind", "attendance_%")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const failed = [staffRes, rosterRes, eventsRes, daysRes, pendingRes, alertsRes].find((r) => r.error);
    if (failed?.error) {
      showError(t("team.attendance.loadError", { error: failed.error.message }));
      return;
    }
    const evs = (eventsRes.data ?? []) as Event[];
    setPeople((staffRes.data ?? []) as Person[]);
    setRoster((rosterRes.data ?? []) as Roster[]);
    setEvents(evs);
    setDays((daysRes.data ?? []) as DayRow[]);
    setPending((pendingRes.data ?? []) as Event[]);
    setAlerts((alertsRes.data ?? []) as Alert[]);

    const paths = evs.map((e) => e.photo_path).filter((p): p is string => Boolean(p));
    if (paths.length) {
      const { data } = await supabase.storage.from("attendance-photos").createSignedUrls(paths, 3600);
      const urls: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
      setPhotos(urls);
    } else {
      setPhotos({});
    }
  }, [supabase, outletId, date, today, showError, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the chosen day
    void load();
  }, [load]);

  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? "";

  async function rpc(fn: string, args: Record<string, unknown>) {
    const { data, error } = await supabase.rpc(fn, args);
    const result = data as { ok: boolean; reason?: string } | null;
    if (error || !result?.ok) {
      const reason = result?.reason;
      showError(reason ? t(`team.attendance.reason.${reason}` as TranslationKey) : t("team.common.saveError", { error: error?.message ?? "" }));
      return false;
    }
    showSuccess(t("team.common.saved"));
    setFix(null);
    void load();
    return true;
  }

  async function markAlertsRead() {
    const ids = alerts.map((a) => a.id);
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    if (error) return showError(t("team.common.saveError", { error: error.message }));
    setAlerts([]);
  }

  const alertText = (a: Alert) => {
    const vars = { ...a.payload, date: formatDateLabel(String(a.payload.date)), at: a.payload.at ? clockIST(String(a.payload.at)) : "" };
    return t(`team.attendance.alert.${a.kind}` as TranslationKey, vars);
  };

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.attendance.heading")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t("team.attendance.intro")}</p>

      {alerts.length > 0 && (
        <Card className="mb-4 max-w-3xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <Bell className="h-4 w-4" aria-hidden="true" />
              {t("team.attendance.alerts")}
            </h3>
            <button type="button" className="min-h-[44px] text-sm font-medium text-accent" onClick={markAlertsRead}>
              {t("team.attendance.markRead")}
            </button>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-text">
            {alerts.map((a) => (
              <li key={a.id}>{alertText(a)}</li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="mb-4 max-w-3xl">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            {t("team.attendance.toConfirm")}
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {pending.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-text">
                  {t("team.attendance.autoClosed", { name: nameOf(e.staff_id), date: formatDateLabel(e.business_date), time: clockIST(e.at) })}
                </span>
                <span className="flex gap-2">
                  <Button variant="secondary" className="min-h-[44px]" onClick={() => rpc("team_confirm_attendance_event", { p_event: e.id })}>
                    {t("team.attendance.confirmAt", { time: clockIST(e.at) })}
                  </Button>
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => setFix({ kind: "edit", event: e, name: nameOf(e.staff_id) })}>
                    {t("team.attendance.change")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" className="w-12 px-0" aria-label={t("team.attendance.prevDay")} onClick={() => setDate(addDaysToDateString(date, -1))}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <p className="min-w-[9rem] text-center font-medium text-text">{date === today ? t("team.me.today") : formatDateLabel(date)}</p>
        <Button
          variant="secondary"
          className="w-12 px-0"
          aria-label={t("team.attendance.nextDay")}
          disabled={date >= today}
          onClick={() => setDate(addDaysToDateString(date, 1))}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      {!people && <SkeletonList rows={4} rowClassName="h-20" />}
      {people && people.length === 0 && <EmptyState title={t("team.roster.noStaff")} />}

      <ul className="flex max-w-3xl flex-col gap-2">
        {people?.map((person) => {
          const r = roster.find((x) => x.staff_id === person.id);
          const d = days.find((x) => x.staff_id === person.id);
          const mine = events.filter((e) => e.staff_id === person.id);
          return (
            <li key={person.id} className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-text">{person.name}</p>
                  <p className="text-xs text-muted">
                    {r?.kind === "work" ? formatSegments(r.segments) : r?.kind === "weekly_off" ? t("team.roster.weeklyOff") : t("team.roster.notRostered")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d && <StatusPill tone={STATUS_TONE[d.status] ?? "neutral"}>{t(`team.attendance.status.${d.status}` as TranslationKey)}</StatusPill>}
                  {d && d.late_minutes > 0 && <StatusPill tone="warning">{t("team.attendance.lateBy", { minutes: d.late_minutes })}</StatusPill>}
                  {d && d.payable_minutes > 0 && <span className="text-sm text-text">{t("team.attendance.payable", { hours: formatDuration(d.payable_minutes) })}</span>}
                </div>
              </div>

              {mine.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {mine.map((e) => (
                    <li key={e.id} className={`flex flex-wrap items-center gap-2 text-sm ${e.status === "void" ? "text-muted line-through" : "text-text"}`}>
                      <span className="w-20">{t(e.kind === "in" ? "team.attendance.in" : "team.attendance.out")}</span>
                      <span className="font-medium">{clockIST(e.at)}</span>
                      {e.source !== "device" && <span className="text-xs text-muted">({t(`team.attendance.source.${e.source}` as TranslationKey)})</span>}
                      {e.status === "needs_confirmation" && <StatusPill tone="warning">{t("team.attendance.status.needs_confirmation")}</StatusPill>}
                      {e.photo_path && photos[e.photo_path] && (
                        <button type="button" className="flex min-h-[44px] items-center gap-1 text-accent" onClick={() => setPhotoOpen(photos[e.photo_path!])}>
                          <Camera className="h-4 w-4" aria-hidden="true" />
                          {t("team.attendance.photo")}
                        </button>
                      )}
                      {e.note && <span className="text-xs text-muted">“{e.note}”</span>}
                      {e.status !== "void" && (
                        <span className="ml-auto flex gap-1">
                          <button type="button" className="min-h-[44px] px-2 text-xs font-medium text-muted hover:text-accent" onClick={() => setFix({ kind: "edit", event: e, name: person.name })}>
                            {t("team.attendance.change")}
                          </button>
                          <button type="button" className="min-h-[44px] px-2 text-xs font-medium text-muted hover:text-danger" onClick={() => setFix({ kind: "void", event: e, name: person.name })}>
                            {t("team.attendance.void")}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <button type="button" className="mt-1 flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent" onClick={() => setFix({ kind: "add", person })}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("team.attendance.add")}
              </button>
            </li>
          );
        })}
      </ul>

      {photoOpen && (
        <Modal title={t("team.attendance.photo")} onClose={() => setPhotoOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={photoOpen} alt={t("team.attendance.photo")} className="w-full rounded-2xl" />
        </Modal>
      )}

      {fix && <FixModal fix={fix} date={date} onClose={() => setFix(null)} onSubmit={rpc} />}
    </main>
  );
}

function FixModal({
  fix,
  date,
  onClose,
  onSubmit,
}: {
  fix: Fix;
  date: string;
  onClose: () => void;
  onSubmit: (fn: string, args: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState<"in" | "out">("in");
  const eventDate = fix.kind === "add" ? date : fix.event.business_date;
  const [time, setTime] = useState(fix.kind === "add" ? "" : clockIST(fix.event.at));
  // A check-out after midnight belongs to the next calendar day.
  const [nextDay, setNextDay] = useState(fix.kind !== "add" && clockIST(fix.event.at) < "06:00" && fix.event.kind === "out");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const title =
    fix.kind === "add"
      ? t("team.attendance.addFor", { name: fix.person.name })
      : fix.kind === "void"
        ? t("team.attendance.voidFor", { name: fix.name })
        : t("team.attendance.changeFor", { name: fix.name });

  async function submit() {
    setBusy(true);
    const at = time ? istToIso(nextDay ? addDaysToDateString(eventDate, 1) : eventDate, time) : null;
    if (fix.kind === "add") {
      await onSubmit("team_add_attendance_event", { p_staff: fix.person.id, p_date: date, p_kind: kind, p_at: at, p_note: note });
    } else if (fix.kind === "void") {
      await onSubmit("team_void_attendance_event", { p_event: fix.event.id, p_note: note });
    } else {
      await onSubmit("team_confirm_attendance_event", { p_event: fix.event.id, p_at: at, p_note: note });
    }
    setBusy(false);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {fix.kind === "add" && (
          <Field label={t("team.attendance.kind")} htmlFor="fix-kind">
            <SelectInput id="fix-kind" value={kind} onChange={(e) => setKind(e.target.value as "in" | "out")}>
              <option value="in">{t("team.attendance.in")}</option>
              <option value="out">{t("team.attendance.out")}</option>
            </SelectInput>
          </Field>
        )}
        {fix.kind !== "void" && (
          <>
            <Field label={t("team.attendance.time")} htmlFor="fix-time">
              <TextInput id="fix-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={nextDay} onChange={(e) => setNextDay(e.target.checked)} className="h-5 w-5" />
              {t("team.attendance.afterMidnight")}
            </label>
          </>
        )}
        <Field label={t("team.attendance.note")} htmlFor="fix-note" hint={t("team.attendance.noteHint")}>
          <TextInput id="fix-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={submit} loading={busy} disabled={!note.trim() || (fix.kind !== "void" && !time)} variant={fix.kind === "void" ? "danger" : "primary"}>
            {fix.kind === "void" ? t("team.attendance.void") : t("team.common.save")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("team.common.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
