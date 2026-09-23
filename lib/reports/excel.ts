import * as XLSX from "xlsx";

// Shared workbook-building helpers for every /reports download. Everything
// runs client-side (SheetJS in the browser, triggered as a Blob download) —
// no server-side generation, matching the rest of this feature.

export type ColumnType = "text" | "number" | "currency" | "date" | "datetime" | "time";

export type SheetColumn<T> = {
  header: string;
  type: ColumnType;
  get: (row: T) => string | number | boolean | Date | null;
};

// Excel number-format codes per column type. "text" and "number" get no
// explicit format (General is fine for a plain quantity); currency gets a
// fixed 2-decimal numeric format (never a formatted string) and the date
// types get a real format so Excel treats them as dates/times, not text.
const NUMBER_FORMAT: Partial<Record<ColumnType, string>> = {
  currency: "0.00",
  date: "yyyy-mm-dd",
  datetime: "yyyy-mm-dd hh:mm",
  time: "h:mm AM/PM",
};

// SheetJS derives a cell's Excel date/time serial from a JS Date's LOCAL
// getters (getFullYear/getHours/etc, not the UTC ones) — see datenum() in
// xlsx.js. So every Date handed to buildSheet must be built with the
// plain `new Date(y, m, d, h, mi, s)` LOCAL constructor, using whatever
// calendar/clock values we actually want Excel to display, regardless of
// what timezone the browser generating the file happens to be in. Never
// Date.UTC(...) or a "...Z" ISO string here — either round-trips through
// SheetJS shifted by the browser's own UTC offset.

// A plain "YYYY-MM-DD" business date has no time-of-day component to lose;
// building it via the local constructor keeps the same calendar date in
// the exported file that the app shows everywhere else.
export function businessDateToExcelDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// A pure time-of-day (e.g. checklist_templates.due_time = "08:30:00") is
// already the Asia/Kolkata wall-clock value with no date of its own —
// anchor it on a fixed date so Excel can still store it as a real
// date/time serial, matching lib/date.ts's formatTimeOfDay12 anchoring.
export function timeOfDayToDate(time: string): Date | null {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(2000, 0, 1, hour, minute);
}

// A genuine UTC timestamp (submitted_at, logged_at, ...) needs converting
// to its Asia/Kolkata wall-clock value FIRST, then building via the local
// constructor from those already-shifted components — never Date.UTC on
// the raw ISO string, and never the browser's own local interpretation of
// it (the browser generating the file may not be on IST).
export function kolkataInstantToExcelDate(iso: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  // hour12:false can format midnight as "24" — normalize back to 0.
  const hour = get("hour") % 24;
  return new Date(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

export function buildSheet<T>(rows: T[], columns: SheetColumn<T>[]): XLSX.WorkSheet {
  const header = columns.map((column) => column.header);
  const body = rows.map((row) =>
    columns.map((column) => {
      const value = column.get(row);
      return value === null || value === undefined ? "" : value;
    }),
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);

  columns.forEach((column, colIndex) => {
    const format = NUMBER_FORMAT[column.type];
    if (!format) return;
    for (let r = 1; r <= rows.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: colIndex });
      const cell = ws[ref];
      if (cell && cell.v !== "") cell.z = format;
    }
  });

  return ws;
}

export function buildAoaSheet(
  rows: (string | number | Date | null)[][],
  currencyCells: { row: number; col: number }[] = [],
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(
    rows.map((row) => row.map((cell) => (cell === null ? "" : cell))),
  );
  for (const { row, col } of currencyCells) {
    const ref = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = ws[ref];
    if (cell) cell.z = "0.00";
  }
  return ws;
}

export function downloadWorkbook(
  sheets: { name: string; ws: XLSX.WorkSheet }[],
  filename: string,
) {
  const wb = XLSX.utils.book_new();
  for (const { name, ws } of sheets) {
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Filenames follow "<ReportType>_<outlet or All>_<from>_<to>.xlsx" — strip
// anything that isn't filename-safe out of the free-text outlet name.
export function sanitizeForFilename(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "Report";
}

export function reportFilename(
  reportType: string,
  outletLabel: string,
  from: string,
  to: string,
): string {
  return `${reportType}_${sanitizeForFilename(outletLabel)}_${from}_${to}.xlsx`;
}
