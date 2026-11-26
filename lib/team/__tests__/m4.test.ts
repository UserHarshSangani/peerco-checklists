import { describe, expect, it } from "vitest";
import { checkState, clockIST, istDate, istToIso, pairEvents, roundMinutes, type AttendanceEvent } from "../engines/attendance";

const ev = (id: string, kind: "in" | "out", at: string, status: AttendanceEvent["status"] = "ok"): AttendanceEvent => ({
  id,
  kind,
  at,
  status,
  source: "device",
});

describe("attendance helpers", () => {
  it("knows whether someone is checked in", () => {
    expect(checkState([])).toBe("none");
    expect(checkState([ev("1", "in", "2026-11-26T06:30:00Z")])).toBe("in");
    expect(checkState([ev("1", "in", "2026-11-26T06:30:00Z"), ev("2", "out", "2026-11-26T15:30:00Z")])).toBe("out");
    expect(checkState([ev("1", "in", "2026-11-26T06:30:00Z"), ev("2", "out", "2026-11-26T15:30:00Z", "void")])).toBe("in");
  });

  it("converts between IST and UTC", () => {
    expect(clockIST("2026-11-26T06:35:00Z")).toBe("12:05");
    expect(istDate("2026-11-26T19:00:00Z")).toBe("2026-11-27"); // 00:30 IST next day
    expect(istToIso("2026-11-26", "12:00")).toBe("2026-11-26T06:30:00.000Z");
  });

  it("rounds payable time", () => {
    expect(roundMinutes(487, 15, "nearest")).toBe(480);
    expect(roundMinutes(488, 15, "nearest")).toBe(495);
    expect(roundMinutes(494, 15, "down")).toBe(480);
    expect(roundMinutes(481, 15, "up")).toBe(495);
    expect(roundMinutes(481, 1, "up")).toBe(481);
  });

  it("pairs check-ins with check-outs", () => {
    const pairs = pairEvents([
      ev("3", "in", "2026-11-26T12:30:00Z"),
      ev("1", "in", "2026-11-26T06:30:00Z"),
      ev("2", "out", "2026-11-26T09:30:00Z"),
    ]);
    expect(pairs.map((p) => [p.in.id, p.out?.id ?? null])).toEqual([
      ["1", "2"],
      ["3", null],
    ]);
  });
});
