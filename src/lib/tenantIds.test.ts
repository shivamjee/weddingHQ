import { describe, expect, it } from "vitest";
import { membershipId, slugifyTenantName } from "./tenantIds";

// These ids end up in Firestore document paths AND are rebuilt inside
// firestore.rules, so their exact shape is a contract, not an implementation
// detail. tests/rules/firestore.rules.test.ts imports membershipId directly to
// prove the rules agree; these tests pin the string shape itself.

describe("membershipId", () => {
  it("joins tenant and email with a double underscore", () => {
    expect(membershipId("shivam-swara", "mum@gmail.com")).toBe("shivam-swara__mum@gmail.com");
  });

  it("lowercases and trims the email, so one person is never invited twice", () => {
    expect(membershipId("shivam-swara", "  Mum@Gmail.COM ")).toBe("shivam-swara__mum@gmail.com");
  });

  it("survives an email containing a single underscore", () => {
    // The separator is two underscores precisely so this stays unambiguous.
    expect(membershipId("t1", "a_b@example.com")).toBe("t1__a_b@example.com");
  });
});

describe("slugifyTenantName", () => {
  it("turns a wedding name into a readable url segment", () => {
    expect(slugifyTenantName("Shivam & Swara")).toBe("shivam-swara");
  });

  it("strips accents and punctuation", () => {
    expect(slugifyTenantName("Zoë & José's Wedding!")).toBe("zoe-jose-s-wedding");
  });

  it("never produces a slash, which would escape the tenant path", () => {
    expect(slugifyTenantName("a/b/../c")).not.toContain("/");
  });

  it("collapses separators and trims them from the ends", () => {
    expect(slugifyTenantName("  --Alex   &&  Sam--  ")).toBe("alex-sam");
  });
});
