import type { Locale } from "./i18n/translations";

export function todayInKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

export function formatTimeKolkata(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTime12Kolkata(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Formats a plain "HH:MM" / "HH:MM:SS" time-of-day string (no date, no
// timezone conversion needed — it's already the IST wall-clock time stored
// in checklist_templates.due_time) as "8:30 AM".
export function formatTimeOfDay12(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const anchor = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return anchor.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Returns the last `count` calendar dates in Asia/Kolkata as "YYYY-MM-DD"
// strings, most recent first (today included). India has no DST, so once we
// have today's Kolkata date we can do the rest with plain UTC day math.
export function lastDatesInKolkata(count: number): string[] {
  const [year, month, day] = todayInKolkata().split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  return Array.from({ length: count }, (_, i) =>
    new Date(anchor - i * 86_400_000).toISOString().slice(0, 10),
  );
}

// Shifts a plain "YYYY-MM-DD" calendar date by `days` (may be negative).
// Business dates are plain calendar dates already anchored to Asia/Kolkata
// at submission time, so this is pure UTC day math — no timezone involved.
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// "16 Sep" — no weekday, used for compact chart axis labels.
export function formatShortDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

const INTL_LOCALE: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function formatDateLabelForLocale(dateStr: string, locale: Locale): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    INTL_LOCALE[locale],
    { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" },
  );
}
