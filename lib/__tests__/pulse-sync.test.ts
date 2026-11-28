import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { addDays, windows } from "../pulse/sync";

describe("pulse sync windows", () => {
  it("adds calendar days across month ends", () => {
    expect(addDays("2026-11-28", -1)).toBe("2026-11-27");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("splits a range into imports of at most 31 days", () => {
    expect(windows("2026-11-21", "2026-11-27")).toEqual([{ from: "2026-11-21", to: "2026-11-27" }]);
    const w = windows("2026-08-30", "2026-11-27");
    expect(w).toEqual([
      { from: "2026-08-30", to: "2026-09-29" },
      { from: "2026-09-30", to: "2026-10-30" },
      { from: "2026-10-31", to: "2026-11-27" },
    ]);
  });
});
