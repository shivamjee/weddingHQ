"use client";

// Expenses — Phase 4 Step 2. Reached from Budget ("View expenses"). Same
// list → view → form shape as Guests/Contacts/Questions, same isDesktop
// sticky-column split (CLAUDE.md § Responsive layout).
//
// READ COST: bounded reads of expenses, settlements, members and budget
// allocations — no pagination (build plan decision: this app's scale, 5-15
// users, stays far under the caps below; recompute-and-overwrite for the
// aggregates needs the writer to hold the FULL list, which only holds while
// there's no pagination). Settlements are read here too, not just on the
// Balances screen, because a `paid` expense changes who owes whom — see
// src/lib/aggregateWriter.ts.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  addDoc,
  deleteDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ChipRow, FormMessage, OptionMark, PrimaryButton, SecondaryButton } from "@/components/ui/form";
import { ExpenseForm, type ExpenseDraft } from "@/components/expenses/ExpenseForm";
import { ExpenseView } from "@/components/expenses/ExpenseView";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { writeExpenseAggregates } from "@/lib/aggregateWriter";
import {
  BUDGET_TOTALS_PREFIX,
  budgetsCol,
  expenseDoc,
  expensesCol,
  membershipsCol,
  settlementsCol,
} from "@/lib/paths";
import { formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import {
  EXPENSE_STATUSES,
  EXPENSE_STATUS_LABELS,
  type BudgetAllocationWithId,
  type ExpenseStatus,
  type ExpenseWithId,
  type MembershipWithId,
  type SettlementWithId,
  type Side,
  type SplitMode,
} from "@/types";

/** READ COST: this app tops out around 15 people making a few hundred
 *  entries — 500 is generous headroom, not an expected size. */
const MAX_EXPENSES = 500;
const MAX_SETTLEMENTS = 500;
const MAX_MEMBERS = 50;
/** Same cap and reasoning as budget/page.tsx's MAX_BUDGET_DOCS. */
const MAX_BUDGET_DOCS = 300;

type Mode =
  | { kind: "list" }
  | { kind: "view"; expense: ExpenseWithId }
  | { kind: "form"; expense?: ExpenseWithId };

interface Loaded {
  expenses: ExpenseWithId[];
  settlements: SettlementWithId[];
  members: MembershipWithId[];
  budgetAllocations: BudgetAllocationWithId[];
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const { tenantId, canWrite, canInvite } = useTenant();
  const { categories, events, categoryById, eventById } = useConfig();

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateMessage, setRecalculateMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const [expenseSnap, settlementSnap, memberSnap, budgetSnap] = await Promise.all([
      getDocs(query(expensesCol(tenantId), limit(MAX_EXPENSES))),
      getDocs(query(settlementsCol(tenantId), limit(MAX_SETTLEMENTS))),
      getDocs(query(membershipsCol(), where("tenantId", "==", tenantId), limit(MAX_MEMBERS))),
      getDocs(query(budgetsCol(tenantId), limit(MAX_BUDGET_DOCS))),
    ]);

    const expenses = expenseSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as ExpenseWithId)
      .sort((a, b) => b.date.toMillis() - a.date.toMillis());

    const settlements = settlementSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as SettlementWithId);
    const members = memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId);

    const budgetAllocations: BudgetAllocationWithId[] = [];
    for (const d of budgetSnap.docs) {
      if (d.id.startsWith(BUDGET_TOTALS_PREFIX)) continue;
      const data = d.data();
      budgetAllocations.push({ id: d.id, ...data, eventId: data.eventId ?? null } as BudgetAllocationWithId);
    }

    return { expenses, settlements, members, budgetAllocations };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load the expenses.");

  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const settlements = useMemo(() => data?.settlements ?? [], [data]);
  const budgetAllocations = useMemo(() => data?.budgetAllocations ?? [], [data]);

  const memberList = useMemo(() => data?.members ?? [], [data]);
  const members = useMemo(
    () =>
      memberList
        .filter((m): m is MembershipWithId & { uid: string } => Boolean(m.uid))
        .map((m) => ({ uid: m.uid, label: m.displayName || m.email })),
    [memberList],
  );
  const sideByUid = useMemo(() => {
    const map: Record<string, Side> = {};
    for (const m of memberList) if (m.uid) map[m.uid] = m.side;
    return map;
  }, [memberList]);

  // Last-used category/event/split mode, pre-selected on a new expense
  // (§2.7) — derived from the most recently CREATED expense already in
  // memory, no separate persistence mechanism needed.
  const lastUsed = useMemo(() => {
    const mostRecent = [...expenses].sort(
      (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
    )[0];
    return {
      categoryId: mostRecent?.categoryId ?? null,
      eventId: mostRecent?.eventId ?? null,
      splitMode: (mostRecent?.splitMode ?? "equal") as SplitMode,
    };
  }, [expenses]);

  const visible = useMemo(
    () => (statusFilter ? expenses.filter((e) => e.status === statusFilter) : expenses),
    [expenses, statusFilter],
  );

  const writeAggregate = useCallback(
    (list: readonly ExpenseWithId[]) => writeExpenseAggregates(tenantId, list, settlements, sideByUid),
    [tenantId, settlements, sideByUid],
  );

  // The repair tool (PHASE4.md Step 7, §2.5). Deliberately expensive — a full
  // rebuild of both aggregate documents from the bounded lists this screen
  // already holds — but that's also all recompute-and-overwrite ever does on
  // a normal save (build plan decision 2), so there is no separate rebuild
  // code path here, just this same call made by hand.
  const recalculateTotals = useCallback(async () => {
    setRecalculating(true);
    setRecalculateMessage(null);
    try {
      await writeAggregate(expenses);
      setRecalculateMessage("Totals and balances rebuilt from every expense and settlement.");
    } catch (err) {
      console.error("[expenses] recalculate failed:", err);
      setRecalculateMessage("Could not rebuild the totals. Try again.");
    } finally {
      setRecalculating(false);
    }
  }, [writeAggregate, expenses]);

  const saveExpense = useCallback(
    async (draft: ExpenseDraft, existing?: ExpenseWithId) => {
      if (!user) throw new Error("not signed in");
      let saved: ExpenseWithId;
      let next: ExpenseWithId[];

      if (existing) {
        await updateDoc(expenseDoc(tenantId, existing.id), { ...draft, updatedAt: serverTimestamp() });
        saved = { ...existing, ...draft };
        next = expenses.map((e) => (e.id === existing.id ? saved : e));
      } else {
        const ref = await addDoc(expensesCol(tenantId), {
          ...draft,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        saved = { id: ref.id, ...draft } as ExpenseWithId;
        next = [...expenses, saved];
      }

      await writeAggregate(next);
      reload();
      setMode({ kind: "list" });
    },
    [tenantId, user, expenses, writeAggregate, reload],
  );

  const removeExpense = useCallback(
    async (expense: ExpenseWithId) => {
      await deleteDoc(expenseDoc(tenantId, expense.id));
      const next = expenses.filter((e) => e.id !== expense.id);
      await writeAggregate(next);
      setMode({ kind: "list" });
      reload();
    },
    [tenantId, expenses, writeAggregate, reload],
  );

  let detail: ReactNode = null;
  if (mode.kind === "view") {
    const expense = mode.expense;
    detail = (
      <ExpenseView
        expense={expense}
        category={categoryById(expense.categoryId) ?? undefined}
        event={eventById(expense.eventId) ?? undefined}
        members={members}
        onEdit={() => setMode({ kind: "form", expense })}
        onBack={() => setMode({ kind: "list" })}
      />
    );
  } else if (mode.kind === "form") {
    const editing = mode.expense;
    detail = (
      <div className="flex flex-1 flex-col px-5 py-6">
        <ExpenseForm
          existing={editing}
          expenses={expenses}
          categories={categories}
          events={events}
          members={members}
          currentUid={user?.uid ?? ""}
          budgetAllocations={budgetAllocations}
          sideByUid={sideByUid}
          lastUsed={lastUsed}
          onSave={(draft) => saveExpense(draft, editing)}
          onCancel={() => setMode({ kind: "list" })}
          onDelete={editing ? () => removeExpense(editing) : undefined}
        />
      </div>
    );
  }

  const list = (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-stone-800">Expenses</h1>
          <p className="mt-1 text-sm text-stone-500">
            Money moving — estimated, committed and paid. Not the same as a budget allocation.
          </p>
        </div>
        {canWrite ? (
          <SecondaryButton onClick={() => setMode({ kind: "form" })}>+ Add</SecondaryButton>
        ) : null}
      </div>

      <FormMessage error={error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipRow<ExpenseStatus>
          options={EXPENSE_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS_LABELS[s] }))}
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
        />
        <Link
          href={tenantHref(tenantId, "/budget/balances")}
          className="min-h-[44px] px-2 py-3 text-sm font-medium text-rose-600"
        >
          Balances →
        </Link>
      </div>

      {canInvite ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => void recalculateTotals()}
            disabled={recalculating}
            className="self-start min-h-[44px] px-2 py-3 text-xs font-medium text-stone-400 hover:text-stone-600 disabled:opacity-50"
          >
            {recalculating ? "Rebuilding…" : "Recalculate totals"}
          </button>
          {recalculateMessage ? <p className="text-xs text-stone-500">{recalculateMessage}</p> : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-sm text-stone-500">
            {expenses.length === 0
              ? "Nothing recorded yet. A deposit, a quote, a payment — whatever's actually moving."
              : "Nothing matches that filter."}
          </p>
          {canWrite && expenses.length === 0 ? (
            <PrimaryButton className="mt-4" onClick={() => setMode({ kind: "form" })}>
              Add the first expense
            </PrimaryButton>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              categoryName={categoryById(expense.categoryId)?.name ?? "Uncategorised"}
              categoryColour={categoryById(expense.categoryId)?.colour}
              categoryIcon={categoryById(expense.categoryId)?.icon}
              onView={() => {
                if (isDesktop && mode.kind === "view" && mode.expense.id === expense.id) {
                  setMode({ kind: "list" });
                } else {
                  setMode({ kind: "view", expense });
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );

  if (!isDesktop) return mode.kind === "list" ? list : detail;
  if (mode.kind === "list") return list;
  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      {list}
      <div className="lg:sticky lg:top-6">{detail}</div>
    </div>
  );
}

const STATUS_DOT: Record<ExpenseStatus, string> = {
  estimated: "bg-stone-300",
  committed: "bg-amber-400",
  paid: "bg-emerald-500",
};

function ExpenseRow({
  expense,
  categoryName,
  categoryColour,
  categoryIcon,
  onView,
}: {
  expense: ExpenseWithId;
  categoryName: string;
  categoryColour?: string;
  categoryIcon?: string;
  onView: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onView}
        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left"
      >
        <span
          aria-hidden
          title={EXPENSE_STATUS_LABELS[expense.status]}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[expense.status]}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium text-stone-800">
            {expense.description}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-stone-500">
            <OptionMark colour={categoryColour} icon={categoryIcon} className="h-2 w-2" />
            {categoryName} · {formatDate(expense.date, "No date")}
          </span>
        </span>
        <span className="shrink-0 text-base font-semibold text-stone-800">
          {formatINR(toPaise(expense.amountPaise))}
        </span>
      </button>
    </li>
  );
}
