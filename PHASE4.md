# PHASE4.md — Money in motion

> Reviewed and agreed. § Open questions below are resolved in the accompanying build plan
> (`/Users/shivamjee/.claude/plans/ready-to-build-phase-greedy-thacker.md`), not by editing this
> file in place — this file stays the original brief; the plan records what was decided on top
> of it.

Scope for Phase 4. Read `CLAUDE.md` (stack, hosting, **§ Multi-tenancy**, constraints) and
`FEATURES.md` **§0, §1, §2** before starting. Phases 1, 1.5, 2, 3 and 3.1 are complete; their
briefs are in `PHASE1.md`, `PHASE1.5.md`, `PHASE2.md` and `PHASE3.md` (kept as records — the
foundation they describe is what you build on here).

> **Everything in this phase is per-wedding.** Every collection named below lives under
> `tenants/{tenantId}/…`, and sides are `"a"` / `"b"` with labels from the tenant document — never
> `"shivam"` / `"swara"`. Build paths with `src/lib/paths.ts`; read `canWrite` and `sideLabel()`
> from `useTenant()` rather than checking a role or naming a person in the UI.

**Goal:** track money that is actually moving without ever conflating the two questions that can
point opposite ways — **"are we within budget?"** and **"who owes whom?"**. You can be comfortably
under budget while owing ₹4L, or over budget while being owed money. `FEATURES.md` §2 opens with
this and it is the spine of the whole phase.

**When to build:** roughly six months out, when deposits and real payments start. Before that,
Phase 2's allocations plus Phase 3's guest projection are the honest picture, and an expense
screen would sit empty.

---

## What Phases 1–3 already give you (build on this, don't rebuild)

- **Identity & wedding context** — `useAuth()` for `{ user, profile, isAdmin }`, `useTenant()` for
  `{ tenantId, tenant, role, side, canWrite, canInvite, sideLabel() }`.
- **The member list** — `memberships` filtered by `tenantId`, as `guests/page.tsx` already loads it
  (`limit(MAX_MEMBERS)`). `paidBy` and `shares` are lists of these people; this is where the
  pickers get their names.
- **Categories & events** — `useConfig()`, loaded once per wedding, with `categoryById()` /
  `eventById()`. Both are dimensions on an expense, exactly as on a budget allocation.
- **Money** — `src/lib/money.ts`: integer paise everywhere, `formatINR`, `formatCompact`,
  `parseRupeeInput` (the only place typed input becomes money). **Splits must not introduce
  floats — see § The rounding rule below.**
- **Budget maths** — `src/lib/budget.ts` (`allocationHealth`, `comparisonRows`,
  `eventComparisonRows`, `eventBreakdown`, `sumPaise`). This phase adds *consumption* against those
  allocations; the allocation side is done.
- **The pure-logic + unit-test pattern** — `src/lib/budget.ts` and `src/lib/guests.ts`: structural
  parameters, no Firebase import, integer paise in and out, division only at the render edge, one
  `describe` per exported function with full-sentence invariant names.
- **Aggregate maintenance** — `guestTotalsFrom()` + the recompute-and-overwrite writer in
  `guests/page.tsx`. **Read § Aggregates below before copying it: this phase is the one where that
  trade may genuinely not hold.**
- **UI kit** — `src/components/ui/form.tsx` (`Field`, `TextInput`, `ChipRow`, `ChipMultiRow`,
  `FilterPanel`, `Expander`, `ActionLink`, `PrimaryButton`, …), `PageHeader` (with `backHref` or
  `onBack`), `EmptyState`.
- **The list → profile → form shape** established in Phase 3.1: a minimal tappable row, a read-only
  view screen, an explicit Edit. Expenses should follow it rather than inventing a fourth pattern.
- **Charts** — Recharts, one import site (`src/components/budget/AllocationChart.tsx`) plus
  `GuestBars.tsx`. Horizontal bars for anything with names.
- **Security rules** — `firestore.rules` uses `isTenantMember(tid)` / `isTenantCouple(tid)` /
  `isAdmin()`, default-deny, with `budgets` as the worked example of a block that validates field
  shape rather than just membership. Tests in `tests/rules/` run against two tenants; **add
  cross-tenant denial cases for each new collection.**
- **Nav shell** — bottom tabs Home / Budget / Guests / Plan / More. This phase fills out **Budget**
  and adds a balances view; see § Navigation.

---

## The decision that shapes everything else

### `paidBy` and `shares` are independent, and budget consumption follows `shares`

`FEATURES.md` §2.2 states this and calls it the single most likely bug in the app. Restated here
because getting it wrong silently produces plausible, wrong numbers for months.

Worked example — Sangeet decor, ₹3L, split evenly between the two sides, and side B's father
fronts the whole amount:

