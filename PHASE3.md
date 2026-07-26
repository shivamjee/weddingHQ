# PHASE3.md — Guest list

Scope for Phase 3. Read `CLAUDE.md` (stack, hosting, **§ Multi-tenancy**, constraints) and
`FEATURES.md` **§0, §1, §4** before starting. Phases 1, 1.5 and 2 are complete; their briefs are in
`PHASE1.md`, `PHASE1.5.md` and `PHASE2.md` (kept as records — the foundation they describe is what
you build on here).

> **Everything in this phase is per-wedding.** Every collection named below lives under
> `tenants/{tenantId}/…`, and sides are `"a"` / `"b"` with labels from the tenant document — never
> `"shivam"` / `"swara"`. Build paths with `src/lib/paths.ts`; read `canWrite` and `sideLabel()`
> from `useTenant()` rather than checking a role or naming a person in the UI.

**Goal:** make headcount a conversation about arithmetic instead of an argument. Four people —
the couple and both sets of parents — contribute names independently, the total comes to 800, the
venue holds 400. This phase builds the list, the tier ladder that shows where the line falls, and
the cost projection that connects it to Phase 2's budget.

**This is not an RSVP tool.** The wedding is more than a year out. RSVP, chase lists, dietary
summaries and seating are Phase 6 and are explicitly out of scope — see "Out of scope" below.
§4.1's data model already leaves room for all of them, which is the point.

---

## What Phases 1–2 already give you (build on this, don't rebuild)

- **Identity & wedding context** — `useAuth()` for `{ user, profile, isAdmin }`, `useTenant()` for
  `{ tenantId, tenant, role, side, canWrite, sideLabel() }`. Route protection is in
  `src/app/t/[tenantId]/layout.tsx`.
- **Categories & events** — `useConfig()` gives both, loaded **once per wedding**, with
  `categoryById()` / `eventById()`. **`Event.perPlateEstPaise` was captured in Phase 2 precisely
  so this phase could use it** — it is the input to the whole cost projection.
- **Paths** — `src/lib/paths.ts` builds every Firestore reference. Add `households` and `guests`
  there; never concatenate a path in a component.
- **Bounded loading** — `useLoader(load, errorMessage)` handles loading / stale / error and keeps
  previous rows on screen during a reload. `useMediaQuery` for responsive view switching.
- **Money** — `src/lib/money.ts`: integer paise everywhere, `formatINR`, `formatCompact`,
  `parseRupeeInput` (the only place typed input becomes money). **All projections are paise.**
- **UI kit** — `src/components/ui/form.tsx` (`Field`, `TextInput`, `ChipRow`, `ChipMultiRow`,
  `PrimaryButton`, …, all at the right tap-target sizes), `PageHeader`, `ColourPicker`.
- **Charts** — Recharts is already a dependency. Horizontal bars for anything with names.
- **Security rules** — `firestore.rules` uses `isTenantMember(tid)` / `isTenantCouple(tid)` /
  `isAdmin()`, default-deny. Tests in `tests/rules/` run against two tenants; **add cross-tenant
  denial cases for each new collection.**
- **Nav shell** — bottom tabs Home / Budget / **Guests** / Plan / More. Guests is the last
  `EmptyState` and is what this phase fills.

---

## The two decisions that shape everything else

Both are settled in `FEATURES.md` §4.1. Read them there in full; they are restated here because
getting either wrong means rebuilding the phase.

### 1. Households are the invitation unit; guests are a separate top-level collection

```
tenants/{tenantId}/households/{householdId}
tenants/{tenantId}/guests/{guestId}          ← householdId field, NOT a subcollection
```

Nesting guests under households would make every cross-cutting question — *"all vegetarians
attending the sangeet"*, *"everyone who hasn't replied"* — a **collectionGroup** query. In
Firestore that matches the collection name at **every path depth in the database**, including
other weddings, so securing it needs a `match /{path=**}/guests/{guestId}` rule plus a
`tenantId ==` filter on every query. That is exactly the forgettable-filter model `CLAUDE.md`
§ Multi-tenancy exists to avoid. Top-level keeps isolation a path prefix and gets an ordinary
rules block.

### 2. Counts are the planning number; names are optional detail. Neither derives from the other

`adultCount` / `childCount` are hand-entered on the household and are what every projection reads.
`guests` documents are a *subset* that may not exist at all.

**"Dad's colleagues, 12 people" is a complete, valid household with zero guest documents.** That
is what parents will actually enter. Forcing twelve blank name rows to record a headcount of
twelve is how this feature dies unused.

