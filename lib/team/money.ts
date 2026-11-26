// Money for Daybook Team. Every amount is an integer number of paise —
// never rupees as a float. Rounding happens in exactly one place
// (roundToRupee), and only where a final rupee figure is produced.

export type Paise = number;

export const PAISE_PER_RUPEE = 100;
const BPS_DENOMINATOR = 10_000; // 1 basis point = 0.01%

function assertWholePaise(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a whole number of paise, got ${value}`);
  }
}

export function rupees(amount: number): Paise {
  const paise = Math.round(amount * PAISE_PER_RUPEE);
  assertWholePaise(paise);
  return paise;
}

// Integer division of a/b, rounding half away from zero. a and b are integers.
function divRoundHalfUp(a: number, b: number): number {
  const sign = Math.sign(a) * Math.sign(b);
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const q = Math.floor(absA / absB);
  const r = absA - q * absB;
  return sign * (r * 2 >= absB ? q + 1 : q);
}

// THE rounding rule: to the nearest whole rupee, half a rupee rounds up
// (away from zero). Used for every statutory figure and the final net pay.
export function roundToRupee(paise: Paise): Paise {
  assertWholePaise(paise);
  return divRoundHalfUp(paise, PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
}

// paise × bps / 10000, rounded to the rupee in a single exact step (no
// intermediate float or paise rounding). 12% of ₹15,000 → percentOfToRupee(1500000, 1200).
export function percentOfToRupee(paise: Paise, bps: number): Paise {
  assertWholePaise(paise);
  assertWholePaise(bps, "bps");
  const numerator = paise * bps;
  if (!Number.isSafeInteger(numerator)) throw new Error("amount too large");
  return divRoundHalfUp(numerator, BPS_DENOMINATOR * PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
}

// a × num / den in paise, rounded to the rupee — for pro-rating
// (monthly wage × payable days / days in month) and hourly rates.
export function ratioToRupee(paise: Paise, num: number, den: number): Paise {
  assertWholePaise(paise);
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) {
    throw new Error("ratio needs whole numbers and a non-zero denominator");
  }
  const numerator = paise * num;
  if (!Number.isSafeInteger(numerator)) throw new Error("amount too large");
  return divRoundHalfUp(numerator, den * PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
}

// Same as ratioToRupee but kept in exact paise (rounded half-up to the
// paisa) for intermediate rates like an hourly wage, which are multiplied
// again before the final rupee rounding.
export function ratioToPaise(paise: Paise, num: number, den: number): Paise {
  assertWholePaise(paise);
  const numerator = paise * num;
  if (!Number.isSafeInteger(numerator) || den === 0) throw new Error("bad ratio");
  return divRoundHalfUp(numerator, den);
}

export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((total, value) => {
    assertWholePaise(value);
    return total + value;
  }, 0);
}

// "₹4,850" / "₹4,850.50" in Indian digit grouping (₹1,23,456).
export function formatINR(paise: Paise, { showPaise = false } = {}): string {
  assertWholePaise(paise);
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / PAISE_PER_RUPEE);
  const fraction = abs % PAISE_PER_RUPEE;
  const grouped = new Intl.NumberFormat("en-IN").format(whole);
  const tail = showPaise || fraction !== 0 ? `.${String(fraction).padStart(2, "0")}` : "";
  return `${negative ? "−" : ""}₹${grouped}${tail}`;
}
