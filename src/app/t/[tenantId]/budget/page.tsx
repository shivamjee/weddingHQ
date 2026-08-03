"use client";

// Budget — per-side allocations and allocation health (PHASE2 Step 2).
//
// PLANNING ONLY. There are no expenses in the app yet (Phase 4), so nothing
// here is "spent" or "remaining after spending". Every number on this screen is
// an intention: what each side plans to put against each category, and how much
// of their ceiling is still unspoken for.
//
// SECURITY: every member of the wedding reads AND writes (firestore.rules
// `budgets`) — each side's parents are the people actually setting that side's
// numbers. The rules' integrity checks (id agrees with fields, integer paise)
// are the real guard here, not a role.
//
// READ COST: one bounded collection read for the whole screen — both sides'
// allocations and both totals live in the same `budgets` collection. Switching
// between the three views re-renders, it does not re-read.

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { getDocs, limit, query, serverTimestamp, setDoc } from "firebase/firestore";
import { BUDGET_TOTALS_PREFIX, budgetDoc, budgetTotalsDoc, budgetsCol } from "@/lib/paths";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import {
  allocationHealth,
  comparisonRows,
  eventBreakdown,
  type CategoryComparisonRow,
  type EventSlice,
} from "@/lib/budget";
import { formatINR, paiseToRupeeInput, parseRupeeInput, toPaise, type Paise } from "@/lib/money";
import { AllocationChart, SidesLegend } from "@/components/budget/AllocationChart";
import { AllocationHealthBar } from "@/components/budget/AllocationHealthBar";
import {
  ChipRow,
  FormMessage,
  OptionMark,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import type { BudgetAllocationWithId, Side } from "@/types";

/** READ COST (CLAUDE.md §3): one document per (side, category), plus an optional
 *  one per (side, category, event) breakdown, plus one totals doc per side. A
 *  realistic wedding is 8 categories × 6 events × 2 sides ≈ 96 event rows + 16
 *  category rows + 2 totals ≈ 114.
 *
 *  A flat 300 rather than MAX_CATEGORIES × MAX_EVENTS × 2: both of those bounds
 *  are 50, which would authorise a 5,000-document read on a screen that should
 *  never approach it. If a wedding ever hits this cap the screen under-reports
 *  rather than running up a bill, which is the right way round. */
const MAX_BUDGET_DOCS = 300;

interface BudgetData {
  allocations: BudgetAllocationWithId[];
  totals: Record<Side, number>;
}

type View = Side | "both";

export default function BudgetPage() {
  const { tenantId, canWrite, sideLabel } = useTenant();
  const { categories, loading: configLoading } = useConfig();
  const [view, setView] = useState<View>("both");

  const load = useCallback(async (): Promise<BudgetData> => {
    const snap = await getDocs(query(budgetsCol(tenantId), limit(MAX_BUDGET_DOCS)));
    const allocations: BudgetAllocationWithId[] = [];
    const totals: Record<Side, number> = { a: 0, b: 0 };

    for (const d of snap.docs) {
      const data = d.data();
      // The two shapes share one collection and are told apart by id prefix —
      // see src/types/budget.ts. firestore.rules enforces that a document's id
      // agrees with its own fields, so trusting the prefix here is safe.
      if (d.id.startsWith(BUDGET_TOTALS_PREFIX)) {
        const side = data.side as Side;
        if (side === "a" || side === "b") totals[side] = Number(data.totalBudgetPaise) || 0;
      } else {
        // `eventId` is absent on documents written before per-event breakdowns
        // existed. Normalise to null here so the maths never has to guess.
        allocations.push({
          id: d.id,
          ...data,
          eventId: data.eventId ?? null,
        } as BudgetAllocationWithId);
      }
    }
    return { allocations, totals };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load the budget.");

  const allocations = useMemo(() => data?.allocations ?? [], [data]);
  const totals = data?.totals ?? { a: 0, b: 0 };

  const rows = useMemo(() => comparisonRows(categories, allocations), [categories, allocations]);

  const health = useMemo(
    () => ({
      a: allocationHealth(
        totals.a,
        allocations.filter((x) => x.side === "a"),
      ),
      b: allocationHealth(
        totals.b,
        allocations.filter((x) => x.side === "b"),
      ),
    }),
    [totals.a, totals.b, allocations],
  );

  const segments = useCallback(
    (side: Side) =>
      rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        colour: r.colour,
        allocatedPaise: r[side],
      })),
    [rows],
  );

  if (configLoading || loading) {
    return <p className="px-5 py-6 text-sm text-stone-400">Loading…</p>;
  }

  // Everything here is per-category, so with no categories there is nothing to
  // allocate against. Point at Setup rather than render empty charts.
  if (categories.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-3xl"
          aria-hidden
        >
          💰
        </div>
        <h1 className="text-xl font-semibold text-stone-800">No categories yet</h1>
        <p className="max-w-xs text-base leading-relaxed text-stone-500">
          Budgets are set per category — Venue, Food, Decor. Add a few and they&rsquo;ll show up
          here for both sides.
        </p>
        {canWrite ? (
          <Link
            href={tenantHref(tenantId, "/more/setup")}
            className="min-h-[48px] rounded-full bg-rose-500 px-5 py-3 text-base font-semibold text-white"
          >
            Go to Setup
          </Link>
        ) : (
          <p className="text-sm text-stone-400">Add categories in Setup to get started.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Budget</h1>
        <p className="mt-1 text-sm text-stone-500">
          What each side plans to spend. Nothing here is money spent yet.
        </p>
      </div>

      <FormMessage error={error} />

      <ChipRow<View>
        options={[
          { value: "both", label: "Both sides" },
          { value: "a", label: sideLabel("a") },
          { value: "b", label: sideLabel("b") },
        ]}
        value={view}
        onChange={(v) => v && setView(v)}
      />

      {view === "both" ? (
        <>
          <section className="flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-4">
            <AllocationHealthBar
              health={health.a}
              segments={segments("a")}
              label={`${sideLabel("a")}'s side`}
            />
            <AllocationHealthBar
              health={health.b}
              segments={segments("b")}
              label={`${sideLabel("b")}'s side`}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">Side by side</h2>
              <p className="mt-0.5 text-sm text-stone-500">
                The same categories, both sides&rsquo; plans against each other.
              </p>
            </div>
            <SidesLegend labelA={sideLabel("a")} labelB={sideLabel("b")} />
            <AllocationChart rows={rows} labelA={sideLabel("a")} labelB={sideLabel("b")} />
          </section>
        </>
      ) : (
        <SideDetail
          side={view}
          totalPaise={totals[view]}
          rows={rows}
          allocations={allocations}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One side: its ceiling, its health bar, and an editable allocation per category
// ---------------------------------------------------------------------------

function SideDetail({
  side,
  totalPaise,
  rows,
  allocations,
  onSaved,
}: {
  side: Side;
  totalPaise: number;
  rows: CategoryComparisonRow[];
  allocations: BudgetAllocationWithId[];
  onSaved: () => void;
}) {
  const { sideLabel } = useTenant();
  const health = allocationHealth(
    totalPaise,
    allocations.filter((x) => x.side === side),
  );

  const segments = rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name,
    colour: r.colour,
    allocatedPaise: r[side],
  }));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4">
        <TotalBudgetEditor side={side} totalPaise={totalPaise} onSaved={onSaved} />
        <AllocationHealthBar
          health={health}
          segments={segments}
          label={`${sideLabel(side)}'s side`}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-stone-800">By category</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <AllocationRow
              key={row.categoryId}
              side={side}
              categoryId={row.categoryId}
              name={row.name}
              colour={row.colour}
              icon={row.icon}
              allocatedPaise={row[side]}
              allocations={allocations}
              onSaved={onSaved}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-stone-800">Where it goes</h2>
        <AllocationChart rows={rows} labelA={sideLabel("a")} labelB={sideLabel("b")} only={side} />
      </section>
    </div>
  );
}

function TotalBudgetEditor({
  side,
  totalPaise,
  onSaved,
}: {
  side: Side;
  totalPaise: number;
  onSaved: () => void;
}) {
  const { tenantId, canWrite, sideLabel } = useTenant();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseRupeeInput(text);

  async function save() {
    if (parsed === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setDoc(budgetTotalsDoc(tenantId, side), {
        side,
        totalBudgetPaise: parsed,
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      console.error("[budget] total save failed:", err);
      setError("Could not save that budget. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-stone-500">
            {sideLabel(side)}&rsquo;s total budget
          </p>
          <p className="text-2xl font-semibold text-stone-800">
            {totalPaise > 0 ? formatINR(toPaise(totalPaise)) : "Not set"}
          </p>
        </div>
        {canWrite ? (
          <SecondaryButton
            onClick={() => {
              setText(totalPaise > 0 ? paiseToRupeeInput(toPaise(totalPaise)) : "");
              setEditing(true);
            }}
          >
            {totalPaise > 0 ? "Change" : "Set"}
          </SecondaryButton>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-stone-500">
          {sideLabel(side)}&rsquo;s total budget, in rupees
        </span>
        <TextInput
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="2000000"
        />
        <span className="text-xs text-stone-400">
          {parsed !== null ? formatINR(parsed) : "Enter a plain number, like 2000000 for ₹20 lakh."}
        </span>
      </label>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <PrimaryButton onClick={save} disabled={parsed === null || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

/**
 * One category's amount for one side, with an optional per-event breakdown
 * folded underneath it (QA #4).
 *
 * The category amount is the CEILING and stays exactly what it was before this
 * feature: tapping the row edits it, and the health bar and charts read it
 * alone. Expanding shows how much of that ceiling has been itemised per event
 * and how much is still unassigned. A wedding that never expands a row sees
 * identical numbers to before.
 */
function AllocationRow({
  side,
  categoryId,
  name,
  colour,
  icon,
  allocatedPaise,
  allocations,
  onSaved,
}: {
  side: Side;
  categoryId: string;
  name: string;
  colour: string;
  icon?: string;
  allocatedPaise: number;
  allocations: BudgetAllocationWithId[];
  onSaved: () => void;
}) {
  const { tenantId, canWrite } = useTenant();
  const { events } = useConfig();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const breakdown = useMemo(
    () => eventBreakdown(side, categoryId, allocatedPaise, events, allocations),
    [side, categoryId, allocatedPaise, events, allocations],
  );

  // Nothing to expand into if the wedding has no events set up at all.
  const expandable = events.length > 0;
  const open = expanded || breakdown.over;

  async function saveCategory(paise: Paise) {
    await setDoc(budgetDoc(tenantId, side, categoryId), {
      side,
      categoryId,
      eventId: null,
      allocatedPaise: paise,
      notes: "",
      updatedAt: serverTimestamp(),
    });
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <li>
        <AmountEditor
          label={
            <>
              <OptionMark colour={colour} icon={icon} />
              {name}, in rupees
            </>
          }
          initialPaise={allocatedPaise}
          onSave={saveCategory}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={!canWrite}
          onClick={() => setEditing(true)}
          className="flex min-h-[60px] flex-1 items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
        >
          <OptionMark colour={colour} icon={icon} className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate text-base font-medium text-stone-800">
            {name}
          </span>
          <span
            className={`shrink-0 text-base font-semibold ${
              allocatedPaise > 0 ? "text-stone-800" : "text-stone-300"
            }`}
          >
            {allocatedPaise > 0 ? formatINR(toPaise(allocatedPaise)) : "—"}
          </span>
        </button>
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${name} by event`}
            onClick={() => setExpanded((v) => !v)}
            className={`flex min-h-[60px] w-11 shrink-0 items-center justify-center text-sm ${
              breakdown.any || breakdown.over ? "text-rose-500" : "text-stone-300"
            }`}
          >
            <span aria-hidden className={open ? "rotate-180" : ""}>
              &#9662;
            </span>
          </button>
        ) : null}
      </div>

      {expandable && open ? (
        <div className="border-t border-stone-100 bg-stone-50/60 px-4 py-2">
          <ul>
            {breakdown.perEvent.map((slice) => (
              <EventAmountRow
                key={slice.eventId}
                side={side}
                categoryId={categoryId}
                slice={slice}
                onSaved={onSaved}
              />
            ))}
          </ul>
          <div
            className={`flex items-center justify-between gap-3 border-t border-stone-200 py-2 text-sm ${
              breakdown.over ? "font-semibold text-rose-600" : "text-stone-500"
            }`}
          >
            <span>{breakdown.over ? "Over the category amount by" : "Unassigned"}</span>
            <span>
              {formatINR(toPaise(Math.abs(breakdown.unassignedPaise)))}
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** One event's slice of a category. Same edit-in-place pattern as the category
 *  row above, one level in. */
function EventAmountRow({
  side,
  categoryId,
  slice,
  onSaved,
}: {
  side: Side;
  categoryId: string;
  slice: EventSlice;
  onSaved: () => void;
}) {
  const { tenantId, canWrite } = useTenant();
  const [editing, setEditing] = useState(false);

  async function save(paise: Paise) {
    await setDoc(budgetDoc(tenantId, side, categoryId, slice.eventId), {
      side,
      categoryId,
      eventId: slice.eventId,
      allocatedPaise: paise,
      notes: "",
      updatedAt: serverTimestamp(),
    });
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <li className="py-2">
        <AmountEditor
          label={
            <>
              <OptionMark colour={slice.colour} icon={slice.icon} />
              {slice.name}, in rupees
            </>
          }
          initialPaise={slice.allocatedPaise}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        disabled={!canWrite}
        onClick={() => setEditing(true)}
        className="flex min-h-[44px] w-full items-center gap-2 py-1 text-left disabled:cursor-default"
      >
        <OptionMark colour={slice.colour} icon={slice.icon} />
        <span className="min-w-0 flex-1 truncate text-sm text-stone-600">{slice.name}</span>
        <span
          className={`shrink-0 text-sm ${
            slice.allocatedPaise > 0 ? "font-medium text-stone-700" : "text-stone-300"
          }`}
        >
          {slice.allocatedPaise > 0 ? formatINR(toPaise(slice.allocatedPaise)) : "—"}
        </span>
      </button>
    </li>
  );
}

/** The rupee input shared by the category row and the event rows — one parse,
 *  one busy state, one error string, rather than three copies of them. */
function AmountEditor({
  label,
  initialPaise,
  onSave,
  onCancel,
}: {
  label: ReactNode;
  initialPaise: number;
  onSave: (paise: Paise) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(
    initialPaise > 0 ? paiseToRupeeInput(toPaise(initialPaise)) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An empty field means "nothing allocated" — zero, not a refusal to save.
  const parsed = text.trim() === "" ? toPaise(0) : parseRupeeInput(text);

  async function submit() {
    if (parsed === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed);
    } catch (err) {
      console.error("[budget] allocation save failed:", err);
      setError("Could not save that amount. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-medium text-stone-500">{label}</span>
        <TextInput
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="0"
        />
        <span className="text-xs text-stone-400">
          {parsed !== null ? formatINR(parsed) : "Enter a plain number, like 800000."}
        </span>
      </label>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <PrimaryButton onClick={submit} disabled={parsed === null || busy}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}