Show both (*"12 planned · 3 named"*), offer to reconcile when they drift, never silently rewrite
one from the other. `aggregates/guestTotals` is written on household writes **only** — naming
someone changes no count, so the aggregate has exactly one writer and cannot drift.

---

## Build order

Dependencies first. Ship each step working before the next. Update `firestore.rules` **and its
tests** as part of the step that introduces a collection — not as an afterthought.

### Step 1 — Households CRUD + the list (Guests tab)
The foundation; everything else reads it.
- `households` per §4.1: name, side, invitedBy, tier, status, relationship, eventIds,
  adultCount, childCount, travel/accommodation fields, address, primaryPhone, notes.
- **Progressive entry is the whole battle.** The default form is: name, side, tier, adults,
  children. Everything else lives behind a "More details" expander. A form demanding twelve fields
  per household will not get filled in.
- Events as a `ChipMultiRow` (from the Phase 2 UI kit), tier and side as `ChipRow`.
- List view with the household name, tier, side, planned headcount, and `proposed` state visible.
- **Member-writable** — all four contributors add names; this is collaborative by design.

### Step 2 — Tiers + the tier ladder (the headline)
Nearly free once Step 1 exists, and the highest-value part of the phase (§4.2).
- Cumulative table, **not** per-tier: Must 260 → +Should 430 → +If space 550.
- A **target headcount** setting (`settings/guestTarget`, couple-writable) and a clear marker of
  **which tier breaks it and by how many people**. Default the target from a `booked` venue
  comparison option's capacity where one exists (Phase 2 `comparisons`), but keep it editable.
- The running total is the point — "which of these are really B?" instead of "why did you delete
  my cousin?"

### Step 3 — Cost projection + marginal cost at entry
The bridge to Phase 2's Budget tab, and the analytic that justifies the phase.
- Per household: `(adultCount + childCount) × Σ perPlateEstPaise` over its `eventIds`. Aggregate
  by tier, alongside the ladder. **Never** count `guests` documents for this (see decision 2).
- Child plates price differently — if that matters, note it as a follow-up rather than inventing a
  child rate now; §4.4 only asks for adults-vs-children in the *breakdowns*.
- **Marginal cost while typing.** Adding a household shows the live delta ("+₹30,000"). §4.4 is
  explicit that this changes behaviour more than any report does. It needs no extra read — the
  totals are already loaded.
- Feed the total into Home's summary; wire it into §2.6's projected total when Phase 4 lands.

### Step 4 — Named guests
Only now, and deliberately after the numbers work.
- `guests` per §4.1: householdId, name, ageGroup, dietary, notes.
- Opened from a household: "12 planned · 3 named", add/edit/remove names, offer to reconcile the
  count when they diverge — **never** rewrite the count automatically.
- Leave room in the shape for Phase 6's `rsvp` / `seat`; do not build them.

### Step 5 — Filters and breakdowns
- Tier, side, invitedBy, event, relationship, status, travelNeeded, accommodationNeeded.
  Combinable, as removable chips.
- **Every count on screen respects the active filters** — filtering to "Swara's side, tier B,
  sangeet" must give a live headcount and cost for exactly that slice. A filter that changes the
  list but not the total is worse than no filter.
- Breakdowns by side, by invitedBy, by event; adults vs children.
- **Room block** view: households needing accommodation, with people, rooms and nights. Hotels ask
  for this early and it is a large budget line.

### Step 6 — CSV import and export
**Not a stretch goal — §4.6 says build it in the same phase, and it is right.** The list already
exists in someone's spreadsheet, and typing 200 households by hand is how this dies.
- Import: column-mapping UI → **dry-run preview with duplicate warnings** → commit as `proposed`.
- Export: flat CSV, one row per household (and optionally one per named guest) for vendors.
- Parse client-side; no upload, no Storage, no server. A CSV of a few hundred rows is nothing.

### Step 7 — Duplicate detection + provenance
- Warn on fuzzy name or phone match **at entry**, not as a later cleanup screen. With four people
  adding independently, mutual family friends *will* be entered twice.
- `createdBy` on every household plus a lightweight change log (who added or removed what, when).
  Cheap, and it prevents the "who deleted my aunt" problem outright (§4.3).
- `proposed` vs `confirmed`: anyone may add as `proposed` — it counts toward projections but is
  visibly not agreed. Confirming is a deliberate act. This lets parents contribute a full list
  without it feeling like a unilateral commitment.

---

## New data models