- `paidBy` = side B's father, `amountPaise` = 30000000
- `shares` = `[{ uid: shivam, amountPaise: 15000000 }, { uid: swara, amountPaise: 15000000 }]`
- He is **owed ₹3L** — he paid ₹3L and bears ₹0
- Side A's decor budget is charged **₹1.5L** — not ₹3L, not ₹0
- Side B's decor budget is charged **₹1.5L**

> **Budget consumption follows `shares`. Never `amountPaise`, never `paidBy`.**
> Comment this at the aggregate-update code, and make it a named regression test — the kind
> `src/lib/guests.test.ts` calls "THE regression this feature can silently cause".

The single-payer case needs no special-casing: one share at 100% lands entirely on that side's
budget and creates no debt.

### The three states

`estimated` → `committed` → `paid` (`FEATURES.md` §2.3). A signed venue with a ₹2L deposit against
an ₹18L contract is neither "spent ₹2L" nor "spent ₹18L", and without this the budget understates
the real position for the whole first year.

- **estimated** — a guess. No `paidBy`. Counts toward projections, not toward money owed.
- **committed** — contractually owed. Counts toward budget consumption and projections; creates a
  debt only once someone has actually paid.
- **paid** — money has moved. Counts toward everything, including balances.

**Only `paid` expenses affect balances. All three affect budget analytics**, as distinct segments.
A partial payment is a `paid` expense plus a `committed` one for the balance — not a new field.

### The rounding rule

₹3L split three ways is 10000000 paise each, exactly. ₹1,000 split three ways is not. Splitting
must be integer-exact: the shares must sum to `amountPaise` **exactly**, every time, or the
balances drift by a paisa per expense forever.

Proposed: distribute the remainder one paisa at a time to the first *n* shares, deterministically
ordered by uid, so the same expense always produces the same split. This belongs in
`src/lib/expenses.ts` with a test that asserts `sum(shares) === amountPaise` across awkward
amounts and every split mode. **Confirm the tie-break order is acceptable** — see § Open questions.

---

## Build order

Dependencies first. Ship each step working before the next. Update `firestore.rules` **and its
tests** as part of the step that introduces a collection — not as an afterthought.

### Step 1 — `src/lib/expenses.ts` and its tests
Pure logic first, as in Phase 3. Nothing here imports Firebase.
- `splitShares(amountPaise, mode, participants, overrides)` for `equal` / `exact` / `percentage` /
  `single`, integer-exact per § The rounding rule.
- `validateShares(amountPaise, shares)` → the one guard every write goes through.
- `consumptionBySideCategory(expenses)` — **from `shares`**, keyed `{side}_{categoryId}` per
  §2.5, split into the three status buckets.
- `balances(expenses, settlements)` → net paise per uid, `paid` expenses only.
- `simplifyDebts(net)` → the minimum set of transfers. Greedy (largest creditor against largest
  debtor, repeat) is explicitly good enough at this scale; mark it `ponytail:` with that ceiling.

