// Quantities everywhere in the stock screens: at most 3 decimals, no
// trailing zeros (e.g. 2.5 not 2.500, 3 not 3.0).
export function formatQuantity(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function formatRupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// Formats a span of minutes as a compact, human string — under an hour in
// minutes, under a day in hours (plus minutes only when there's a
// meaningful remainder), and 24h+ in days (plus hours on the same
// condition). Floors at each step rather than rounding to the nearest
// unit, so 119 minutes reads as "1 hr 59 min", not "2 hr". Takes the
// duration's magnitude; callers handle direction (e.g. "overdue" vs
// "due in") themselves.
export function formatDuration(minutes: number): string {
  const total = Math.floor(Math.abs(minutes));
  if (total < 60) return `${total} min`;
  if (total < 60 * 24) {
    const hours = Math.floor(total / 60);
    const remainder = total % 60;
    return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
  }
  const days = Math.floor(total / (60 * 24));
  const dayLabel = days === 1 ? "day" : "days";
  const remainder = Math.floor((total % (60 * 24)) / 60);
  return remainder > 0 ? `${days} ${dayLabel} ${remainder} hr` : `${days} ${dayLabel}`;
}

// Restricts a numeric text input to a non-negative decimal with at most 3
// decimal places, letting the user type freely (including a trailing "."
// or partial "1.2") without ever producing an invalid intermediate string.
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const whole = cleaned.slice(0, firstDot);
  const fraction = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 3);
  return `${whole}.${fraction}`;
}
