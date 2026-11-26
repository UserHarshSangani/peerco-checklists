// Input clean-up and checks shared by forms and server routes.

// Accepts "98765 43210", "+91 98765-43210", "098765 43210" -> "9876543210".
export function normalizeMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function normalizeIfsc(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value) ? value : null;
}

export function normalizeAccountNumber(raw: string): string | null {
  const value = raw.replace(/[\s-]/g, "");
  return /^\d{9,18}$/.test(value) ? value : null;
}

export function normalizeUan(raw: string): string | null {
  const value = raw.replace(/\s/g, "");
  return /^\d{12}$/.test(value) ? value : null;
}

export function normalizeEsicIp(raw: string): string | null {
  const value = raw.replace(/\s/g, "");
  return /^\d{10}$/.test(value) ? value : null;
}

// Synthetic, never-mailed login identity for a staff member's phone login.
export function staffLoginEmail(staffId: string): string {
  return `s-${staffId}@staff.daybook.invalid`;
}
