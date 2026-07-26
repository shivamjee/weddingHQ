# PHASE2.md — Decision support

Scope for Phase 2. Read `CLAUDE.md` (stack, hosting, **§ Multi-tenancy**, constraints) and
`FEATURES.md` **§0–§5** before starting. Phases 1 and 1.5 are complete; their briefs are in
`PHASE1.md` and `PHASE1.5.md` (kept as records — the foundation they describe is what you build
on here).

> **Everything in this phase is per-wedding.** Every collection named below lives under
> `tenants/{tenantId}/…`, and sides are `"a"` / `"b"` with labels from the tenant document — never
> `"shivam"` / `"swara"`. Build paths with `src/lib/paths.ts`; read `canWrite` and `sideLabel()`
> from `useTenant()` rather than checking a role or naming a person in the UI.

**Goal:** turn the empty shell into a working *planning and decision-support* tool a year out —
the couple can set up their categories/events and per-side budget allocations, and the family can
collaboratively compare vendors, track questions to ask, and keep contacts. **No money has moved
yet** — this phase is about deciding, not spending.

This maps to `FEATURES.md` §10 **Phase 2 — Decision support**: categories & events setup,
comparison tables, open questions grouped by who to ask, contacts, and per-side budget
allocations (allocation health + side-by-side comparison) — **planning only, no expense entry.**

**One addition beyond `FEATURES.md` §10 as written:** Step 4b adds an **AI assist on comparison
tables** (now specified in `FEATURES.md` §3.3) — plain-English notes in, suggested criteria and a
filled-in option out. It borrows the free Vercel route-handler pattern from `FEATURES.md` §9.1
(written for the Phase 6 expense categoriser) and pulls it forward, because the comparison table
is where the "I didn't know to ask that" problem actually bites. Everything §9.1 says still binds:
no Cloud Functions, key server-side only, and **never auto-save without confirmation**.

---

## What Phases 1 and 1.5 already give you (build on this, don't rebuild)

- **Identity** — `src/lib/auth/AuthProvider.tsx` exposes `{ user, profile, isAdmin, loading }`.
  Global only: no role or side lives here.
- **Wedding context** — `src/lib/tenants/TenantProvider.tsx` exposes `{ tenantId, tenant,
  membership, role, side, canWrite, sideLabel(side) }` to everything under `/t/[tenantId]/…`.
  **This is the one place Phase 2 screens should get write permission and side labels from.**
  `src/lib/tenants/MembershipsProvider.tsx` holds the caller's weddings. Route protection is in
  `src/app/t/[tenantId]/layout.tsx`.
- **Paths** — `src/lib/paths.ts` builds every Firestore reference (`categoriesCol(tenantId)`, …).
  Add new per-wedding collections there rather than concatenating paths in a component.
- **Types for §1 collections** — `src/types/` has `User`, `Tenant`, `Membership`, `Event`,
  `Category`, `CurrencySettings`. Add new collection types here in the same style.
- **Money** — `src/lib/money.ts`: `Paise` branded type, `formatINR`, `formatCompact`, `convert`.
  All money is integer paise. Use these everywhere; never format money ad-hoc.
- **Security rules** — `firestore.rules` uses `isTenantMember(tid)` / `isTenantCouple(tid)` /
  `isAdmin()`, default-deny, and already allows member-read + couple-write on the tenant's
  `categories`, `events`, `settings`. Extend it inside the `match /tenants/{tenantId}` block, per
  the same pattern. Tests live in `tests/rules/` (`npm run test:rules`, Firestore emulator) and
  already run against two tenants — **add cross-tenant denial cases for each new collection.**
- **Nav shell** — bottom tabs Home / Budget / Guests / Plan / More, tenant-scoped hrefs. Home,
  Budget, Guests and Plan are still `EmptyState`; More is a real People screen. Phase 2 fills
  **Budget**, **Plan**, and adds Setup to **More**; **Guests** stays empty (Phase 3).
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
- `tenants/{tenantId}/budgets/{side}_{categoryId}` (side is `a` or `b`, so ids look like
  `a_venue`): `side`, `categoryId`, `allocatedPaise`, `notes`, `updatedAt`.
- `tenants/{tenantId}/budgets/_totals_{side}`: `totalBudgetPaise` (e.g. ₹20L for one side, ₹30L
  for the other). Flat, not a subcollection — `budgets/_totals/{side}` would be a subcollection of
  a document and needs its own rules block for no benefit.
