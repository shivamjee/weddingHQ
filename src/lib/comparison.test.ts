import { describe, it, expect } from "vitest";
import {
  bestOptionIds,
  betterDirection,
  criterionId,
  formatValue,
  numericValue,
  weightedScores,
} from "./comparison";
import type { Criterion } from "@/types";

const c = (over: Partial<Criterion> & Pick<Criterion, "id" | "type">): Criterion => ({
  label: over.id,
  weight: 3,
  source: "human",
  ...over,
});

describe("betterDirection", () => {
  it("money is cheapest-wins, rating and number are highest-wins", () => {
    expect(betterDirection(c({ id: "cost", type: "money" }))).toBe("lower");
    expect(betterDirection(c({ id: "stars", type: "rating" }))).toBe("higher");
    expect(betterDirection(c({ id: "capacity", type: "number" }))).toBe("higher");
  });

  it("text and boolean have no winner", () => {
    // "Has parking: yes" is not universally better than "no" — the label would
    // have to say so, and it might not.
    expect(betterDirection(c({ id: "dates", type: "text" }))).toBeNull();
    expect(betterDirection(c({ id: "ac", type: "boolean" }))).toBeNull();
  });

  it("an explicit betterIs overrides the type default", () => {
    // The case this exists for: nearer is better, but distance is a number, so
    // the default would mark the FARTHEST venue as best.
    expect(betterDirection(c({ id: "distance", type: "number", betterIs: "lower" }))).toBe("lower");
  });
});

describe("numericValue", () => {
  it("reads numbers and numeric strings", () => {
    expect(numericValue(1800)).toBe(1800);
    expect(numericValue("1800")).toBe(1800);
  });
  it("blank and missing are null, NOT zero", () => {
    // Treating a blank as 0 would make the option nobody has filled in win
    // every cheapest-price comparison.
    expect(numericValue(undefined)).toBeNull();
    expect(numericValue("")).toBeNull();
  });
  it("booleans and non-numeric text are null", () => {
    expect(numericValue(true)).toBeNull();
    expect(numericValue("about 500")).toBeNull();
  });
});

describe("bestOptionIds", () => {
  const options = [
    { id: "taj", values: { cost: 180000, capacity: 500 } },
    { id: "oberoi", values: { cost: 250000, capacity: 800 } },
    { id: "leela", values: { cost: 150000, capacity: 300 } },
  ];

  it("cheapest wins on money", () => {
    expect([...bestOptionIds(c({ id: "cost", type: "money" }), options)]).toEqual(["leela"]);
  });

  it("largest wins on a plain number", () => {
    expect([...bestOptionIds(c({ id: "capacity", type: "number" }), options)]).toEqual(["oberoi"]);
  });

  it("a tie marks every option that ties", () => {
    const tied = [
      { id: "a", values: { cost: 100 } },
      { id: "b", values: { cost: 100 } },
      { id: "c", values: { cost: 200 } },
    ];
    expect([...bestOptionIds(c({ id: "cost", type: "money" }), tied)].sort()).toEqual(["a", "b"]);
  });

  it("options with no value simply don't compete", () => {
    const partial = [
      { id: "a", values: { cost: 500 } },
      { id: "b", values: {} },
      { id: "c", values: { cost: 900 } },
    ];
    expect([...bestOptionIds(c({ id: "cost", type: "money" }), partial)]).toEqual(["a"]);
  });

  it("nothing is highlighted when only one option has a value", () => {
    // "Best of one" is not information.
    const lonely = [
      { id: "a", values: { cost: 500 } },
      { id: "b", values: {} },
    ];
    expect(bestOptionIds(c({ id: "cost", type: "money" }), lonely).size).toBe(0);
  });

  it("nothing is highlighted for an unorderable criterion", () => {
    const rows = [
      { id: "a", values: { dates: "March" } },
      { id: "b", values: { dates: "April" } },
    ];
    expect(bestOptionIds(c({ id: "dates", type: "text" }), rows).size).toBe(0);
  });
});

describe("weightedScores", () => {
  const criteria = [
    c({ id: "cost", type: "money", weight: 5 }),
    c({ id: "capacity", type: "number", weight: 5 }),
  ];

  it("best on everything scores 100, worst scores 0", () => {
    const options = [
      { id: "best", values: { cost: 100, capacity: 900 } },
      { id: "worst", values: { cost: 500, capacity: 100 } },
    ];
    const scores = new Map(weightedScores(criteria, options).map((s) => [s.optionId, s.score]));
    expect(scores.get("best")).toBe(100);
    expect(scores.get("worst")).toBe(0);
  });

  it("weight actually shifts the result", () => {
    const options = [
      { id: "cheap-small", values: { cost: 100, capacity: 100 } },
      { id: "dear-big", values: { cost: 500, capacity: 900 } },
    ];
    const costHeavy = weightedScores(
      [
        c({ id: "cost", type: "money", weight: 5 }),
        c({ id: "capacity", type: "number", weight: 1 }),
      ],
      options,
    );
    const sizeHeavy = weightedScores(
      [
        c({ id: "cost", type: "money", weight: 1 }),
        c({ id: "capacity", type: "number", weight: 5 }),
      ],
      options,
    );
    const cheapUnderCost = costHeavy.find((s) => s.optionId === "cheap-small")!.score!;
    const cheapUnderSize = sizeHeavy.find((s) => s.optionId === "cheap-small")!.score!;
    expect(cheapUnderCost).toBeGreaterThan(cheapUnderSize);
  });

  it("a missing value doesn't count against an option", () => {
    // Otherwise the half-filled-in option always looks worst, which says
    // something about the data entry, not the venue.
    const options = [
      { id: "full", values: { cost: 500, capacity: 900 } },
      { id: "partial", values: { capacity: 900 } },
    ];
    const partial = weightedScores(criteria, options).find((s) => s.optionId === "partial")!;
    expect(partial.score).toBe(100); // scored only on capacity, where it ties best
  });

  it("null when there is nothing comparable at all", () => {
    const scores = weightedScores(
      [c({ id: "dates", type: "text" })],
      [{ id: "a", values: { dates: "March" } }],
    );
    expect(scores[0].score).toBeNull();
  });

  it("identical values across options don't divide by zero", () => {
    const options = [
      { id: "a", values: { cost: 100 } },
      { id: "b", values: { cost: 100 } },
    ];
    const scores = weightedScores(criteria, options);
    expect(scores.every((s) => s.score === 100)).toBe(true);
  });
});

describe("formatValue", () => {
  it("money goes through the paise formatter", () => {
    expect(formatValue(180000, "money")).toBe("₹1,800");
  });
  it("blank renders as a dash, never as zero", () => {
    expect(formatValue(undefined, "money")).toBe("—");
    expect(formatValue("", "number")).toBe("—");
  });
  it("booleans and ratings read as words", () => {
    expect(formatValue(true, "boolean")).toBe("Yes");
    expect(formatValue(false, "boolean")).toBe("No");
    expect(formatValue(4, "rating")).toBe("4 / 5");
  });
});

describe("criterionId", () => {
  it("slugs the label", () => {
    expect(criterionId("Per-plate cost", [])).toBe("per-plate-cost");
  });
  it("avoids collisions", () => {
    expect(criterionId("Parking", ["parking"])).toBe("parking-2");
  });
  it("falls back for a label with no ASCII", () => {
    expect(criterionId("मंडप", [])).toMatch(/^c-/);
  });
});
