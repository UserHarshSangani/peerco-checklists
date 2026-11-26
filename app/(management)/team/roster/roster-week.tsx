"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Copy, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatDateLabel, todayInKolkata } from "@/lib/date";
import { coverageGaps, type CoverageGap, type CoverageShift } from "@/lib/team/engines/coverage";
import { checkRosterWeek, type RosterDay, type RosterWarning } from "@/lib/team/engines/roster-rules";
import { addDays, formatSegments, weekDates, weekStartOf, weekdayOf, type WeekStart } from "@/lib/team/engines/time";
import { suggestWeeklyOffs, type OffSuggestion } from "@/lib/team/engines/weekly-off";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { WEEKDAY_KEYS, skillLabel } from "../shifts/minimums-tab";
import { ENTRY_COLUMNS, useRoster, type RosterData, type RosterEntry, type RosterStaff } from "./use-roster";
import { StaffDayRow } from "./staff-day-row";
import { warningText, type ShiftChoice } from "./roster-text";

function toCoverageShift(entry: RosterEntry): CoverageShift {
  return { staffId: entry.staff_id, skill: entry.role_skill, segments: entry.segments, extendedUntil: entry.extended_until };
}

export function RosterWeek({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const { data, settings, weekStart, setWeekStart, setData, reload, error } = useRoster(supabase, outletId);
  const today = todayInKolkata();
  const [selected, setSelected] = useState(today);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<OffSuggestion[] | null>(null);

  // Settings decide which day a week starts on.
  useEffect(() => {
    if (settings && !weekStart) setWeekStart(weekStartOf(today, settings["hours.week_start"] as WeekStart));
  }, [settings, weekStart, setWeekStart, today]);

  const dates = useMemo(() => (weekStart ? weekDates(weekStart) : []), [weekStart]);
  const day = dates.includes(selected) ? selected : (dates[0] ?? selected);

  const weekEntries = useMemo(
    () => (data && weekStart ? data.entries.filter((e) => e.business_date >= weekStart) : []),
    [data, weekStart],
  );
  const entryFor = (staffId: string, date: string) =>
    weekEntries.find((e) => e.staff_id === staffId && e.business_date === date) ?? null;

  const gapsByDate = useMemo(() => {
    const out: Record<string, CoverageGap[]> = {};
    if (!data) return out;
    for (const date of dates) {
      const shifts = weekEntries.filter((e) => e.business_date === date && e.kind === "work").map(toCoverageShift);
      out[date] = coverageGaps(shifts, data.minimums, weekdayOf(date));
    }
    return out;
  }, [data, dates, weekEntries]);

  const warningsByStaff = useMemo(() => {
    const out: Record<string, RosterWarning[]> = {};
    if (!data) return out;
    const templates = new Map(data.templates.map((tpl) => [tpl.id, tpl]));
    const rules = {
      maxDailyMinutes: data.settings["hours.max_daily_minutes"],
      maxWeeklyMinutes: data.settings["hours.max_weekly_minutes"],
      minRestMinutes: data.settings["hours.min_rest_minutes"],
      womenLateCutoff: data.settings["hours.women_late_cutoff"],
    };
    for (const person of data.staff) {
      const days: RosterDay[] = weekEntries
        .filter((e) => e.staff_id === person.id)
        .map((e) => {
          const tpl = e.shift_template_id ? templates.get(e.shift_template_id) : undefined;
          return {
            date: e.business_date,
            kind: e.kind,
            segments: e.segments,
            extendedUntil: e.extended_until,
            unpaidBreakMinutes: tpl && !tpl.paid_break ? tpl.break_minutes : 0,
          };
        });
      out[person.id] = checkRosterWeek(days, { gender: person.gender, lateShiftConsent: person.lateShiftConsent }, rules);
    }
    return out;
  }, [data, weekEntries]);

  function replaceEntry(staffId: string, date: string, next: RosterEntry | null) {
    setData((current) =>
      current && {
        ...current,
        entries: [
          ...current.entries.filter((e) => !(e.staff_id === staffId && e.business_date === date)),
          ...(next ? [next] : []),
        ],
      },
    );
  }

  async function saveChoice(person: RosterStaff, date: string, choice: ShiftChoice, role: string | null) {
    if (!data) return;
    if (choice.kind === "none") {
      const { error: e } = await supabase.from("roster_entries").delete().eq("staff_id", person.id).eq("business_date", date);
      if (e) return showError(t("team.common.saveError", { error: e.message }));
      return replaceEntry(person.id, date, null);
    }
    const template = choice.kind === "template" ? data.templates.find((x) => x.id === choice.templateId) : undefined;
    const row =
      choice.kind === "off"
        ? { kind: "weekly_off", segments: [], shift_template_id: null, role_skill: null }
        : {
            kind: "work",
            segments: template ? template.segments : [{ start: (choice as { start: string }).start, end: (choice as { end: string }).end }],
            shift_template_id: template?.id ?? null,
            role_skill: role,
          };
    const { data: saved, error: e } = await supabase
      .from("roster_entries")
      .upsert(
        { outlet_id: outletId, staff_id: person.id, business_date: date, extended_until: null, source: "manual", ...row },
        { onConflict: "staff_id,business_date" },
      )
      .select(ENTRY_COLUMNS)
      .single();
    if (e) return showError(e.message.includes("kind_segments") ? t("team.shifts.badTimes") : t("team.common.saveError", { error: e.message }));
    replaceEntry(person.id, date, saved as RosterEntry);
  }

  async function saveRole(entry: RosterEntry, role: string) {
    const { error: e } = await supabase.from("roster_entries").update({ role_skill: role }).eq("id", entry.id);
    if (e) return showError(t("team.common.saveError", { error: e.message }));
    replaceEntry(entry.staff_id, entry.business_date, { ...entry, role_skill: role });
  }

  async function toggleUnavailable(person: RosterStaff, date: string, unavailable: boolean) {
    const { error: e } = unavailable
      ? await supabase
          .from("staff_availability")
          .upsert({ staff_id: person.id, outlet_id: outletId, business_date: date, available: false }, { onConflict: "staff_id,business_date" })
      : await supabase.from("staff_availability").delete().eq("staff_id", person.id).eq("business_date", date);
    if (e) return showError(t("team.common.saveError", { error: e.message }));
    setData((current) => {
      if (!current) return current;
      const next = new Set(current.unavailable);
      if (unavailable) next.add(`${person.id}|${date}`);
      else next.delete(`${person.id}|${date}`);
      return { ...current, unavailable: next };
    });
  }

  async function copyLastWeek() {
    if (!weekStart) return;
    setBusy(true);
    const { data: n, error: e } = await supabase.rpc("team_copy_roster_week", {
      p_outlet: outletId,
      p_from_start: addDays(weekStart, -7),
      p_to_start: weekStart,
      p_overwrite: false,
    });
    setBusy(false);
    if (e) return showError(t("team.common.saveError", { error: e.message }));
    showSuccess(n ? t("team.roster.copied", { count: n as number }) : t("team.roster.copiedNone"));
    void reload();
  }

  function suggestOffs(current: RosterData) {
    const shifts = Object.fromEntries(
      dates.map((d) => [d, weekEntries.filter((e) => e.business_date === d && e.kind === "work").map(toCoverageShift)]),
    );
    const alreadyOff = new Set(weekEntries.filter((e) => e.kind === "weekly_off").map((e) => e.staff_id));
    const lastOffWeekday: Record<string, number> = {};
    for (const e of current.entries) {
      if (weekStart && e.business_date < weekStart && e.kind === "weekly_off") lastOffWeekday[e.staff_id] = weekdayOf(e.business_date);
    }
    setSuggestions(suggestWeeklyOffs({ dates, shifts, alreadyOff, lastOffWeekday, minimums: current.minimums }));
  }

  async function applySuggestions() {
    if (!suggestions) return;
    setBusy(true);
    const { error: e } = await supabase.from("roster_entries").upsert(
      suggestions.map((s) => ({
        outlet_id: outletId,
        staff_id: s.staffId,
        business_date: s.date,
        kind: "weekly_off",
        segments: [],
        shift_template_id: null,
        role_skill: null,
        extended_until: null,
        source: "manual",
      })),
      { onConflict: "staff_id,business_date" },
    );
    setBusy(false);
    if (e) return showError(t("team.common.saveError", { error: e.message }));
    setSuggestions(null);
    showSuccess(t("team.common.saved"));
    void reload();
  }

  if (error) return <p className="p-6 text-danger">{t("team.roster.loadError", { error })}</p>;
  if (!data || !weekStart) return <div className="p-6"><SkeletonList rows={5} rowClassName="h-16" /></div>;

  const staffName = (id: string) => data.staff.find((s) => s.id === id)?.name ?? "";
  const dayGaps = gapsByDate[day] ?? [];
  const activeTemplates = data.templates.filter((tpl) => tpl.active);
  const skills = data.settings["team.skills"];

  const cellText = (entry: RosterEntry | null) => {
    if (!entry) return "—";
    if (entry.kind === "weekly_off") return t("team.roster.weeklyOff");
    const tpl = entry.shift_template_id ? data.templates.find((x) => x.id === entry.shift_template_id) : undefined;
    return tpl?.name ?? formatSegments(entry.segments);
  };

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.roster.heading")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t("team.roster.intro")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="w-12 px-0" aria-label={t("team.roster.prevWeek")} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <p className="min-w-[10rem] text-center font-medium text-text">
          {formatDateLabel(dates[0])} – {formatDateLabel(dates[6])}
        </p>
        <Button variant="secondary" className="w-12 px-0" aria-label={t("team.roster.nextWeek")} onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button variant="secondary" onClick={copyLastWeek} loading={busy}>
            <Copy className="h-5 w-5" aria-hidden="true" />
            {t("team.roster.copyLastWeek")}
          </Button>
          <Button variant="secondary" onClick={() => suggestOffs(data)} disabled={busy}>
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            {t("team.roster.suggestOffs")}
          </Button>
        </div>
      </div>

      {activeTemplates.length === 0 && (
        <Card className="mb-4 text-sm text-text">
          {t("team.roster.noTemplates")}{" "}
          <Link href="/team/shifts" className="font-medium text-accent underline">
            {t("team.roster.goToShifts")}
          </Link>
        </Card>
      )}

      {/* Day picker */}
      <div className="mb-4 grid grid-cols-7 gap-1" role="tablist" aria-label={t("team.roster.days")}>
        {dates.map((date) => {
          const gaps = gapsByDate[date]?.length ?? 0;
          const active = date === day;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(date)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl text-xs ring-1 transition ${
                active ? "bg-accent text-accent-fg ring-accent" : "bg-surface text-text ring-border hover:ring-accent"
              }`}
            >
              <span className="font-medium">{t(WEEKDAY_KEYS[weekdayOf(date)]).slice(0, 3)}</span>
              <span className={date === today && !active ? "font-bold text-accent" : ""}>{Number(date.slice(8))}</span>
              {data.minimums.length > 0 && (
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${gaps ? "bg-danger" : active ? "bg-accent-fg" : "bg-success"}`}
                  aria-label={gaps ? t("team.roster.gapCount", { count: gaps }) : t("team.roster.covered")}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="flex flex-col gap-2" aria-label={formatDateLabel(day)}>
          <h3 className="font-semibold text-text">{formatDateLabel(day)}</h3>
          {data.staff.length === 0 && <EmptyState title={t("team.roster.noStaff")} />}
          {data.staff.map((person) => (
            <StaffDayRow
              key={`${person.id}|${day}`}
              person={person}
              date={day}
              entry={entryFor(person.id, day)}
              templates={activeTemplates}
              allTemplates={data.templates}
              skills={skills}
              unavailable={data.unavailable.has(`${person.id}|${day}`)}
              warnings={(warningsByStaff[person.id] ?? []).filter((w) => !("date" in w) || w.date === day)}
              onChoice={(choice, role) => saveChoice(person, day, choice, role)}
              onRole={(entry, role) => saveRole(entry, role)}
              onUnavailable={(value) => toggleUnavailable(person, day, value)}
            />
          ))}
        </section>

        <aside className="flex flex-col gap-4">
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.roster.coverage")}</h3>
            {data.minimums.length === 0 ? (
              <p className="text-sm text-muted">
                {t("team.roster.noMinimums")}{" "}
                <Link href="/team/shifts" className="font-medium text-accent underline">
                  {t("team.roster.goToShifts")}
                </Link>
              </p>
            ) : dayGaps.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-text">
                <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                {t("team.roster.fullyCovered")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {dayGaps.map((gap) => (
                  <li key={`${gap.skill}${gap.startMinute}`} className="flex items-start gap-2 text-sm text-text">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                    <span>
                      {t("team.roster.gapLine", {
                        role: skillLabel(gap.skill),
                        start: gap.start,
                        end: gap.end,
                        have: gap.have,
                        needed: gap.needed,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("team.roster.weekChecks")}</h3>
            <WeekChecks staff={data.staff} warnings={warningsByStaff} />
          </Card>
        </aside>
      </div>

      {/* Whole week at a glance (wider screens) */}
      <div className="mt-6 hidden overflow-x-auto rounded-2xl ring-1 ring-border md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="p-2 text-left font-medium">{t("team.roster.person")}</th>
              {dates.map((date) => (
                <th key={date} className="p-2 text-left font-medium">
                  <button type="button" className="hover:text-accent" onClick={() => setSelected(date)}>
                    {formatDateLabel(date)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.staff.map((person) => (
              <tr key={person.id}>
                <td className="p-2 font-medium text-text">{person.name}</td>
                {dates.map((date) => {
                  const entry = entryFor(person.id, date);
                  return (
                    <td key={date} className={`p-2 ${date === day ? "bg-accent/5" : ""}`}>
                      <button type="button" onClick={() => setSelected(date)} className="text-left text-text hover:text-accent">
                        {cellText(entry)}
                        {data.unavailable.has(`${person.id}|${date}`) && (
                          <span className="ml-1 text-xs text-danger">({t("team.roster.unavailableShort")})</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {suggestions && (
        <Modal title={t("team.roster.suggestTitle")} onClose={() => setSuggestions(null)}>
          {suggestions.length === 0 ? (
            <p className="text-sm text-text">{t("team.roster.suggestNone")}</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{t("team.roster.suggestIntro")}</p>
              <ul className="mb-4 flex flex-col gap-2">
                {suggestions.map((s) => (
                  <li key={s.staffId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-text">{staffName(s.staffId)}</span>
                    <span className="flex items-center gap-2 text-text">
                      {formatDateLabel(s.date)}
                      {s.addsShortfallMinutes > 0 && <StatusPill tone="warning">{t("team.roster.suggestShort")}</StatusPill>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex gap-2">
            {suggestions.length > 0 && (
              <Button onClick={applySuggestions} loading={busy}>
                {t("team.roster.suggestApply")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSuggestions(null)}>
              {t("team.common.cancel")}
            </Button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function WeekChecks({ staff, warnings }: { staff: RosterStaff[]; warnings: Record<string, RosterWarning[]> }) {
  const { t } = useLanguage();
  const lines = staff.flatMap((person) => (warnings[person.id] ?? []).map((w) => ({ person, w })));
  if (lines.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-text">
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
        {t("team.roster.noWarnings")}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {lines.map(({ person, w }, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            <span className="font-medium">{person.name}</span>: {warningText(t, w)}
          </span>
        </li>
      ))}
    </ul>
  );
}
