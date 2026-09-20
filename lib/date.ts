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

export function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
