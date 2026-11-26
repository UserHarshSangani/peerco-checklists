// Shift time helpers. Times are IST wall-clock "HH:MM". A business day is
// measured in minutes from its midnight; a segment whose end is at or
// before its start runs past midnight (e.g. 18:00–01:00 is 1080–1500).
// Everything here is pure — no Date objects tied to the machine's zone.

export type Segment = { start: string; end: string };
/** [start, end) in minutes from the business day's midnight; end may exceed 1440. */
export type Interval = readonly [number, number];

const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
export const DAY_MINUTES = 1440;

export function isTime(value: unknown): value is string {
  return typeof value === "string" && HHMM.test(value);
}

export function toMinutes(time: string): number {
  const match = HHMM.exec(time.slice(0, 5));
  if (!match) throw new Error(`Not a time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 1500 -> "01:00" (wraps past midnight). */
export function fromMinutes(minutes: number): string {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function segmentInterval(segment: Segment): Interval {
  const start = toMinutes(segment.start);
  let end = toMinutes(segment.end);
  if (end <= start) end += DAY_MINUTES;
  return [start, end];
}

/** Segments in order, each later than the last; a later one that wraps is pushed past midnight. */
export function segmentsToIntervals(segments: readonly Segment[]): Interval[] {
  const out: Interval[] = [];
  for (const segment of segments) {
    let [start, end] = segmentInterval(segment);
    const prevEnd = out.length ? out[out.length - 1][1] : -1;
    while (start < prevEnd) {
      start += DAY_MINUTES;
      end += DAY_MINUTES;
    }
    out.push([start, end]);
  }
  return out;
}

/** Segments are valid if 1–3 well-formed, non-empty, and don't overlap or run past 24 hours. */
export function validSegments(segments: unknown): segments is Segment[] {
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 3) return false;
  if (!segments.every((s) => s && isTime(s.start) && isTime(s.end) && s.start !== s.end)) return false;
  const intervals = segmentsToIntervals(segments as Segment[]);
  return intervals[intervals.length - 1][1] - intervals[0][0] <= DAY_MINUTES;
}

export function spanMinutes(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/** Clip intervals to [from, to). */
export function clipIntervals(intervals: readonly Interval[], from: number, to: number): Interval[] {
  return intervals
    .map(([start, end]) => [Math.max(start, from), Math.min(end, to)] as const)
    .filter(([start, end]) => end > start);
}

/** 510 -> "8h 30m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "11:00–15:00, 18:00–23:00" */
export function formatSegments(segments: readonly Segment[]): string {
  return segments.map((s) => `${s.start}–${s.end}`).join(", ");
}

// ---- Calendar dates (plain "YYYY-MM-DD", IST business dates) ----

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday (matches staffing_minimums.weekday). */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type WeekStart = "monday" | "sunday";

export function weekStartOf(date: string, weekStart: WeekStart): string {
  const offset = weekStart === "monday" ? (weekdayOf(date) + 6) % 7 : weekdayOf(date);
  return addDays(date, -offset);
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
