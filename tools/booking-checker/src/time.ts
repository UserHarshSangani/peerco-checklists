// Asia/Kolkata has no DST, so a fixed +5:30 offset is safe year-round.
const KOLKATA_OFFSET_MINUTES = 5 * 60 + 30;

export function todayInKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

// Unix seconds for 00:00 Asia/Kolkata on the given "YYYY-MM-DD" date — the
// `date` query param Swiggy's dineout booking page expects.
export function kolkataMidnightUnixSeconds(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMillis = Date.UTC(year, month - 1, day) - KOLKATA_OFFSET_MINUTES * 60_000;
  return Math.floor(utcMillis / 1000);
}

// "12:00 AM" -> "00:00", "12:15 PM" -> "12:15", "01:30 PM" -> "13:30".
// Returns null for anything that isn't a clean 12-hour time.
export function to24Hour(time12: string): string | null {
  const match = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const meridiem = match[3].toUpperCase();
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isOn15MinuteGrid(time24: string): boolean {
  const minute = Number(time24.split(":")[1]);
  return Number.isFinite(minute) && minute % 15 === 0;
}

// Accepts either an already-24-hour "HH:MM" / "HH:MM:SS" string (as several
// booking-platform JSON APIs return) or a 12-hour "H:MM AM/PM" string, and
// normalizes either to "HH:MM". Returns null for anything else.
export function normalizeApiTime(value: string): string | null {
  const trimmed = value.trim();
  const match24 = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match24) return `${match24[1]}:${match24[2]}`;
  return to24Hour(trimmed);
}
