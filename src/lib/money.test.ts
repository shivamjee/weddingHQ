import { describe, it, expect } from "vitest";
import { toPaise, rupeesToPaise, formatINR, formatCompact, convert } from "./money";

describe("toPaise", () => {
  it("brands an integer", () => {
    expect(toPaise(150)).toBe(150);
  });
  it("rejects non-integers (likely rupees passed as paise)", () => {
    expect(() => toPaise(12.5)).toThrow();
  });
});

describe("rupeesToPaise", () => {
  it("converts rupees to paise", () => {
    expect(rupeesToPaise(1300000)).toBe(130000000);
  });
  it("rounds to the nearest paisa", () => {
    expect(rupeesToPaise(10.005)).toBe(1001);
  });
});

describe("formatINR — Indian digit grouping (##,##,###)", () => {
  it("single rupee", () => {
    expect(formatINR(toPaise(100))).toBe("₹1");
  });
  it("hundreds — no grouping", () => {
    expect(formatINR(toPaise(10000))).toBe("₹100");
  });
  it("thousand — first comma after 3 digits", () => {
    expect(formatINR(toPaise(100000))).toBe("₹1,000");
  });
  it("one lakh groups as 1,00,000 (NOT 100,000)", () => {
    expect(formatINR(toPaise(10000000))).toBe("₹1,00,000");
  });
  it("thirteen lakh — the spec example", () => {
    expect(formatINR(toPaise(130000000))).toBe("₹13,00,000");
  });
  it("one crore groups as 1,00,00,000", () => {
    expect(formatINR(toPaise(1000000000))).toBe("₹1,00,00,000");
  });
  it("mixed crore/lakh/thousand", () => {
    // 1,23,45,678 rupees
    expect(formatINR(toPaise(1234567800))).toBe("₹1,23,45,678");
  });
  it("shows paise only when there is a fractional rupee", () => {
    expect(formatINR(toPaise(123456))).toBe("₹1,234.56");
  });
  it("handles negative amounts (owed/owing balances)", () => {
    expect(formatINR(toPaise(-15000000))).toBe("-₹1,50,000");
  });
  it("zero", () => {
    expect(formatINR(toPaise(0))).toBe("₹0");
  });
});

describe("formatCompact — Cr / L / K", () => {
  it("thirteen lakh → 13L (spec example)", () => {
    expect(formatCompact(toPaise(130000000))).toBe("13L");
  });
  it("1.2 crore → 1.2Cr (spec example)", () => {
    expect(formatCompact(toPaise(1200000000))).toBe("1.2Cr");
  });
  it("exact crore → 1Cr (trailing .0 trimmed)", () => {
    expect(formatCompact(toPaise(1000000000))).toBe("1Cr");
  });
  it("one lakh fifty → 1.5L", () => {
    expect(formatCompact(toPaise(15000000))).toBe("1.5L");
  });
  it("thousands → K", () => {
    expect(formatCompact(toPaise(1300000))).toBe("13K");
  });
  it("below ₹1,000 shows full rupees", () => {
    expect(formatCompact(toPaise(50000))).toBe("₹500");
  });
  it("negative compact", () => {
    expect(formatCompact(toPaise(-130000000))).toBe("-13L");
  });
});

describe("convert — display currency at render time", () => {
  it("INR passes through to formatINR", () => {
    expect(convert(toPaise(130000000), 0.012, "INR")).toBe("₹13,00,000");
  });
  it("USD at a given rate (units per 1 INR)", () => {
    // ₹10,000 = 1000000 paise; at 0.012 USD/INR → $120.00
    expect(convert(toPaise(1000000), 0.012, "USD")).toBe("$120.00");
  });
  it("EUR formats with the euro symbol", () => {
    expect(convert(toPaise(1000000), 0.011, "EUR")).toBe("€110.00");
  });
});
