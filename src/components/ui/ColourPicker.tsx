"use client";

// A row of fixed palette swatches. See src/lib/colours.ts for why the palette is
// fixed rather than a free hex input: a category's colour is reused by every
// chart in the app, so two near-identical greens would quietly break the
// side-by-side budget comparison that Phase 2 exists to support.

import { PALETTE } from "@/lib/colours";

export function ColourPicker({
  value,
  onChange,
  label = "Colour",
}: {
  value: string;
  onChange: (colour: string) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {PALETTE.map((colour) => {
          const selected = value?.toLowerCase() === colour.toLowerCase();
          return (
            <button
              key={colour}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={colour}
              onClick={() => onChange(colour)}
              // 44px outer tap target with a smaller visible dot inside — the
              // swatch looks compact but is still comfortably tappable.
              className="flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span
                className={`block rounded-full transition-all ${
                  selected ? "h-8 w-8 ring-2 ring-stone-800 ring-offset-2" : "h-7 w-7"
                }`}
                style={{ backgroundColor: colour }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
