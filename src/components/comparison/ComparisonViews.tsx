"use client";

// The two ways of reading a comparison (FEATURES.md §3.2, PHASE2 Step 5):
// cards on a phone, a table on a wider screen. This is explicitly called out as
// the hard part on mobile, and the reason is simple — a table with six criteria
// and four venues does not fit in 375px, and shrinking the text until it does
// makes it unreadable for exactly the people who need it most.
//
// CARDS: one option per card, criteria as label/value rows, swiped between with
// native scroll-snap. No JS carousel: the browser's own snap scrolling handles
// momentum, accessibility and reduced-motion correctly, and it degrades to a
// plain scrollable row if anything about it is unsupported.
//
// TABLE: options as columns, criteria as rows, first column sticky so the
// criterion label stays visible while scrolling sideways through venues.

import { bestOptionIds, formatValue, weightedScores } from "@/lib/comparison";
import { AiChip } from "@/components/comparison/ValueInput";
import {
  OPTION_STATUS_LABELS,
  type ComparisonOptionWithId,
  type Criterion,
  type OptionStatus,
} from "@/types";

const STATUS_STYLES: Record<OptionStatus, string> = {
  considering: "bg-stone-100 text-stone-600",
  shortlisted: "bg-amber-100 text-amber-800",
  rejected: "bg-stone-100 text-stone-400 line-through",
  booked: "bg-emerald-100 text-emerald-700",
};

interface ViewProps {
  criteria: Criterion[];
  options: ComparisonOptionWithId[];
  highlightBest: boolean;
  showScores: boolean;
  onEdit: (option: ComparisonOptionWithId) => void;
}

/** Winner ids per criterion, computed once for the whole view. */
function computeWinners(
  criteria: Criterion[],
  options: ComparisonOptionWithId[],
  enabled: boolean,
) {
  if (!enabled) return new Map<string, Set<string>>();
  return new Map(criteria.map((c) => [c.id, bestOptionIds(c, options)]));
}

// ---------------------------------------------------------------------------

export function CardsView({ criteria, options, highlightBest, showScores, onEdit }: ViewProps) {
  const winners = computeWinners(criteria, options, highlightBest);
  const scores = new Map(weightedScores(criteria, options).map((s) => [s.optionId, s.score]));

  return (
    <div
      // Negative margin + matching padding lets the cards run to the screen
      // edges while the page keeps its normal gutter, so the next card peeks in
      // and the row is visibly swipeable.
      className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2"
      style={{ scrollbarWidth: "none" }}
    >
      {options.map((option) => (
        <article
          key={option.id}
          className="flex w-[86%] shrink-0 snap-center flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-stone-800">{option.name}</h3>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  STATUS_STYLES[option.status] ?? STATUS_STYLES.considering
                }`}
              >
                {OPTION_STATUS_LABELS[option.status] ?? "Considering"}
              </span>
            </div>
            <button
              onClick={() => onEdit(option)}
              className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-stone-800"
            >
              Edit
            </button>
          </div>

          {option.summary ? (
            <p className="text-sm leading-relaxed text-stone-600">{option.summary}</p>
          ) : null}

          {showScores && scores.get(option.id) !== null ? (
            <p className="text-xs text-stone-400">
              Weighted score{" "}
              <strong className="font-semibold text-stone-600">{scores.get(option.id)}</strong> /
              100
            </p>
          ) : null}

          <dl className="flex flex-col divide-y divide-stone-100">
            {criteria.map((criterion) => {
              const value = option.values?.[criterion.id];
              const isBest = winners.get(criterion.id)?.has(option.id) ?? false;
              const meta = option.valueMeta?.[criterion.id];
              return (
                <div key={criterion.id} className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-sm text-stone-500">{criterion.label}</dt>
                  <dd
                    className={`text-right text-sm font-medium ${
                      value === undefined || value === ""
                        ? "text-stone-300"
                        : isBest
                          ? "rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                          : "text-stone-800"
                    }`}
                  >
                    {formatValue(value, criterion.type)}
                    {meta?.source === "ai" ? <AiChip confidence={meta.confidence} /> : null}
                  </dd>
                </div>
              );
            })}
          </dl>

          {option.notes ? (
            <p className="text-sm whitespace-pre-wrap text-stone-500">{option.notes}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TableView({ criteria, options, highlightBest, showScores, onEdit }: ViewProps) {
  const winners = computeWinners(criteria, options, highlightBest);
  const scores = new Map(weightedScores(criteria, options).map((s) => [s.optionId, s.score]));

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {/* Sticky first column: the criterion label has to stay put, or
                scrolling three venues sideways leaves you looking at numbers
                with no idea what they measure. */}
            <th className="sticky left-0 z-10 min-w-[132px] border-b border-stone-200 bg-white px-2 py-2 text-left font-medium text-stone-400">
              Criterion
            </th>
            {options.map((option) => (
              <th
                key={option.id}
                className="min-w-[124px] border-b border-stone-200 px-2 py-2 text-left align-bottom"
              >
                <button
                  onClick={() => onEdit(option)}
                  className="text-left font-semibold text-stone-800 hover:text-rose-600"
                >
                  {option.name}
                </button>
                <span
                  className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    STATUS_STYLES[option.status] ?? STATUS_STYLES.considering
                  }`}
                >
                  {OPTION_STATUS_LABELS[option.status] ?? "Considering"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map((criterion) => (
            <tr key={criterion.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-stone-100 bg-white px-2 py-2 text-left font-normal text-stone-500"
              >
                {criterion.label}
              </th>
              {options.map((option) => {
                const value = option.values?.[criterion.id];
                const isBest = winners.get(criterion.id)?.has(option.id) ?? false;
                const meta = option.valueMeta?.[criterion.id];
                return (
                  <td
                    key={option.id}
                    className={`border-b border-stone-100 px-2 py-2 ${
                      value === undefined || value === ""
                        ? "text-stone-300"
                        : isBest
                          ? "bg-emerald-50 font-semibold text-emerald-700"
                          : "text-stone-800"
                    }`}
                  >
                    {formatValue(value, criterion.type)}
                    {meta?.source === "ai" ? <AiChip confidence={meta.confidence} /> : null}
                  </td>
                );
              })}
            </tr>
          ))}

          {showScores ? (
            <tr>
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-normal text-stone-400"
              >
                Weighted score
              </th>
              {options.map((option) => (
                <td key={option.id} className="px-2 py-2 text-stone-500">
                  {scores.get(option.id) ?? "—"}
                </td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
