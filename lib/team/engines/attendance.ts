// Attendance helpers for screens. The day summary itself (present/absent,
// late minutes, payable minutes) is worked out in the database by
// private.team_recompute_day, so the tablet, the manager screen and the
// 5-minute pg_cron sweep all use one set of rules. These helpers mirror the
// parts screens need to show before the server answers.

export type AttendanceEvent = {
  id: string;
  kind: "in" | "out";
  at: string; // ISO timestamp
  status: "ok" | "needs_confirmation" | "edited" | "void";
  source: "device" | "phone" | "manager" | "auto";
};

/** Whether the person is currently checked in, from their events (void ones ignored). */
export function checkState(events: readonly AttendanceEvent[]): "in" | "out" | "none" {
  const live = events.filter((e) => e.status !== "void").sort((a, b) => a.at.localeCompare(b.at));
  if (live.length === 0) return "none";
  return live[live.length - 1].kind === "in" ? "in" : "out";
}

/** "14:05" in IST from an ISO timestamp. */
export function clockIST(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** IST business date ("YYYY-MM-DD") of an ISO timestamp. */
export function istDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

/** ISO timestamp for an IST wall-clock time on a business date (time may be "HH:MM"). */
export function istToIso(date: string, time: string): string {
  return new Date(`${date}T${time.slice(0, 5)}:00+05:30`).toISOString();
}

/** Same rule as the database: round payable minutes to a step. */
export function roundMinutes(minutes: number, step: number, mode: "down" | "nearest" | "up"): number {
  if (step <= 1) return minutes;
  const f = mode === "down" ? Math.floor : mode === "up" ? Math.ceil : Math.round;
  return f(minutes / step) * step;
}

/** Pairs of [in, out] in order; an unmatched in has out = null. */
export function pairEvents(events: readonly AttendanceEvent[]): { in: AttendanceEvent; out: AttendanceEvent | null }[] {
  const live = events.filter((e) => e.status !== "void").sort((a, b) => a.at.localeCompare(b.at));
  const pairs: { in: AttendanceEvent; out: AttendanceEvent | null }[] = [];
  for (const e of live) {
    if (e.kind === "in") pairs.push({ in: e, out: null });
    else if (pairs.length && !pairs[pairs.length - 1].out) pairs[pairs.length - 1].out = e;
  }
  return pairs;
}
