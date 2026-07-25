/**
 * categories/{categoryId} — a shared label like Decor, Venue, Food, Transport,
 * Attire, Jewellery (FEATURES.md §1.2). Deliberately has NO budget amount:
 * budgets are per side and live in their own collection (Phase 2). A category is
 * just a label shared by both sides. Writable only by role=="couple".
 */
export interface Category {
  name: string;
  colour: string; // hex
  order: number;
}
