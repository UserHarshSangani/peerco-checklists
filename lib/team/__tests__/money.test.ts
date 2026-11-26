import { describe, expect, it } from "vitest";
import {
  formatINR,
  percentOfToRupee,
  ratioToPaise,
  ratioToRupee,
  roundToRupee,
  rupees,
  sumPaise,
} from "@/lib/team/money";

describe("money", () => {
  it("converts rupees to whole paise", () => {
    expect(rupees(15000)).toBe(1_500_000);
    expect(rupees(0.1 + 0.2)).toBe(30);
  });

  it("rounds to the rupee, half a rupee up", () => {
    expect(roundToRupee(1_049)).toBe(1_000);
    expect(roundToRupee(1_050)).toBe(1_100);
    expect(roundToRupee(-1_050)).toBe(-1_100);
    expect(() => roundToRupee(10.5)).toThrow();
  });

  it("takes a percentage in one exact step", () => {
    // 12% of ₹15,000 = ₹1,800
    expect(percentOfToRupee(1_500_000, 1200)).toBe(180_000);
    // 0.75% of ₹18,333 = ₹137.4975 → ₹137
    expect(percentOfToRupee(1_833_300, 75)).toBe(13_700);
    // 3.25% of ₹18,350 = ₹596.375 → ₹596
    expect(percentOfToRupee(1_835_000, 325)).toBe(59_600);
  });

  it("pro-rates to the rupee", () => {
    // ₹15,000 × 28/30 = ₹14,000
    expect(ratioToRupee(1_500_000, 28, 30)).toBe(1_400_000);
    // ₹17,000 × 29/31 = ₹15,903.2258… → ₹15,903
    expect(ratioToRupee(1_700_000, 29, 31)).toBe(1_590_300);
  });

  it("keeps intermediate rates in exact paise", () => {
    // ₹17,000 / (26 days × 8 h) = ₹81.7307… → 8173 paise
    expect(ratioToPaise(1_700_000, 1, 26 * 8)).toBe(8_173);
  });

  it("sums and formats in Indian grouping", () => {
    expect(sumPaise([100, 250, -50])).toBe(300);
    expect(formatINR(485_000)).toBe("₹4,850");
    expect(formatINR(12_345_650)).toBe("₹1,23,456.50");
    expect(formatINR(-2_000)).toBe("−₹20");
  });
});
