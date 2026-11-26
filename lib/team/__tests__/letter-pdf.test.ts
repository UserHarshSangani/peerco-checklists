import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("appointment letter PDF", () => {
  it("renders the default template to a PDF", async () => {
    const { renderLetterPdf } = await import("../letter-pdf");
    const { DEFAULT_LETTER_TEMPLATE, fillTemplate, LETTER_PLACEHOLDERS } = await import("../letter");
    const values = Object.fromEntries(LETTER_PLACEHOLDERS.map((p) => [p, `value-${p}`]));
    const pdf = await renderLetterPdf(fillTemplate(DEFAULT_LETTER_TEMPLATE, values), "Demo Kitchen · Baner");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  }, 30_000);
});