Add TypeScript interfaces in `src/types/` in the existing style (money fields use `Paise`):
`Household`, `HouseholdWithId`, `Guest`, `GuestWithId`, `Tier`, `HouseholdStatus`, `AgeGroup`,
and `GuestTotals` for the aggregate.

## Security rules (the boundary — update `firestore.rules` + tests per collection)

Inside `match /tenants/{tenantId}`, alongside the existing blocks:

| Collection (under `tenants/{tenantId}/`) | Read | Write |
|---|---|---|
| `households/*` | member | **member** (four people contribute names) |
| `guests/*` | member | **member** |
| `aggregates/guestTotals` | member | **member** (written in the same transaction as a household) |
| `settings/guestTarget` | member | couple *(existing `settings` block already covers this)* |

Add emulator tests for each: member allowed, non-member denied, **and a member of the other
tenant denied**. The fixtures already set up two weddings for exactly this.
**[MANUAL]** redeploy rules afterwards:
`npx firebase deploy --only firestore:rules --project weddinghq-d125b`.

## Read-cost & indexes (CLAUDE.md §3 / FEATURES §1.5)

- **Bound every list query with `limit()`** (page size 50, cursor via `startAfter()`), as Phase 2's
  contacts and questions screens already do.
- **The tier ladder and cost projection read `aggregates/guestTotals`, not the household list** —
  that is what the aggregate is for. Updated transactionally on household create/update/delete,
  and **not** on `guests` writes.
- Filtered counts not covered by the aggregate's keys are computed over the loaded page
  client-side — filtered views are exploratory, and this is far cheaper than a query per filter
  combination.
- Add composite indexes to `firestore.indexes.json` **as a query needs them** (household filtered
  by tier + ordered, say), not via runtime errors in production. It is currently empty.
  **[MANUAL]** deploy with `--only firestore:indexes`.

## UX guidance

- Mobile-first; ≥44px tap targets; 16px type (smaller makes iOS Safari zoom on focus).
- Reuse `src/components/ui/form.tsx` and the warm rose/stone/white theme. Chips, not dropdowns.
- Keep the single light theme and the centered max-width app column.
- The entry form is the make-or-break screen. Five fields visible, everything else behind an
  expander.

## Navigation mapping

- **Guests** → the list, the tier ladder, filters, the room block, CSV import/export.
- **Home** → add current headcount against target, from `aggregates/guestTotals` (§8 already
  anticipates this).
- Budget, Plan and More are unchanged.

---

## Out of scope — do not build (later phases)

RSVP tracking, chase lists, dietary summaries, invitation delivery status, seating charts
(Phase 6) — all of them are a field on the guest document plus a query when the time comes, which
is exactly why §4.1 puts guests in their own collection. Expenses, splits, settlements and
balances (Phase 4). Tasks, run sheets and the planning timeline (Phase 5+). Receipts, Firebase
Storage, photo upload and AI expense categorisation (Phase 6).

**No AI in this phase.** The comparison assist stays the only AI feature. In particular: no
AI-guessed guest data, and nothing AI-driven near headcount or cost.

## Definition of done

1. A household can be added with **five fields** (name, side, tier, adults, children) and nothing
   else; the rest is optional and behind an expander.
2. "Dad's colleagues, 12 people" saves with **zero** guest documents and counts as 12 everywhere.
3. **Tier ladder** shows cumulative running totals, a target headcount, and which tier breaks it.
4. **Cost projection** per tier from `perPlateEstPaise` × planned headcount over invited events,
   and the **marginal delta shows live while adding** a household.
5. Named **guests** can be added under a household; "12 planned · 3 named" is visible, and the
   count is never silently rewritten from the names.
6. Filters are combinable and **every count on screen respects them**.
7. **CSV import** with column mapping, a dry-run preview and duplicate warnings; **CSV export**.
8. Duplicate warning fires at entry on a fuzzy name or phone match.
9. Every new collection is enforced in `firestore.rules` with an emulator test including
   cross-tenant denial; **rules deployed**.
10. All list queries bounded with `limit()`. Money via `src/lib/money.ts` (integer paise).
11. Firebase still on **Spark**; no Cloud Functions, no Storage. Vercel still on **Hobby**.

## Standing rules (unchanged from Phases 1–2 / CLAUDE.md)

- Ask before deviating from the stack; flag anything that costs money (especially Cloud Functions
  → Blaze) before building it.
- Comment anything with a cost or security implication.
- Bound every query with `limit()`.
- Explain any remaining manual steps click-by-click. The expected manual steps this phase are
  **deploying updated rules and indexes** — no new Firebase console setup, no new host wiring, no
  new environment variables.
