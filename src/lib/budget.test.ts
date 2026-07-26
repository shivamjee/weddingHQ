import { describe, it, expect } from "vitest";
import { allocationHealth, comparisonRows, sumPaise } from "./budget";

// ₹1L = 10000000 paise.
const L = (lakhs: number) => lakhs * 10000000;

describe("sumPaise", () => {
  it("adds integer paise", () => {
    expect(sumPaise([L(5), L(3), L(2)])).toBe(L(10));
  });
  it("treats a missing amount as zero rather than producing NaN", () => {
    expect(sumPaise([L(5), undefined as unknown as number])).toBe(L(5));
  });
  it("empty is zero", () => {
    expect(sumPaise([])).toBe(0);
  });
});

describe("allocationHealth", () => {
  it("reports the unallocated remainder explicitly", () => {
    // ₹20L budget, ₹13L allocated → ₹7L still unspoken for.
    const h = allocationHealth(L(20), [{ allocatedPaise: L(8) }, { allocatedPaise: L(5) }]);
    expect(h.allocatedPaise).toBe(L(13));
    expect(h.unallocatedPaise).toBe(L(7));
    expect(h.overAllocated).toBe(false);
    expect(h.allocatedPct).toBeCloseTo(65);
  });

  it("goes negative — not to zero — when over-allocated (the §2.6 example)", () => {
    // ₹22L allocated against a ₹20L budget: over-allocated before a rupee is
    // spent. Clamping this at zero would hide exactly the problem to surface.
    const h = allocationHealth(L(20), [{ allocatedPaise: L(22) }]);
    expect(h.unallocatedPaise).toBe(L(-2));
    expect(h.overAllocated).toBe(true);
    expect(h.allocatedPct).toBeCloseTo(110);
  });

  it("exactly on budget is not over-allocated", () => {
    const h = allocationHealth(L(20), [{ allocatedPaise: L(20) }]);
    expect(h.unallocatedPaise).toBe(0);
    expect(h.overAllocated).toBe(false);
  });

  it("no budget set yet: no division by zero, no Infinity bar", () => {
    const h = allocationHealth(0, [{ allocatedPaise: L(3) }]);
    expect(h.noBudgetSet).toBe(true);
    expect(h.allocatedPct).toBe(0);
    expect(h.overAllocated).toBe(false); // "over" is meaningless without a ceiling
    expect(Number.isFinite(h.allocatedPct)).toBe(true);
  });

  it("no allocations yet: the whole budget is unallocated", () => {
    const h = allocationHealth(L(20), []);
    expect(h.allocatedPaise).toBe(0);
    expect(h.unallocatedPaise).toBe(L(20));
  });

  it("stays exact at lakh scale — no float drift", () => {
    const h = allocationHealth(
      L(30),
      Array.from({ length: 7 }, () => ({ allocatedPaise: 4285714 })),
    );
    expect(Number.isInteger(h.allocatedPaise)).toBe(true);
    expect(h.allocatedPaise).toBe(4285714 * 7);
    expect(h.unallocatedPaise).toBe(L(30) - 4285714 * 7);
  });
});

describe("comparisonRows", () => {
  const categories = [
    { id: "venue", name: "Venue", colour: "#3b82f6" },
    { id: "food", name: "Food", colour: "#f97316" },
    { id: "transport", name: "Transport", colour: "#14b8a6" },
  ];

  it("pairs each side against a category, in the categories' own order", () => {
    const rows = comparisonRows(categories, [
      { side: "a", categoryId: "venue", allocatedPaise: L(8) },
      { side: "b", categoryId: "venue", allocatedPaise: L(12) },
      { side: "b", categoryId: "food", allocatedPaise: L(9) },
    ]);
    expect(rows.map((r) => r.categoryId)).toEqual(["venue", "food", "transport"]);
    expect(rows[0]).toMatchObject({ a: L(8), b: L(12), totalPaise: L(20) });
    expect(rows[1]).toMatchObject({ a: 0, b: L(9) });
  });

  it("keeps a category NEITHER side has budgeted for", () => {
    // The ₹0 row is the point: "nobody has budgeted for transport" is only
    // visible if the row survives.
    const rows = comparisonRows(categories, []);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ name: "Transport", a: 0, b: 0, totalPaise: 0 });
  });

  it("ignores an allocation pointing at a deleted category", () => {
    const rows = comparisonRows(categories, [
      { side: "a", categoryId: "deleted-one", allocatedPaise: L(5) },
    ]);
    expect(rows.every((r) => r.totalPaise === 0)).toBe(true);
  });
});
