/**
 * categories/{categoryId} — a shared label like Decor, Venue, Food, Transport,
 * Attire, Jewellery (FEATURES.md §1.2). Deliberately has NO budget amount:
 * budgets are per side and live in their own collection (Phase 2). A category is
 * just a label shared by both sides. Writable only by role=="couple".
 */
export interface Category {
  name: string;
  colour: string; // hex; one of the PALETTE swatches in src/lib/colours.ts
  order: number;
}

/** A category document paired with its id, which the doc itself doesn't carry.
 *  Budget allocation ids are built from this id (`{side}_{categoryId}`). */
export interface CategoryWithId extends Category {
  id: string;
}