- **Allocation health, per side** (§2.6): total budget vs the sum of that side's category
  allocations, as one bar with an explicit **unallocated remainder**. If allocations exceed the
  total, show over-allocation. The unallocated remainder is the number that quietly gets eaten —
  show it, don't make it inferred.
- **Side-by-side allocation comparison** (§2.6): side A's categories against side B's, same chart,
  same category colours. This is the actual planning conversation right now.
- Charts via **Recharts** (new dependency — client-only, free). **Horizontal** bars for anything
  with category names (labels are unreadable on a phone otherwise).
- **Do NOT build** the projected-total/consumption/balances analytics — those need expenses
  (Phase 4). This is allocation planning only.

### Step 3 — Contacts (Plan tab)
Simple, high-value, and referenced by questions/comparisons. See `FEATURES.md` §5.
- `tenants/{tenantId}/contacts/{contactId}`: name, organisation, role, type, phone(s), email, address, categoryId,
  eventIds, notes, isBooked.
- **Tap-to-act** links are most of the point on a phone: `tel:`, `mailto:`, and a WhatsApp
  `https://wa.me/91XXXXXXXXXX` link.
- Search by name/organisation/role; filter by type and category (filter the loaded page
  client-side — no query per keystroke).

### Step 4 — Open questions (Plan tab)
See `FEATURES.md` §3.1.
- `tenants/{tenantId}/questions/{id}`: text, askWho (free text), contactId, categoryId, eventId, status
  (open|asked|answered|moot), answer, timestamps.
- **Default view groups by `askWho`** — "here are the 6 things to raise with the caterer on
  Thursday" is the entire point; a flat list is not useful. Filters: status, category, event.

