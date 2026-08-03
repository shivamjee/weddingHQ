/**
 * categories/{categoryId} — a shared label like Decor, Venue, Food, Transport,
 * Attire, Jewellery (FEATURES.md §1.2). Deliberately has NO budget amount:
 * budgets are per side and live in their own collection (Phase 2). A category is
 * just a label shared by both sides. Writable by any member of the wedding.
 */
export interface Category {
  name: string;
  colour: string; // hex; one of the PALETTE swatches in src/lib/colours.ts
  /** Optional emoji from WEDDING_ICONS, shown instead of the colour dot in
   *  lists and chips. Optional because documents written before it existed
   *  simply don't have the field — never assume it is present. The colour stays
   *  required regardless: charts fill from it and cannot fill from an emoji. */
  icon?: string;
  order: number;
}

/** A category document paired with its id, which the doc itself doesn't carry.
 *  Budget allocation ids are built from this id (`{side}_{categoryId}`). */
export interface CategoryWithId extends Category {
  id: string;
}
