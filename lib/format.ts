// Quantities everywhere in the stock screens: at most 3 decimals, no
// trailing zeros (e.g. 2.5 not 2.500, 3 not 3.0).
export function formatQuantity(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function formatRupees(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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
