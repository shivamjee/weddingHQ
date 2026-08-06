"use client";

// Shared form primitives for Phase 2.
//
// Phase 2 adds a lot of forms (categories, events, budgets, contacts, questions,
// comparisons) and they all have the same audience: parents and in-laws, on a
// phone, of varying eyesight. Rather than repeat the class strings and get the
// tap target subtly wrong on the fifth screen, the sizes live here:
//   • inputs are 48px tall, buttons and chips at least 44px (CLAUDE.md UX rules)
//   • text is 16px (`text-base`) — anything smaller makes iOS Safari zoom the
//     whole page on focus, which reads as the app jumping about
//   • the palette is the established warm rose / stone / white one

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

const inputClass =
  "min-h-[48px] w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-800 outline-none placeholder:text-stone-300 focus:border-rose-400 disabled:bg-stone-50 disabled:text-stone-400";

/** Label + control. `hint` is for the one-line explanations non-technical users
 *  need but experienced ones can skim past. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      {children}
      {hint ? <span className="text-xs text-stone-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${inputClass} py-2 leading-relaxed ${props.className ?? ""}`}
    />
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Optional colour dot — used for category / event chips so the chip carries
   *  the same colour the charts use. */
  colour?: string;
  /** Optional emoji, shown INSTEAD of the colour dot when set. Categories and
   *  events carry one; an emoji is quicker to recognise than a coloured dot,
   *  especially once there are eight of them. */
  icon?: string;
}

/** The colour dot / emoji that prefixes a chip or a list row. One place, so the
 *  "icon wins over colour" rule can't drift between screens. */
export function OptionMark({
  colour,
  icon,
  className = "h-2.5 w-2.5",
}: {
  colour?: string;
  icon?: string;
  /** Sizing for the colour-dot form. The emoji sizes itself off the text. */
  className?: string;
}) {
  if (icon) {
    return (
      <span className="shrink-0 leading-none" aria-hidden>
        {icon}
      </span>
    );
  }
  if (!colour) return null;
  return (
    <span
      className={`shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: colour }}
      aria-hidden
    />
  );
}

/**
 * A horizontal row of chips, used everywhere a dropdown would otherwise appear.
 * CLAUDE.md is explicit about this: chips, not `<select>`. A native select on a
 * phone opens a modal wheel that hides the rest of the form, and it gives no
 * hint of how many options exist.
 *
 * Set `allowClear` to make tapping the selected chip deselect it — that is the
 * "no category" case, which is legitimate for contacts and questions.
 */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  allowClear = false,
  emptyLabel,
}: {
  label?: string;
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowClear?: boolean;
  /** Shown instead of the chips when there are no options to choose from. */
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs font-medium text-stone-500">{label}</span> : null}
      {options.length === 0 && emptyLabel ? (
        <p className="text-sm text-stone-400">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const selected = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(selected && allowClear ? null : o.value)}
                className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                  selected
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-stone-300 text-stone-600"
                }`}
              >
                <OptionMark colour={o.colour} icon={o.icon} />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Multi-select variant — events on a contact, for example, where one vendor
 *  covers the Sangeet and the Reception but not the Mehendi. */
export function ChipMultiRow<T extends string>({
  label,
  options,
  values,
  onChange,
  emptyLabel,
}: {
  label?: string;
  options: ChipOption<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="text-xs font-medium text-stone-500">{label}</span> : null}
      {options.length === 0 && emptyLabel ? (
        <p className="text-sm text-stone-400">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const selected = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange(selected ? values.filter((v) => v !== o.value) : [...values, o.value])
                }
                className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
                  selected
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-stone-300 text-stone-600"
                }`}
              >
                <OptionMark colour={o.colour} icon={o.icon} />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible filter drawer for the list screens.
 *
 * Three unlabelled chip rows stacked at the top of Questions were most of the
 * screen on a phone, and gave no hint of which row filtered what. This folds
 * them behind one 44px row that reports how many filters are on.
 *
 * Native `<details>` on purpose — the open/closed state, the keyboard handling
 * and the disclosure semantics are all free, and no filter state has to move up
 * into React.
 *
 * Deliberately UNCONTROLLED: forcing it open whenever a filter is active would
 * leave it permanently open on Questions, whose status filter defaults to
 * "open". The count badge is what stops a filtered list from looking unfiltered.
 */
export function FilterPanel({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <details className="rounded-2xl border border-stone-200 bg-white [&[open]>summary]:border-b [&[open]>summary]:border-stone-100">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-stone-400 transition-transform">
          &#9662;
        </span>
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
            {activeCount}
          </span>
        ) : null}
        {activeCount > 0 ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              // Inside <summary>, so a plain click would also toggle the drawer.
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onClear();
            }}
            className="ml-auto min-h-[44px] shrink-0 px-2 py-3 text-sm font-medium text-rose-600"
          >
            Clear
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </details>
  );
}

/**
 * Generic disclosure. Same native `<details>` reasoning as `FilterPanel` above —
 * open/closed state, keyboard handling and semantics all free, nothing lifted
 * into React.
 *
 * The load-bearing use is the household form's "More details" (PHASE3 Step 1):
 * five fields visible and the other twelve folded away is the difference between
 * a guest list that gets filled in and one that doesn't.
 */
export function Expander({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-stone-200 bg-white [&[open]>summary]:border-b [&[open]>summary]:border-stone-100"
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-stone-400">
          &#9662;
        </span>
        {summary}
      </summary>
      <div className="flex flex-col gap-3 px-4 py-3">{children}</div>
    </details>
  );
}

export function PrimaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`min-h-[48px] shrink-0 whitespace-nowrap rounded-full bg-rose-500 px-5 text-base font-semibold text-white transition-opacity disabled:opacity-40 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`min-h-[48px] shrink-0 whitespace-nowrap rounded-full border border-stone-300 px-5 text-base font-medium text-stone-700 transition-colors hover:border-stone-400 disabled:opacity-40 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** A tap-to-call / WhatsApp / email pill. Only ever rendered when the
 *  underlying value actually parses to a link (see src/lib/phone.ts) — a
 *  dead tap that opens a dialler on nothing is worse than no link at all. */
export function ActionLink({
  href,
  label,
  external = false,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex min-h-[44px] items-center rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:border-stone-400"
    >
      {label}
    </a>
  );
}

/** Inline error / success line, so every screen reports the same way. */
export function FormMessage({
  error,
  success,
}: {
  error?: string | null;
  success?: string | null;
}) {
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (success) return <p className="text-sm text-emerald-700">{success}</p>;
  return null;
}