### Step 2 — Expense CRUD + the list
- `expenses` per §2.2. Member-readable and member-writable, like every other planning collection.
- The list follows Phase 3.1's shape: minimal row → read-only profile → explicit Edit.
- **Entry UX is §2.7 and it is not optional detail** — amount first with a numeric keypad and
  autofocus; status as a visible segmented control, never a buried dropdown; category and event as
  chip rows; `paidBy` defaulting to the current user; the last-used category, event and split mode
  pre-selected; and the live budget impact as the amount is typed ("Decor: ₹8.5L of ₹13L after
  this").

### Step 3 — Splits
- The four modes, on the expense form, defaulting to the last used.
- Show each person's share as it is computed, and refuse to save when they don't sum — using
  `validateShares`, so the rule and the UI can't disagree.

### Step 4 — Aggregates and the Budget tab's consumption view
- `aggregates/budgetTotals` per §2.5 — see § Aggregates below for **how** it is maintained, which
  is the open question this step turns on.
- Per-category stacked bars: paid / committed / estimated / remaining, one row per category per
  side, red past the allocation, **sorted by percent consumed descending** — overruns belong at the
  top, not in alphabetical order.
- The **projected total**: committed + estimated + paid, plus the guest-driven catering projection
  from Phase 3, against the combined budget. This is the number that makes the app answer "are we
  on track?" honestly, and it is the first time all three phases' numbers meet.

### Step 5 — Settlements and balances
- `settlements` per §2.4. **A settlement is a transfer between people. It is not an expense and
  must never appear in budget totals** — worth a named test of its own.
- The balances panel: simplified transfers as plain sentences ("Shivam → Swara's dad: ₹1,50,000")
  with a **Settle up** button that pre-fills a settlement.
- **Its own screen or a clearly separate card. Never merged into budget health** (§2.6).

### Step 6 — The rest of §2.6's analytics
- Per event, all-in: the Sangeet's total across both sides, broken down by category. This crosses
  the side boundary, which is the entire reason side and event are separate dimensions.
- Top ten line items across the wedding, any status.
- **Not yet:** burn-down over time, month-by-month spend, category trend lines. They need spend
  history that won't exist for months and render as empty or misleading charts until it does.

### Step 7 — The repair tool
- A couple-only **"recalculate totals"** that rebuilds the aggregates from scratch.
- §2.5 says to build it now, not later, because drift will happen. Comment it as deliberately
  expensive and bound it with pagination.
- *(If § Aggregates lands on recompute-and-overwrite, this step largely collapses into it — the
  writer already rebuilds from the full list. Resolve that question first.)*

---

## Aggregates — the open architectural question

`FEATURES.md` §2.5 says both aggregate documents are updated **inside a Firestore transaction** on
every expense/settlement create, update and delete.

Phase 3 deliberately did not do that for `aggregates/guestTotals`. It recomputes the whole document
from the in-memory list and `setDoc`s it, because the screen already held every household, there
was no `runTransaction` anywhere in the codebase, and a lost incremental delta stays wrong forever
while a recompute heals on the next write. That reasoning is recorded in
`src/types/guestTotals.ts`.

**Whether that trade still holds here is a real question, not a formality:**

- Households top out in the low hundreds and one person edits at a time. Expenses could run to
  similar numbers, but they are edited by more people, more often, and closer to the wedding.
- A guest count being briefly stale is a planning annoyance. A **balance** being stale is somebody
  believing they are owed the wrong amount.
- Recompute-and-overwrite needs the writer to hold the *complete* list. That is fine for a screen
  that already loaded it and false for one that paginates — and expenses are far more likely to
  want paging than households were.
- Transactions are the documented answer and cost one more read per write. This app is on Spark
  with a handful of users; that cost is not the objection. The objection is that the codebase has
  no such pattern yet, so it is new machinery to get right.

Do not default to either. Decide it, and write the reasoning into `src/types/` next to the
aggregate, as Phase 3 did.

---

## New data models

Add TypeScript interfaces in `src/types/` in the existing style (`X` / `XWithId`, money fields
typed `Paise` and named `…Paise`, a doc-comment that opens with the Firestore path and carries a
`SECURITY:` note, `TYPES` const + `TYPE_LABELS` beside each literal union):
`Expense`, `ExpenseWithId`, `ExpenseStatus`, `SplitMode`, `Share`, `Settlement`,
`SettlementWithId`, `BudgetTotals` (the aggregate — note the name collision with the existing
`BudgetTotals` in `src/types/budget.ts`, which is a side's typed ceiling; **rename one of them**),
and `Balances`.

## Security rules (the boundary — update `firestore.rules` + tests per collection)

Inside `match /tenants/{tenantId}`, alongside the existing blocks:

| Collection (under `tenants/{tenantId}/`) | Read | Write |
|---|---|---|
| `expenses/*` | member | **member** |
| `settlements/*` | member | **member** |
| `aggregates/budgetTotals` | member | **member** *(the existing `aggregates/{docId}` block already covers this)* |
| `aggregates/balances` | member | **member** *(same block)* |

Unlike the guest collections, these are worth **shape validation** in the rules, following the
`budgets` block as the worked example: `amountPaise` a non-negative int (never a float — a float
means somebody wrote rupees), `status` one of the three, and `shares` summing to `amountPaise`.
**Check whether the rules language can sum a list of maps** before promising the last one — if it
cannot, enforce it in `validateShares` and say so in a comment at the rules block, exactly as the
`budgets` block already does for its cross-document ceiling.

Add emulator tests for each: member allowed, non-member denied, **and a member of the other tenant
denied**. The fixtures already set up two weddings for exactly this.
**[MANUAL]** redeploy rules afterwards:
`npx firebase deploy --only firestore:rules --project weddinghq-d125b`.

## Read-cost & indexes (CLAUDE.md §3 / FEATURES §1.5)

- **Bound every list query with `limit()`.** Declare the cap as a named const with a READ COST
  comment, as every other screen does.
- Expenses are the first collection in this app that can plausibly outgrow a single bounded read.
  Phase 3's "load it all, paginate the rendering" trade was justified by filtered totals having to
  be exact; **check whether the same argument applies here** before copying it. If expenses paginate,
  the aggregate stops being optional — see § Aggregates.
- Home reads `aggregates/*` only. It must not learn to load the expense list.
- Add composite indexes to `firestore.indexes.json` **as a query needs them** (expenses by status
  ordered by date, say), not via runtime errors in production. It is currently empty.
  **[MANUAL]** deploy with `--only firestore:indexes`.

## UX guidance

- Mobile-first; ≥44px tap targets; 16px type (smaller makes iOS Safari zoom on focus).
- Reuse `src/components/ui/form.tsx` and the warm rose/stone/white theme. Chips, not dropdowns.
- Keep the single light theme and the centered max-width app column.
- **Expense entry is the make-or-break screen this phase** — it is the most repeated action in the
  app once spending starts. §2.7 is the spec; treat it as a requirement, not a wish list.
- **Never merge "are we within budget?" with "who owes whom?"** in a single figure, on any screen.

## Navigation mapping

- **Budget** → allocations (existing) plus consumption, the projected total, and the per-category
  and per-event analytics.
- **Balances** → its own screen, reached from Budget or More. Simplified transfers and Settle up.
- **Home** → the projected total against the combined budget, and the caller's own net balance.
- Guests, Plan and More are unchanged.

---

## Out of scope — do not build (later phases)

Receipts and Firebase Storage (§2.8 — **Storage is not enabled on this project**; enabling it is a
deliberate decision with a cost flag, and it needs client-side compression before a single upload).
AI expense categorisation (§9.1 — it will reuse `src/lib/ai/provider.ts` and the route-handler
pattern Phase 2 established, not a second integration). Tasks, run sheets and the planning timeline
(Phase 5+). RSVP, dietary summaries and seating (Phase 6).

Burn-down and trend charts are out of scope *within* this phase, per §2.6.

## Definition of done

1. An expense can be recorded in **estimated** state with no payer, and counts toward projections
   but not toward balances.
2. `paidBy` and `shares` are independent; a ₹3L expense fronted by one person and split two ways
   charges **₹1.5L to each side's budget** and leaves the payer owed ₹3L. Named test.
3. Every split mode produces shares summing **exactly** to `amountPaise`, with no float anywhere.
   Named test across awkward amounts.
4. Moving an expense between the three states moves it between the three buckets everywhere it is
   shown, with no manual refresh.
5. A settlement never appears in any budget total. Named test.
6. Balances are simplified to the minimum set of transfers and rendered as plain sentences, with
   Settle up pre-filling a settlement.
7. Budget health and "who owes whom" are **never** the same number or the same card.
8. The expense form meets §2.7: amount first, status a segmented control, chips not dropdowns,
   last-used defaults, live budget impact while typing.
9. A couple-only recalculate rebuilds the aggregates from scratch.
10. Every new collection is enforced in `firestore.rules` with an emulator test including
    cross-tenant denial; **rules deployed**.
11. All list queries bounded with `limit()`. Money via `src/lib/money.ts` (integer paise).
12. Firebase still on **Spark**; no Cloud Functions, no Storage. Vercel still on **Hobby**.

## Open questions — settle these before building

1. **Aggregates: transactional or recompute-and-overwrite?** See § Aggregates. This changes Steps 4,
   5 and 7 and is the largest unmade decision in the phase.
2. **Do expenses paginate?** Phase 3's "one bounded read, paginate the rendering" holds only while
   the whole list fits. If expenses page, filtered totals must come from the aggregate, which
   constrains question 1.
3. **Rounding tie-break.** Is "remainder to the first *n* shares by uid order" acceptable, or should
   the payer absorb it? Either is defensible; it needs to be chosen once and tested.
4. **`BudgetTotals` name collision** — `src/types/budget.ts` already has one, meaning a side's typed
   ceiling. The §2.5 aggregate needs a different name. Which one moves?
5. **Can `firestore.rules` sum a list of maps** to enforce `shares == amountPaise`? If not, that
   invariant is client-only and the rules block should say so out loud.
6. **Who can delete a paid expense?** Every other collection in this app is member-writable and that
   has been right so far. A `paid` expense is the first record where deleting one silently rewrites
   what somebody else is owed. Same question for settlements. Consider whether the `guestLog`
   append-only pattern from Phase 3 should extend here — an expense log is a stronger case for one
   than the guest list was.
7. **Are `estimated` expenses and Phase 2's budget allocations the same thing?** An allocation is
   "we intend to spend ₹2L on decor"; an estimated expense is "the decorator will be about ₹1.8L".
   They will overlap, and the projected total must not count both. Decide how they relate before
   building the projection in Step 4.

## Standing rules (unchanged from Phases 1–3 / CLAUDE.md)

- Ask before deviating from the stack; flag anything that costs money (especially Cloud Functions
  → Blaze, or enabling Storage) before building it.
- Comment anything with a cost or security implication.
- Bound every query with `limit()`.
- Explain any remaining manual steps click-by-click. The expected manual steps this phase are
  **deploying updated rules and indexes** — no new Firebase console setup, no new host wiring, no
  new environment variables.
