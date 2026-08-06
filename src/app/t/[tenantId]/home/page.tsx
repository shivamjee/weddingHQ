"use client";

// Home — a deliberately small summary (PHASE2 Step 6).
//
// Kept minimal on purpose. A year out there is no spend history and no task
// timeline, so a "full" dashboard would be mostly empty cards and misleading
// charts. This shows only what is real right now: how each side's budget is
// allocated, where the headcount stands against the venue, and how many
// questions are waiting to be asked. It grows when there is something to grow
// with (Phase 4+).
//
// READ COST: one bounded read of `budgets`, one COUNT aggregation for open
// questions, and — added in Phase 3 — TWO single-document reads for the guest
// headcount. `aggregates/guestTotals` exists precisely so this screen never
// loads three hundred households to print one number.

import Link from "next/link";
import { useCallback, useState } from "react";
import { getCountFromServer, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import {
  BUDGET_TOTALS_PREFIX,
  balancesDoc,
  budgetsCol,
  expenseTotalsDoc,
  guestTargetDoc,
  guestTotalsDoc,
  questionsCol,
} from "@/lib/paths";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import { MAX_CATEGORIES, useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { allocationHealth, comparisonRows } from "@/lib/budget";
import { projectedTotalPaise } from "@/lib/expenses";
import { formatDate } from "@/lib/dates";
import { formatINR, toPaise } from "@/lib/money";
import { AllocationHealthBar } from "@/components/budget/AllocationHealthBar";
import { SpendDonut } from "@/components/budget/SpendDonut";
import type { BudgetAllocationWithId, ExpenseTotals, Side } from "@/types";

const MAX_BUDGET_DOCS = MAX_CATEGORIES * 2 + 2;

export default function HomePage() {
  const { tenantId, tenant, sideLabel } = useTenant();
  const { user } = useAuth();
  const { categories, loading: configLoading } = useConfig();

  const load = useCallback(async () => {
    const [budgetSnap, openCount, guestSnap, targetSnap, expenseTotalsSnap, balancesSnap] =
      await Promise.all([
        getDocs(query(budgetsCol(tenantId), limit(MAX_BUDGET_DOCS))),
        getCountFromServer(query(questionsCol(tenantId), where("status", "==", "open"))),
        getDoc(guestTotalsDoc(tenantId)),
        getDoc(guestTargetDoc(tenantId)),
        // Two more single-document reads — the whole point of these
        // aggregates is that Home never learns to load the expense list
        // (PHASE4.md).
        getDoc(expenseTotalsDoc(tenantId)),
        getDoc(balancesDoc(tenantId)),
      ]);

    const allocations: BudgetAllocationWithId[] = [];
    const totals: Record<Side, number> = { a: 0, b: 0 };
    for (const d of budgetSnap.docs) {
      const data = d.data();
      if (d.id.startsWith(BUDGET_TOTALS_PREFIX)) {
        const side = data.side as Side;
        if (side === "a" || side === "b") totals[side] = Number(data.totalBudgetPaise) || 0;
      } else {
        allocations.push({ id: d.id, ...data } as BudgetAllocationWithId);
      }
    }
    const overall = guestSnap.exists()
      ? (guestSnap.data().overall as { people?: number; households?: number; projectedPaise?: number })
      : null;
    const target = targetSnap.exists() ? Number(targetSnap.data().targetHeads) : 0;

    return {
      allocations,
      totals,
      openQuestions: openCount.data().count,
      guests: {
        people: Number(overall?.people ?? 0),
        households: Number(overall?.households ?? 0),
        projectedPaise: toPaise(Math.trunc(Number(overall?.projectedPaise ?? 0))),
      },
      guestTarget: Number.isFinite(target) && target > 0 ? target : null,
      expenseTotals: expenseTotalsSnap.exists() ? (expenseTotalsSnap.data() as ExpenseTotals) : null,
      myNetPaise: balancesSnap.exists()
        ? toPaise(Math.trunc(Number(balancesSnap.data().byUid?.[user?.uid ?? ""] ?? 0)))
        : toPaise(0),
    };
  }, [tenantId, user?.uid]);

  const { data, loading } = useLoader(load, "Could not load your summary.");

  const allocations = data?.allocations ?? [];
  const totals = data?.totals ?? { a: 0, b: 0 };
  const rows = comparisonRows(categories, allocations);
  const projectedPaise = data?.expenseTotals
    ? toPaise(
        projectedTotalPaise(data.expenseTotals.bySide.a) +
          projectedTotalPaise(data.expenseTotals.bySide.b),
      )
    : null;

  const segments = (side: Side) =>
    rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.name,
      colour: r.colour,
      allocatedPaise: r[side],
    }));

  const anyBudget = totals.a > 0 || totals.b > 0 || allocations.length > 0;

  // "Now", captured ONCE per mount via a lazy initialiser rather than read
  // during render. Date.now() in a render body is impure — it would give a
  // different answer on every re-render — and a countdown that quietly changes
  // as you tap around is worse than one that is stable for the visit.
  const [now] = useState(() => Date.now());

  // The wedding is more than a year out and the date may genuinely not be set —
  // formatDate never invents one, and no date means no countdown rather than a
  // countdown to nothing.
  const daysAway = tenant?.weddingDate
    ? Math.ceil((tenant.weddingDate.toDate().getTime() - now) / 86_400_000)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">{tenant?.name ?? "Your wedding"}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {tenant?.weddingDate
            ? daysAway !== null && daysAway > 0
              ? `${formatDate(tenant.weddingDate)} · ${daysAway} days away`
              : formatDate(tenant.weddingDate)
            : "No date set yet."}
        </p>
      </div>

      {loading || configLoading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start lg:gap-4">
          {anyBudget ? (
            <section className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-stone-800">Budget &amp; Expenses</h2>
                <Link
                  href={tenantHref(tenantId, "/budget")}
                  className="text-sm font-medium text-rose-600"
                >
                  Open
                </Link>
              </div>
              {projectedPaise !== null ? (
                <div className="flex items-center gap-3">
                  <SpendDonut spentPaise={projectedPaise} budgetPaise={totals.a + totals.b} size={64} />
                  <p className="text-sm text-stone-500">
                    <span className="font-semibold text-stone-800">{formatINR(projectedPaise)}</span> of{" "}
                    {formatINR(toPaise(totals.a + totals.b))} budget
                  </p>
                </div>
              ) : null}
              <AllocationHealthBar
                health={allocationHealth(
                  totals.a,
                  allocations.filter((x) => x.side === "a"),
                )}
                segments={segments("a")}
                label={`${sideLabel("a")}'s side`}
              />
              <AllocationHealthBar
                health={allocationHealth(
                  totals.b,
                  allocations.filter((x) => x.side === "b"),
                )}
                segments={segments("b")}
                label={`${sideLabel("b")}'s side`}
              />
            </section>
          ) : (
            <SummaryLink
              href={tenantHref(tenantId, "/budget")}
              title="Set your budgets"
              body="Nothing allocated yet — start with each side's total."
            />
          )}

          {data && data.guests.people > 0 ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-stone-800">Guests</h2>
                <Link
                  href={tenantHref(tenantId, "/guests")}
                  className="text-sm font-medium text-rose-600"
                >
                  Open
                </Link>
              </div>
              <div>
                <p className="text-2xl font-semibold text-stone-800">
                  {data.guests.people}
                  {data.guestTarget ? (
                    <span className="text-base font-normal text-stone-500">
                      {" "}
                      of {data.guestTarget}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {data.guests.households}{" "}
                  {data.guests.households === 1 ? "household" : "households"} ·{" "}
                  {formatINR(data.guests.projectedPaise)} projected
                </p>
                {data.guestTarget && data.guests.people > data.guestTarget ? (
                  <p className="mt-1 text-sm text-rose-700">
                    {data.guests.people - data.guestTarget} over the target.
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <SummaryLink
              href={tenantHref(tenantId, "/guests")}
              title="Start the guest list"
              body="Households, tiers, and what each one costs to feed."
            />
          )}

          <section className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-stone-800">Questions to ask</h2>
              <Link
                href={tenantHref(tenantId, "/plan/questions")}
                className="text-sm font-medium text-rose-600"
              >
                Open
              </Link>
            </div>
            <div>
              <p className="text-2xl font-semibold text-stone-800">
                {data?.openQuestions
                  ? `${data.openQuestions} open`
                  : "None open"}
              </p>
              <p className="mt-0.5 text-sm text-stone-500">
                {data?.openQuestions
                  ? "Grouped by who to ask, ready for your next call."
                  : "Jot one down the moment you think of it."}
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Never folded into the Budget card above — "are we within budget?"
          and "who owes whom?" stay two different numbers everywhere in this
          app (PHASE4.md). A full-width strip, not a fourth grid card: the
          3-card grid is a deliberate layout (CLAUDE.md § Responsive layout). */}
      {!loading && data && data.myNetPaise !== 0 ? (
        <Link
          href={tenantHref(tenantId, "/budget/balances")}
          className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
        >
          <p className="text-sm text-stone-700">
            {data.myNetPaise > 0 ? "You're owed" : "You owe"}{" "}
            <span className="font-semibold text-stone-800">
              {formatINR(toPaise(Math.abs(data.myNetPaise)))}
            </span>
          </p>
          <span className="shrink-0 text-stone-300" aria-hidden>
            &rsaquo;
          </span>
        </Link>
      ) : null}
    </div>
  );
}

function SummaryLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-base font-medium text-stone-800">{title}</p>
        <p className="text-sm text-stone-500">{body}</p>
      </div>
      <span className="shrink-0 text-stone-300" aria-hidden>
        &rsaquo;
      </span>
    </Link>
  );
}
