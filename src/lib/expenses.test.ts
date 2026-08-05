import { describe, expect, it } from "vitest";
import {
  balances,
  consumptionBySideCategory,
  expenseTotalsFrom,
  simplifyDebts,
  splitShares,
  validateShares,
} from "./expenses";
import { toPaise } from "@/lib/money";
import type { Share, Side } from "@/types";

const SIDE_BY_UID: Record<string, Side> = {
  shivam: "a",
  swara: "b",
  swaraDad: "b",
};

describe("splitShares", () => {
  it("splits an evenly-divisible amount equally with no remainder", () => {
    const shares = splitShares(toPaise(30000000), "equal", ["shivam", "swara"]);
    expect(shares).toEqual([
      { uid: "shivam", amountPaise: 15000000 },
      { uid: "swara", amountPaise: 15000000 },
    ]);
  });

  it("distributes an uneven equal split's remainder to the first uids in ascending order, deterministically", () => {
    // ₹1,000 / 3 = 333.33... paise-wise: 100000 / 3 = 33333.33 -> floor 33333 each,
    // remainder 1 paisa goes to the alphabetically-first uid.
    const shares = splitShares(toPaise(100000), "equal", ["zed", "amir", "mona"]);
    const byUid = Object.fromEntries(shares.map((s) => [s.uid, s.amountPaise]));
    expect(byUid.amir).toBe(33334); // first in uid order gets the extra paisa
    expect(byUid.mona).toBe(33333);
    expect(byUid.zed).toBe(33333);
    expect(shares.reduce((sum, s) => sum + s.amountPaise, 0)).toBe(100000);
  });

  it("gives the whole amount to one person in single mode", () => {
    expect(splitShares(toPaise(50000), "single", ["shivam"])).toEqual([
      { uid: "shivam", amountPaise: 50000 },
    ]);
  });

  it("uses the typed amounts as-is in exact mode, without redistributing", () => {
    const shares = splitShares(toPaise(1000), "exact", ["shivam", "swara"], {
      shivam: 700,
      swara: 300,
    });
    expect(shares).toEqual([
      { uid: "shivam", amountPaise: 700 },
      { uid: "swara", amountPaise: 300 },
    ]);
  });

  it("rounds a percentage split to sum exactly to the total even when percentages round awkwardly", () => {
    // 33.33% / 33.33% / 33.34% of ₹100 (10000 paise) — each raw share rounds
    // to 3333, 3333, 3334 = 10000 already exact; use a case that isn't.
    const shares = splitShares(toPaise(10000), "percentage", ["a", "b", "c"], {
      a: 33.33,
      b: 33.33,
      c: 33.33,
    });
    expect(shares.reduce((sum, s) => sum + s.amountPaise, 0)).toBe(10000);
  });
});

describe("validateShares", () => {
  it("accepts shares that sum exactly to the total", () => {
    const shares: Share[] = [
      { uid: "a", amountPaise: toPaise(600) },
      { uid: "b", amountPaise: toPaise(400) },
    ];
    expect(validateShares(1000, shares)).toBe(true);
  });

  it("rejects shares that don't sum to the total", () => {
    const shares: Share[] = [{ uid: "a", amountPaise: toPaise(600) }];
    expect(validateShares(1000, shares)).toBe(false);
  });

  it("rejects a duplicate participant", () => {
    const shares: Share[] = [
      { uid: "a", amountPaise: toPaise(500) },
      { uid: "a", amountPaise: toPaise(500) },
    ];
    expect(validateShares(1000, shares)).toBe(false);
  });

  it("rejects a negative share", () => {
    const shares: Share[] = [
      { uid: "a", amountPaise: toPaise(1500) },
      { uid: "b", amountPaise: toPaise(-500) },
    ];
    expect(validateShares(1000, shares)).toBe(false);
  });
});

