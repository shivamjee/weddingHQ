import { describe, it, expect } from "vitest";
import { formatPhone, mailtoHref, telHref, toInternational, whatsappHref } from "./phone";

describe("toInternational — every way a family writes a number", () => {
  it("a bare 10-digit mobile gets +91", () => {
    expect(toInternational("9876543210")).toBe("919876543210");
  });
  it("ignores spaces, dashes and brackets", () => {
    expect(toInternational("98765 43210")).toBe("919876543210");
    expect(toInternational("98765-43210")).toBe("919876543210");
    expect(toInternational("(98765) 43210")).toBe("919876543210");
  });
  it("strips the Indian trunk zero", () => {
    expect(toInternational("098765 43210")).toBe("919876543210");
  });
  it("leaves an already-prefixed number alone", () => {
    expect(toInternational("919876543210")).toBe("919876543210");
    expect(toInternational("+91 98765 43210")).toBe("919876543210");
  });
  it("treats 00 as +, without mistaking it for a trunk zero", () => {
    expect(toInternational("0091 98765 43210")).toBe("919876543210");
  });
  it("keeps a non-Indian number as given rather than forcing +91 onto it", () => {
    expect(toInternational("+1 480 555 0142")).toBe("14805550142");
  });
  it("passes an STD landline through as typed", () => {
    // 011 2345 6789 is 11 digits starting with 0 → trunk zero stripped.
    expect(toInternational("011 2345 6789")).toBe("911123456789");
    // An 8-digit local landline is not guessed at.
    expect(toInternational("2345 6789")).toBe("23456789");
  });
  it("returns null for too few digits, so no dead link is rendered", () => {
    expect(toInternational("")).toBeNull();
    expect(toInternational("12345")).toBeNull();
    expect(toInternational("ask Mum")).toBeNull();
  });
});

describe("link builders", () => {
  it("tel: carries the + so a phone dials internationally", () => {
    expect(telHref("98765 43210")).toBe("tel:+919876543210");
  });
  it("wa.me takes digits only — no +, no spaces", () => {
    // A wa.me link with a + or a space opens WhatsApp on "invalid number"
    // rather than failing loudly, which is why this is asserted.
    expect(whatsappHref("+91 98765 43210")).toBe("https://wa.me/919876543210");
  });
  it("both return null when there is nothing to dial", () => {
    expect(telHref("")).toBeNull();
    expect(whatsappHref("n/a")).toBeNull();
  });
  it("mailto only for something that looks like an address", () => {
    expect(mailtoHref(" taj@example.com ")).toBe("mailto:taj@example.com");
    expect(mailtoHref("not an email")).toBeNull();
    expect(mailtoHref("")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("groups a 10-digit mobile", () => {
    expect(formatPhone("9876543210")).toBe("98765 43210");
  });
  it("leaves anything else as typed", () => {
    expect(formatPhone("+91 98765 43210")).toBe("+91 98765 43210");
    expect(formatPhone("011 2345 6789")).toBe("011 2345 6789");
  });
});