### Step 5 — Comparison tables (Plan tab)
Generic by design — the same component serves venues, caterers, photographers. See §3.2 (data
model + rendering) and §3.3 (the AI assist built in Step 4b below).
- `tenants/{tenantId}/comparisons/{id}`: name, `criteria[]` (`{id,label,type,weight}`; type = text|number|money|
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

### Step 5b — AI assist for comparisons ("describe it, get columns and a filled row")

Build after Step 4 works without it. The manual comparison table must stand on its own — this is
an accelerator on top, never a dependency.

**The problem it solves:** the criteria you can think of in advance are not the criteria that turn
out to matter. You come back from a site visit with a paragraph of notes and the table has no
column for generator backup, DJ curfew or whether they'll let an outside caterer in. Adding six
criteria by hand and then back-filling them for every option is enough friction that it doesn't
happen, so the notes rot in WhatsApp instead.

**The flow — one text box, several outputs:**

1. On a comparison, **"Add with AI"** opens a sheet with a single free-text box. Paste or dictate
   anything: visit notes, a forwarded message from the venue, a brochure blurb, or just
   *"Taj Palace, holds about 500, ₹1,800 a plate, no in-house alcohol licence, parking for 80
   cars, they were cagey about the DJ curfew."*
2. Send that text **plus the comparison's existing `criteria[]`** (labels + types only) to a server
   route handler (see *Where it runs* below).
3. The model returns strict JSON:
   - `values{}` — proposed values for **existing** criteria, each with a confidence and the
     snippet of source text it came from;
   - `newCriteria[]` — criteria worth adding (`label`, `type`, `weight`, `why`): things the text
     talks about that have no column yet. **This is the headline feature** — it's the part that
     covers what you didn't think to ask;
   - `summary` — 2–3 sentences describing the option in prose;
   - `unknowns[]` — what it couldn't determine. These are candidate **open questions** (Step 5);
     offer "add to Questions" with `askWho` prefilled from the option's contact.
4. **Review screen. Nothing auto-saves.** Every proposed value, every new criterion and the summary
   gets its own checkbox — pre-checked only above a confidence threshold — and is editable inline.
   One **Apply** writes the option and any accepted new criteria in a single batch.
5. A newly added criterion is simply **blank on existing options**. Optionally offer "fill this for
   the other options too", which re-runs extraction per option against that option's own stored
   notes/summary — and leaves it blank when the notes don't say. It must never invent a value.

**Non-negotiables** (same rules as `FEATURES.md` §9.1):

- **Never auto-save.** AI output is a suggestion in a review UI; a human confirms every field.
- **Keep provenance.** Values written from a suggestion carry `source: "ai"` and a confidence, and
  render with a small "AI" chip in both cards and table; the chip clears once a human edits the
  value. An unverified guess must never look identical to something someone confirmed on a call.
- **Money never comes back formatted.** The model returns a bare number plus a unit hint
  (`1800`, `"per plate"`); the server converts to integer paise via `src/lib/money.ts`. Reject
  anything that doesn't parse cleanly — do not `Number()` a string like "₹1.8k" and hope.
- **Validate server-side before the client sees it.** Ask for structured output (Gemini's
  `responseMimeType: "application/json"` + a response schema) rather than parsing prose, then
  validate against a **zod** schema in the handler. On a parse failure, retry once, then fail with
  a plain-English error — never a partial write.
- Proposed criteria may only use the five existing types (`text|number|money|rating|boolean`).
  Anything else is dropped server-side.

**Where it runs — this is a stack addition; flag it before building.** Until now the app is pure
client + Firestore rules, with no server of its own. This needs one **Next.js Route Handler on
Vercel** — the free path already sketched in `FEATURES.md` §9.1 for the Phase 6 categoriser, now
arriving early: `src/app/api/ai/compare/route.ts`, on Vercel Hobby (free; non-commercial use, so
the Hobby terms are fine). **Firebase stays on Spark — no Cloud Functions, no Blaze.**

- The API key lives in `GEMINI_API_KEY`: a Vercel environment variable **with no `NEXT_PUBLIC_`
  prefix**, plus `.env.local` for dev. `NEXT_PUBLIC_` would inline the key into the browser bundle
  and hand it to anyone who opens DevTools — unlike the `NEXT_PUBLIC_FIREBASE_*` values, this one
  is a real secret. Comment that in the file.
- **The route must authenticate the caller.** An open endpoint is a stranger spending your quota.
  The client sends its Firebase ID token (`getIdToken()`) as a bearer header; the handler verifies
  it and checks the caller is a member of the tenant named in the request. Two free ways to verify
  — **pick one and tell me which before building**: (a) `firebase-admin`, which needs a
  service-account JSON in a Vercel env var (a genuine new secret to manage); or (b) verify the JWT
  against Google's public certs with `jose` — no service account, no new secret. **(b) preferred.**
- **The handler never writes to Firestore.** It returns a suggestion; the client performs the write
  under the existing member-write rule on `comparisons`. So this feature adds **no new rules
  surface and no new collection** — the security boundary stays exactly where it is.
- Keep it inside Hobby's execution limit: one call, a `flash`-class model, no streaming, input
  capped at ~8k characters (truncate with a visible warning), ~20s timeout with a friendly failure.
- **Degrade gracefully with no key.** If `GEMINI_API_KEY` is unset, hide the AI button; everything
  else works. The build must never fail for a missing key — local dev and preview deploys often
  won't have one.

**Provider (free, and swappable):**

- Default to **Google Gemini** via AI Studio's free tier, a `flash-lite`-class model — no credit
  card, and a family evaluating a handful of vendors will never approach the ceiling. Free quotas
  are per-project, roughly in the tens of requests per minute and hundreds-to-a-thousand per day,
  and Google has cut them before — **read the live numbers in AI Studio when you wire it up**
  rather than trusting a figure written in this file.
- Two things to know first. Free-tier prompts **may be used to improve Google's models**: venue
  notes are low-stakes, but don't paste anything you wouldn't say in front of the vendor, and
  **never put `contacts` phone numbers or emails into a prompt**. And handle **429** with
  exponential backoff and a "try again in a minute" message, not a stack trace.
- Put the provider behind one module — `src/lib/ai/provider.ts` exposing something like
  `generateJSON(prompt, schema)`. Swapping to another free tier (Groq, OpenRouter, Mistral) must
  be a one-file change. Nothing else in the app imports an AI SDK.

**Out of scope for the AI feature:** no browsing or scraping vendor websites, no PDF/image
ingestion (Storage is off until Phase 6), no chat interface, no AI-written budget advice, and
nothing AI-driven anywhere near money movement. Text in, structured suggestion out, human confirms.

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

`FEATURES.md` §3.2 now also carries the Step 4b provenance fields — `ComparisonOption.summary`,
`ComparisonOption.valueMeta`, and `Comparison.criteria[].source` — so mirror the same three fields
onto the `Comparison`/`ComparisonOption` TypeScript interfaces. No new collection and no new
AI-specific document type: suggestions are transient and live only in the review sheet until
`Apply` writes them into the existing shape.

## Security rules (the boundary — update `firestore.rules` + tests per collection)

Every block below goes **inside `match /tenants/{tenantId}`**, alongside the existing
`categories` / `events` / `settings` blocks, using the same
`isTenantMember(tenantId)` / `isTenantCouple(tenantId)` / `isAdmin()` helpers. Default-deny still
covers anything without a block. "member" and "couple" below mean *of this tenant*; a global admin
can always write.

| Collection (under `tenants/{tenantId}/`) | Read | Write |
|---|---|---|
| `categories`, `events`, `settings/*` | member | couple *(already in rules)* |
| `budgets/*` | member | **couple** (financial decisions; everyone sees everything per §0) |
| `contacts/*` | member | **member** (collaborative planning) |
| `comparisons/*` + `.../options/*` | member | **member** (collaborative) |
| `questions/*` | member | **member** (collaborative) |

Add emulator tests in `tests/rules/` for each new collection: member allowed, non-member denied,
couple-only enforced on `budgets`, **and a member of the other tenant denied** — the fixtures
already set up two weddings for exactly this. **[MANUAL]** redeploy rules after changing them:
`npx firebase deploy --only firestore:rules --project weddinghq-d125b`.

**Step 4b changes none of the above.** The AI route handler reads nothing and writes nothing in
Firestore — it takes text, returns a suggestion, and the *client* writes the confirmed result to
`comparisons` under the member-write rule already in this table. The handler's own gate (verify
Firebase ID token → confirm tenant membership) exists to protect the API quota, not the data, and
must be tested separately from the rules suite: an unauthenticated POST and a POST from a
non-member of the named tenant both get a 401/403.

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
/ tiers (Phase 3); tasks / planning timeline / run sheets (Phase 5+); **AI expense categorisation**,
email reminders, receipts, Firebase Storage / photo upload, RSVP (Phase 6). If a feature needs
expenses or guests to be meaningful, it belongs to a later phase.