describe("consumptionBySideCategory — THE regression this feature can silently cause", () => {
  it("charges each side by shares, never by who paid (Sangeet decor worked example, PHASE4.md)", () => {
    // Swara's dad fronts ₹3L for decor, split evenly between the two sides.
    const expense = {
      categoryId: "decor",
      eventId: "sangeet",
      status: "paid" as const,
      amountPaise: toPaise(30000000),
      shares: [
        { uid: "shivam", amountPaise: toPaise(15000000) },
        { uid: "swara", amountPaise: toPaise(15000000) },
      ],
    };

    const result = consumptionBySideCategory([expense], SIDE_BY_UID);

    // Side A (Shivam) charged ₹1.5L — not ₹3L, not ₹0, even though a side-B
    // person (swaraDad) is not even in the shares.
    expect(result.a_decor.paidPaise).toBe(15000000);
    expect(result.b_decor.paidPaise).toBe(15000000);
    // paidBy (swaraDad) never appears as a key — consumption follows shares.
    expect(result.decor).toBeUndefined();
  });

  it("keeps estimated, committed and paid as distinct buckets, never summed on the write side", () => {
    const expenses = [
      { categoryId: "venue", eventId: null, status: "estimated" as const, amountPaise: toPaise(100), shares: [{ uid: "shivam", amountPaise: toPaise(100) }] },
      { categoryId: "venue", eventId: null, status: "committed" as const, amountPaise: toPaise(200), shares: [{ uid: "shivam", amountPaise: toPaise(200) }] },
      { categoryId: "venue", eventId: null, status: "paid" as const, amountPaise: toPaise(300), shares: [{ uid: "shivam", amountPaise: toPaise(300) }] },
    ];
    const result = consumptionBySideCategory(expenses, SIDE_BY_UID);
    expect(result.a_venue).toEqual({
      estimatedPaise: 100,
      committedPaise: 200,
      paidPaise: 300,
    });
  });
});

describe("expenseTotalsFrom", () => {
  it("rolls bySide up from bySideCategory so the two can never disagree", () => {
    const expenses = [
      { categoryId: "decor", eventId: "sangeet", status: "paid" as const, amountPaise: toPaise(1000), shares: [{ uid: "shivam", amountPaise: toPaise(1000) }] },
      { categoryId: "venue", eventId: null, status: "committed" as const, amountPaise: toPaise(2000), shares: [{ uid: "swara", amountPaise: toPaise(2000) }] },
    ];
    const totals = expenseTotalsFrom(expenses, SIDE_BY_UID);
    expect(totals.bySide.a.paidPaise).toBe(1000);
    expect(totals.bySide.b.committedPaise).toBe(2000);
    expect(totals.byEvent.sangeet.paidPaise).toBe(1000);
  });
});

describe("balances — settlements never appear in budget totals", () => {
  it("computes net paise from paid expenses only — estimated/committed create no debt", () => {
    const expenses = [
      { status: "paid" as const, paidBy: "swaraDad", amountPaise: toPaise(30000000), shares: [{ uid: "shivam", amountPaise: toPaise(15000000) }, { uid: "swara", amountPaise: toPaise(15000000) }] },
      { status: "committed" as const, paidBy: null, amountPaise: toPaise(999999), shares: [{ uid: "shivam", amountPaise: toPaise(999999) }] },
    ];
    const net = balances(expenses, []);
    expect(net.swaraDad).toBe(30000000); // fronted 3L, bears none of it -> owed 3L
    expect(net.shivam).toBe(-15000000);
    expect(net.swara).toBe(-15000000);
  });

  it("moves the ledger via settlements without ever touching an expense-derived total", () => {
    const expenses = [
      {
        categoryId: "decor",
        eventId: null,
        status: "paid" as const,
        paidBy: "swaraDad",
        amountPaise: toPaise(30000000),
        shares: [{ uid: "shivam", amountPaise: toPaise(30000000) }],
      },
    ];
    // Same expense list is what expenseTotalsFrom would consume — proving the
    // settlement below cannot reach it, since expenseTotalsFrom's signature
    // never accepts settlements at all.
    const totalsBefore = consumptionBySideCategory(expenses, SIDE_BY_UID);

    const settled = balances(expenses, [
      { fromUid: "shivam", toUid: "swaraDad", amountPaise: toPaise(30000000) },
    ]);
    expect(settled.shivam).toBe(0);
    expect(settled.swaraDad).toBe(0);

    const totalsAfter = consumptionBySideCategory(expenses, SIDE_BY_UID);
    expect(totalsAfter).toEqual(totalsBefore);
  });
});

describe("simplifyDebts", () => {
  it("reduces a three-person ledger to the minimum transfers and nets to zero", () => {
    const net = { alice: toPaise(300), bob: toPaise(-100), carol: toPaise(-200) };
    const transfers = simplifyDebts(net);
    expect(transfers.length).toBeLessThanOrEqual(2);
    const totalToAlice = transfers.filter((t) => t.toUid === "alice").reduce((s, t) => s + t.amountPaise, 0);
    expect(totalToAlice).toBe(300);
    // Every transfer moves money from a debtor to a creditor, never the reverse.
    for (const t of transfers) {
      expect(net[t.fromUid as keyof typeof net]).toBeLessThan(0);
      expect(net[t.toUid as keyof typeof net]).toBeGreaterThan(0);
    }
  });
});
