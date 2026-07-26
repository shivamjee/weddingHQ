import { describe, it, expect } from "vitest";
import {
  toPaise,
  rupeesToPaise,
  formatINR,
  formatCompact,
  convert,
  parseRupeeInput,
  paiseToRupeeInput,
} from "./money";

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

describe("parseRupeeInput — the only place typed text becomes money", () => {
  it("plain rupees", () => {
    expect(parseRupeeInput("2000000")).toBe(200000000);
  });
  it("tolerates the symbol, Indian grouping and spaces", () => {
    expect(parseRupeeInput("₹20,00,000")).toBe(200000000);
    expect(parseRupeeInput(" 1,800 ")).toBe(180000);
  });
  it("accepts up to two decimal places", () => {
    expect(parseRupeeInput("1800.50")).toBe(180050);
    expect(parseRupeeInput("0.05")).toBe(5);
  });
  it("rejects a third decimal place rather than silently rounding it", () => {
    expect(parseRupeeInput("10.005")).toBeNull();
  });
  it("rejects shorthand and junk instead of guessing", () => {
    // The failure this guards: Number("₹1.8k") is NaN, and a naive parser that
    // strips non-digits would read it as 18.
    expect(parseRupeeInput("₹1.8k")).toBeNull();
    expect(parseRupeeInput("about 2 lakh")).toBeNull();
    expect(parseRupeeInput("1e6")).toBeNull();
  });
  it("rejects negatives — a negative budget is a typo", () => {
    expect(parseRupeeInput("-500")).toBeNull();
  });
  it("empty input is 'not set', not zero", () => {
    expect(parseRupeeInput("")).toBeNull();
    expect(parseRupeeInput("   ")).toBeNull();
  });
});

describe("paiseToRupeeInput — round-trips through an editable field", () => {
  it("whole rupees carry no decimal part", () => {
    expect(paiseToRupeeInput(toPaise(200000000))).toBe("2000000");
  });
  it("keeps a fractional rupee", () => {
    expect(paiseToRupeeInput(toPaise(180050))).toBe("1800.50");
  });
  it("round-trips", () => {
    for (const paise of [0, 5, 180050, 200000000]) {
      expect(parseRupeeInput(paiseToRupeeInput(toPaise(paise)))).toBe(paise === 0 ? 0 : paise);
    }
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
