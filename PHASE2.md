# PHASE2.md — Decision support

Scope for Phase 2. Read `CLAUDE.md` (stack, hosting, security model, constraints) and
`FEATURES.md` **§0–§5** before starting. Phase 1 is complete; its brief is in `PHASE1.md` (kept
as a record — the foundation it describes is what you build on here).

**Goal:** turn the empty shell into a working *planning and decision-support* tool a year out —
the couple can set up their categories/events and per-side budget allocations, and the family can
collaboratively compare vendors, track questions to ask, and keep contacts. **No money has moved
yet** — this phase is about deciding, not spending.

This maps to `FEATURES.md` §10 **Phase 2 — Decision support**: categories & events setup,
comparison tables, open questions grouped by who to ask, contacts, and per-side budget
allocations (allocation health + side-by-side comparison) — **planning only, no expense entry.**

---

## What Phase 1 already gives you (build on this, don't rebuild)

- **Auth + allowlist gate** — `src/lib/auth/AuthProvider.tsx` exposes `{ user, profile, loading }`.
  `profile.role` (`"couple"` | `"family"`) and `profile.side` (`"shivam"` | `"swara"`) are set and
  trustworthy. Route protection is in `src/app/(app)/layout.tsx`.
- **Types for §1 collections** — `src/types/` already has `User`, `AllowlistEntry`, `Event`,
  `Category`, `CurrencySettings`. Add new collection types here in the same style.
- **Money** — `src/lib/money.ts`: `Paise` branded type, `formatINR`, `formatCompact`, `convert`.
  All money is integer paise. Use these everywhere; never format money ad-hoc.
- **Security rules** — `firestore.rules` uses `isMember()` / `isCouple()` helpers, default-deny,
  and already allows member-read + couple-write on `categories`, `events`, `settings`. Extend it
  per the same pattern. Tests live in `tests/rules/` (`npm run test:rules`, Firestore emulator).
- **Nav shell** — bottom tabs Home / Budget / Guests / Plan / More, each currently an
  `EmptyState`. Phase 2 fills **Budget**, **Plan**, and **More**; **Guests** stays empty (Phase 3).
- **PWA + deploy** — installable, auto-deploys on push to `main`. Nothing to redo.

---

## Build order

Dependencies first. Ship each step working before the next. Update `firestore.rules` **and its
tests** as part of the step that introduces a collection — not as an afterthought.

### Step 1 — Categories & events setup (foundational config)
Everything else references these, so build them first. Both are couple-writable, member-readable
(rules already allow this).
- CRUD for `categories` (`FEATURES.md` §1.2): name, colour, order. Reorderable. Colour picker —
  colours must stay consistent across all charts app-wide.
- CRUD for `events` (§1.2): name, date (nullable — the wedding is far out), `perPlateEstPaise`
  (drives Phase 3 guest projections; capture it now), order, colour.
- Lives under **More** (a "Setup" / "Settings" area). Consider seeding sensible default
  categories (Venue, Food, Decor, Attire, Jewellery, Transport) and events (Mehendi, Sangeet,
  Wedding, Reception) as one-tap suggestions — but let the couple edit/delete freely.
- **No budget amount on a category** (§1.2) — budgets are per-side and live in their own
  collection (Step 2). A category is just a shared label.

### Step 2 — Per-side budget allocations + allocation health (Budget tab)
Planning only — allocations, not expenses. See `FEATURES.md` §2.1 and the planning parts of §2.6.
- `budgets/{side}_{categoryId}`: `side`, `categoryId`, `allocatedPaise`, `notes`, `updatedAt`.
- `budgets/_totals/{side}`: `totalBudgetPaise` (e.g. ₹20L for Shivam's side, ₹30L for Swara's).
- **Allocation health, per side** (§2.6): total budget vs the sum of that side's category
  allocations, as one bar with an explicit **unallocated remainder**. If allocations exceed the
  total, show over-allocation. The unallocated remainder is the number that quietly gets eaten —
  show it, don't make it inferred.
- **Side-by-side allocation comparison** (§2.6): Shivam's categories against Swara's, same chart,
  same category colours. This is the actual planning conversation right now.
- Charts via **Recharts** (new dependency — client-only, free). **Horizontal** bars for anything
  with category names (labels are unreadable on a phone otherwise).
- **Do NOT build** the projected-total/consumption/balances analytics — those need expenses
  (Phase 4). This is allocation planning only.

### Step 3 — Contacts (Plan tab)
Simple, high-value, and referenced by questions/comparisons. See `FEATURES.md` §5.
- `contacts/{contactId}`: name, organisation, role, type, phone(s), email, address, categoryId,
  eventIds, notes, isBooked.
- **Tap-to-act** links are most of the point on a phone: `tel:`, `mailto:`, and a WhatsApp
  `https://wa.me/91XXXXXXXXXX` link.
- Search by name/organisation/role; filter by type and category (filter the loaded page
  client-side — no query per keystroke).

### Step 4 — Comparison tables (Plan tab)
Generic by design — the same component serves venues, caterers, photographers. See §3.2.
- `comparisons/{id}`: name, `criteria[]` (`{id,label,type,weight}`; type = text|number|money|
  rating|boolean). `comparisons/{id}/options/{optionId}`: name, contactId, `values{}`, notes,
  status (considering|shortlisted|rejected|booked).
- **Two views, this is the hard part on mobile:** Cards (default on mobile — one option per card,
  criteria as label/value rows, swipe/tab between options) and Table (default on desktop — options
  as columns, criteria as rows, sticky first column).
- **"Highlight best"** toggle: mark the winning value per numeric criterion (lowest for money,
  highest for rating). Optional weighted score, kept visually secondary to raw numbers.
