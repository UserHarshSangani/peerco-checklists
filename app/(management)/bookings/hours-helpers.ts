import type { OutletClosure, OutletHourRow } from "./types";

export type DayDescription = {
  kind: "closure" | "closed" | "unset" | "open";
  text: string;
  windows: { from: string; to: string }[];
};

// Same-day, no-overnight hours — the "allowed" window per shift is
// open_time..last_booking_time (not close_time), matching exactly what
// private.apply_booking_rules judges slots against.
export function describeDay(
  dateStr: string,
  hours: OutletHourRow[],
  closures: OutletClosure[],
): DayDescription {
  const closure = closures.find((c) => dateStr >= c.date_from && dateStr <= c.date_to);
  if (closure) {
    return {
      kind: "closure",
      text: `Holiday: ${closure.reason?.trim() || "Closed"}`,
      windows: [],
    };
  }

  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const dayRows = hours.filter((h) => h.weekday === weekday);
  if (dayRows.length === 0) {
    return { kind: "unset", text: "Hours not set", windows: [] };
  }

  const openRows = dayRows.filter((h) => !h.is_closed);
  if (openRows.length === 0) {
    return { kind: "closed", text: "Closed", windows: [] };
  }

  const windows = openRows
    .filter((h) => h.open_time && h.last_booking_time)
    .map((h) => ({ from: h.open_time!.slice(0, 5), to: h.last_booking_time!.slice(0, 5) }))
    .sort((a, b) => a.from.localeCompare(b.from));

  return {
    kind: "open",
    text: windows.map((w) => `${w.from}-${w.to}`).join(", "),
    windows,
  };
}
