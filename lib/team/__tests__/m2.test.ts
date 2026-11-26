import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText, parseKey } from "../bank-crypto";
import { DEFAULT_LETTER_TEMPLATE, fillTemplate, LETTER_PLACEHOLDERS, parseLetter, unknownPlaceholders } from "../letter";
import { monthlyGrossPaise, structureOn } from "../salary";
import { normalizeAccountNumber, normalizeIfsc, normalizeMobile, staffLoginEmail } from "../validate";

describe("bank account encryption", () => {
  const key = randomBytes(32);

  it("round-trips and never stores the plain number", () => {
    const stored = encryptText("123456789012", key);
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("123456789012");
    expect(decryptText(stored, key)).toBe("123456789012");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptText("123456789012", key)).not.toBe(encryptText("123456789012", key));
  });

  it("rejects a wrong key or tampered text", () => {
    const stored = encryptText("123456789012", key);
    expect(() => decryptText(stored, randomBytes(32))).toThrow();
    const raw = Buffer.from(stored.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decryptText(`v1:${raw.toString("base64")}`, key)).toThrow();
  });

  it("insists on a 32-byte key", () => {
    expect(() => parseKey(undefined)).toThrow(/not set/);
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(parseKey(key.toString("base64")).equals(key)).toBe(true);
  });
});

describe("input clean-up", () => {
  it("normalises Indian mobile numbers", () => {
    expect(normalizeMobile("98765 43210")).toBe("9876543210");
    expect(normalizeMobile("+91 98765-43210")).toBe("9876543210");
    expect(normalizeMobile("098765 43210")).toBe("9876543210");
    expect(normalizeMobile("5876543210")).toBeNull();
    expect(normalizeMobile("98765")).toBeNull();
  });

  it("checks IFSC and account numbers", () => {
    expect(normalizeIfsc(" hdfc0001234 ")).toBe("HDFC0001234");
    expect(normalizeIfsc("HDFC1001234")).toBeNull();
    expect(normalizeAccountNumber("1234 5678 9012")).toBe("123456789012");
    expect(normalizeAccountNumber("12345")).toBeNull();
  });

  it("makes a never-mailed login address", () => {
    expect(staffLoginEmail("abc")).toBe("s-abc@staff.daybook.invalid");
  });
});

describe("pay structures", () => {
  const base = { basic_paise: 1300000, da_paise: 0, hra_paise: 250000, fixed_incentives: [] };

  it("adds up the fixed monthly gross", () => {
    expect(
      monthlyGrossPaise({ ...base, other_allowances: [{ code: "special", label: "Special", paise: 100000, excluded_from_wages: true }] }),
    ).toBe(1650000);
  });

  it("picks the structure in force on a date", () => {
    const list = [
      { id: "a", effective_from: "2026-04-01" },
      { id: "b", effective_from: "2026-10-01" },
      { id: "c", effective_from: "2027-01-01" },
    ];
    expect(structureOn(list, "2026-09-30")?.id).toBe("a");
    expect(structureOn(list, "2026-11-26")?.id).toBe("b");
    expect(structureOn(list, "2026-03-31")).toBeNull();
  });
});

describe("appointment letter template", () => {
  it("the default template only uses known placeholders", () => {
    expect(unknownPlaceholders(DEFAULT_LETTER_TEMPLATE)).toEqual([]);
  });

  it("fills every placeholder and leaves typos visible", () => {
    const values = Object.fromEntries(LETTER_PLACEHOLDERS.map((p) => [p, `<${p}>`]));
    const filled = fillTemplate(DEFAULT_LETTER_TEMPLATE, values);
    expect(filled).not.toMatch(/\{\{/);
    expect(fillTemplate("Hi {{staff_name}} {{ nmae }}", { staff_name: "Priya" })).toBe("Hi Priya {{ nmae }}");
    expect(unknownPlaceholders("{{nmae}} {{staff_name}}")).toEqual(["nmae"]);
  });

  it("splits headings, paragraphs and bullets", () => {
    expect(parseLetter("# Title\n\nLine one\nLine two\n- a\n- b\n\n# Next")).toEqual([
      { kind: "heading", text: "Title" },
      { kind: "paragraph", lines: ["Line one", "Line two"] },
      { kind: "bullets", items: ["a", "b"] },
      { kind: "heading", text: "Next" },
    ]);
  });
});