- Seed a new venue comparison with editable default criteria: capacity, per-plate cost, rental
  cost, in-house catering required, parking, AC, distance, available dates.
- **Photos:** the model has `photoURLs`, but **Firebase Storage is NOT enabled** (Phase 6). Do
  **not** build photo upload this phase. At most allow pasting an external image URL; otherwise
  omit photos and flag it.

### Step 5 — Open questions (Plan tab)
See `FEATURES.md` §3.1.
- `questions/{id}`: text, askWho (free text), contactId, categoryId, eventId, status
  (open|asked|answered|moot), answer, timestamps.
- **Default view groups by `askWho`** — "here are the 6 things to raise with the caterer on
  Thursday" is the entire point; a flat list is not useful. Filters: status, category, event.

### Step 6 — (Optional / stretch)
- A light **Home** summary (allocation health bar + open-questions count). Full Home is later once
  more data exists — keep it minimal or skip.
- **Currency display toggle** (§1.4): `settings/currency.rates` editable by the couple (under
  More); a user preference to show amounts via `convert()`. Optional — INR default is fine for now.

---

## New data models

Add TypeScript interfaces in `src/types/` (same style as existing ones; money fields use `Paise`):
`Budget` + `BudgetTotals` (§2.1), `Contact` (§5), `Comparison` + `ComparisonOption` (§3.2),
`Question` (§3.1). `Event`, `Category`, `CurrencySettings` already exist.

## Security rules (the boundary — update `firestore.rules` + tests per collection)

Follow the Phase 1 pattern (default-deny; open per collection). Recommended model:

| Collection | Read | Write |
|---|---|---|
| `categories`, `events`, `settings/*` | member | couple *(already in rules)* |
| `budgets/*` | member | **couple** (financial decisions; everyone sees everything per §0) |
| `contacts/*` | member | **member** (collaborative planning) |
| `comparisons/*` + `.../options/*` | member | **member** (collaborative) |
| `questions/*` | member | **member** (collaborative) |

Add an emulator test in `tests/rules/` for each new collection (member allowed, non-member denied,
and couple-only enforced on `budgets`). **[MANUAL]** redeploy rules after changing them:
`npx firebase deploy --only firestore:rules --project weddinghq-d125b`.

## Read-cost & indexes (CLAUDE.md §3 / FEATURES §1.5)

- **Bound every list query with `limit()`** (page size 50, cursor via `startAfter()`). No unbounded
  `getDocs()` on `contacts`, `questions`, or comparison `options`.
- **Budgets need no aggregate doc** — a side has at most `#categories` allocation docs, so reading
  them directly (bounded) to compute allocation health is cheap. The aggregate-doc pattern (§2.5)
  is for **expenses** (Phase 4), not for this.
- Add composite indexes to `firestore.indexes.json` **as a query needs them** (e.g. questions
  filtered + ordered), not via runtime errors in production. **[MANUAL]** deploy indexes with the
  rules command above (`--only firestore:indexes`).

## UX guidance

- Mobile-first; ≥44px tap targets; legible type (older, non-technical users).
- Category/event pickers as **chip rows**, not dropdowns. Filters as removable chips.
- Reuse the `EmptyState` component and the warm rose/stone/white theme already established.
- Keep the existing single light theme (no dark mode) and the centered max-width app column.

## Navigation mapping

- **Budget** → allocations + allocation health + side-by-side (Step 2).
- **Plan** → Comparisons, Questions, Contacts (Steps 3–5) — use sub-sections or a simple
  in-tab switcher; don't overload one screen.
- **More** → Setup (categories, events), optional currency rates, plus the existing sign-out.
- **Home** → optional light summary (Step 6). **Guests** stays an `EmptyState` (Phase 3).

---

## Out of scope — do not build (later phases)

Expenses / spending / the three states, splits, settlements, balances, settle-up, aggregate
totals (`aggregates/*`), the projected-total/consumption analytics (Phase 4); guests / households
/ tiers (Phase 3); tasks / planning timeline / run sheets (Phase 5+); AI categorisation, email
reminders, receipts, Firebase Storage / photo upload, RSVP (Phase 6). If a feature needs expenses
or guests to be meaningful, it belongs to a later phase.

## Definition of done

1. Couple can create/edit/reorder **categories** and **events**; non-couple cannot (enforced by
   rules, verified by a test).
2. Each side's **total budget** and **per-category allocations** can be set; **allocation health**
   (total vs allocated + explicit unallocated remainder) and **side-by-side comparison** render as
   horizontal Recharts bars with consistent category colours.
3. **Comparison tables** work end-to-end: create a comparison with criteria, add options, cards on
   mobile + table on desktop, "highlight best" marks winning numeric values; a venue comparison
   seeds with editable default criteria.
4. **Open questions** can be added and **grouped by `askWho`**, filterable by status/category/event.
5. **Contacts** can be added with working `tel:` / `mailto:` / WhatsApp links; searchable and
   filterable.
6. Every new collection is enforced in `firestore.rules` with an emulator test; **rules deployed**.
7. All list queries are bounded with `limit()`. Money uses `src/lib/money.ts` (integer paise).
8. Firebase is still on the **Spark** plan; no Cloud Functions, no Storage.

## Standing rules (unchanged from Phase 1 / CLAUDE.md)

- Ask before deviating from the stack; flag anything that costs money (especially Cloud Functions
  → Blaze) before building it.
- Comment anything with a cost or security implication.
- Bound every query with `limit()`.
- Explain any remaining manual steps click-by-click. The only expected manual steps this phase are
  **deploying updated rules/indexes** (`npx firebase deploy`) — no new Firebase console setup, no
  new host wiring (see the hosting runbook in `CLAUDE.md`).
