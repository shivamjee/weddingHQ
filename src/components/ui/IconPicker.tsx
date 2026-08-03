"use client";

// A grid of emoji for a category or an event, in the same shape as ColourPicker
// (44px radiogroup) so the two sit together in the Setup form without looking
// like two different controls.
//
// The icon is OPTIONAL and additive — "None" is a real choice, and the colour
// picker below it stays required, because every chart in the app fills from the
// colour and cannot fill from an emoji. See src/lib/colours.ts.

import { WEDDING_ICONS } from "@/lib/colours";

export function IconPicker({
  value,
  onChange,
  label = "Icon",
}: {
  /** Empty string means no icon. */
  value: string;
  onChange: (icon: string) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {WEDDING_ICONS.map((icon) => {
          const selected = value === icon;
          return (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={icon}
              onClick={() => onChange(icon)}
              className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-colors ${
                selected ? "bg-rose-50 ring-2 ring-rose-400" : "hover:bg-stone-50"
              }`}
            >
              {icon}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={value === ""}
          onClick={() => onChange("")}
          className={`flex h-11 min-w-11 items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors ${
            value === "" ? "bg-rose-50 text-rose-700 ring-2 ring-rose-400" : "text-stone-500"
          }`}
        >
          None
        </button>
      </div>
    </div>
  );
}