The **only** AI in this phase is Step 4b's comparison assist. In particular: no AI on budgets or
allocations, no AI-generated questions or contacts beyond the `unknowns[]` hand-off in 4b, no chat
assistant, no scraping vendor sites, and no AI expense categorisation (that stays Phase 6 — it
will reuse the `src/lib/ai/provider.ts` module and route-handler pattern 4b establishes).

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
6. **AI comparison assist**: a paragraph of plain-English notes produces (a) suggested **new
   criteria** added to the table, (b) filled **values** for existing criteria, and (c) a **summary**
   on the option — all landing in a review screen where **nothing saves without confirmation**,
   AI-sourced values carry a visible "AI" marker, and money arrives as validated integer paise.
   With `GEMINI_API_KEY` unset the button is hidden and the rest of the app is unaffected.
7. The AI route handler **rejects unauthenticated callers and non-members of the named tenant**,
   and the Gemini key appears nowhere in the client bundle (grep the build output for it).
8. Every new collection is enforced in `firestore.rules` with an emulator test; **rules deployed**.
9. All list queries are bounded with `limit()`. Money uses `src/lib/money.ts` (integer paise).
10. Firebase is still on the **Spark** plan; no Cloud Functions, no Storage. Vercel is still on
    **Hobby**; the AI route is a normal route handler, nothing billable was enabled.

## Standing rules (unchanged from Phase 1 / CLAUDE.md)

- Ask before deviating from the stack; flag anything that costs money (especially Cloud Functions
  → Blaze) before building it.
- Comment anything with a cost or security implication.
- Bound every query with `limit()`.
- Explain any remaining manual steps click-by-click. The expected manual steps this phase are:
  1. **Deploying updated rules/indexes** (`npx firebase deploy`) — no new Firebase console setup,
     no new host wiring (see the hosting runbook in `CLAUDE.md`).
  2. **Getting a Gemini API key** for Step 4b (Google AI Studio → create key → free tier, no card),
     then adding `GEMINI_API_KEY` to `.env.local` **and** to Vercel → Settings → Environment
     Variables for Production *and* Preview, followed by a redeploy so the running build picks it
     up. Give me this click-by-click when Step 4b starts, and confirm afterwards that the key is
     unprefixed and absent from the client bundle.
