import { describe, expect, it } from "vitest";
import { formatTimeKolkata, formatTimeOfDay12 } from "@/lib/date";

describe("lib/date", () => {
  it("formats an IST wall-clock time-of-day without shifting it", () => {
    expect(formatTimeOfDay12("08:30")).toBe("8:30 AM");
    expect(formatTimeOfDay12("23:00:00")).toBe("11:00 PM");
  });

  it("shows a UTC timestamp in Asia/Kolkata", () => {
    // 15:30 UTC is 21:00 IST.
    expect(formatTimeKolkata("2026-11-26T15:30:00Z")).toBe("21:00");
  });
});
