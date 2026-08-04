# FEATURES.md — Wedding App

Companion to `CLAUDE.md`. That file defines the **stack and constraints** and is authoritative on
both. This file defines **what to build and in what order**. Read both before starting work.

Couple: Shivam and Swara. Wedding is more than a year out — the app's job right now is
**planning and decision support**, not day-of execution. Build order in §10 reflects that.

---

## 0. Settled decisions

These were worked through deliberately. Do not re-derive or quietly change them.

| Decision | Choice |
|---|---|
| Tenancy | **weddingHQ holds many weddings.** One wedding = one tenant; all its data lives under `tenants/{tenantId}/…`. Added in Phase 1.5 — see `PHASE1.5.md` and `CLAUDE.md` § Multi-tenancy. |
| Sides | Identified as **`"a"` / `"b"`**, with display labels ("Shivam", "Swara") on the tenant doc. Never hardcode a person's name as a value. |
| Expense splits | Between **individuals**. People transfer money, not families. |
| Budgets | Per **side**. Shivam's family ~₹20L, Swara's ~₹30L, separate allocations. |
| Budget consumption | Driven by **shares**, never by who paid. See §2.2 — this is the one that's easy to get wrong. |
| Side membership | Every person belongs to **exactly one** side. Joint spending is an expense split between Shivam and Swara. |
| Budget visibility | **Everyone sees everything.** No per-side hiding. Simplifies rules and UI. |
| Currency | Stored **always in INR**. Other currencies are a display-time conversion only. |
| Expense lifecycle | Three states: **estimated / committed / paid**. See §2.3. |
| Guest management | **Households** are the invitation unit, with **tiers** (must / should / if_space). No quotas. Named guests are separate top-level documents; head **counts** live on the household and are never derived from them (§4.1). |

---

## 1. Cross-cutting foundations

Build these first. Everything depends on them.

### 1.1 Tenants, users and memberships

> Rewritten in Phase 1.5. The previous single-wedding `allowlist` model is gone.
> `CLAUDE.md` § Multi-tenancy is authoritative; this is the same model in feature terms.

```
tenants/{tenantId}                       // one wedding
  name           string                  // "Shivam & Swara"
  sideA          { label: string }       // "Shivam"
  sideB          { label: string }       // "Swara"
  weddingDate    timestamp | null
  archived       boolean
  createdBy      uid
  createdAt      timestamp

users/{uid}                              // GLOBAL identity — no wedding data
  email          string
  displayName    string
  photoURL       string | null
  isAdmin        boolean                 // reaches every tenant; console-set only
  createdAt      timestamp
  lastSeenAt     timestamp

memberships/{tenantId}__{emailLowercased}   // invitation AND membership, in one doc
  tenantId       string
  email          string                  // lowercased; must match the doc id
  role           "couple" | "family"     // scoped to THIS wedding
  side           "a" | "b"
  displayName    string | null           // shown before their first sign-in
  invitedBy      uid
  invitedAt      timestamp
  uid            string | null           // stamped on first sign-in
  lastSeenAt     timestamp | null
```

Sign-in: Google → upsert `users/{uid}` → query `memberships where email == mine` → no results and
not an admin, show a "not invited" screen; one result, go straight into that wedding; more than
one (or an admin), show the wedding picker.

The couple writes a membership fully formed, so **nobody ever creates their own access**. An
invitee may update only `uid` and `lastSeenAt` on their own membership.

**Enforce in Firestore security rules, not just the UI.** Rules check membership by the existence
of `memberships/{tenantId}__{callerEmail}`.

> Revised in the Phase 2.1 QA round: any member of a tenant may now write that wedding's data —
> `categories`, `events`, `settings`, `budgets`, `contacts`, `questions`, `comparisons`, and the
> tenant doc's own name/labels/date. Only `role == "couple"` *of that tenant* — or a global admin
> — may write `memberships`, i.e. invite or remove people. That is also the privilege-escalation
> boundary, so it stays the one thing still gated. See `CLAUDE.md` § Multi-tenancy for the current
> `canWrite` / `canInvite` split.

Bootstrap problem: the first tenant, its first `couple` membership, and the first `isAdmin` flag
are created by hand in the Firestore console, since nobody can sign in to create them. Covered in
§11 and in `CLAUDE.md`.

All per-wedding collections defined below (`categories`, `events`, `settings`, and everything in
§2–§9) live under `tenants/{tenantId}/…`, even where a section shows a bare collection name.

### 1.2 The two shared dimensions

Nearly every record is tagged with one or both. `side` is a third dimension but lives on people,
not on records — a record's side is derived from whoever it belongs to.

```
events/{eventId}
  name              string        // "Mehendi", "Sangeet", "Wedding", "Reception"
  date              timestamp | null
  venueOptionId     string | null // → comparison option, once chosen
  perPlateEstPaise  number        // drives guest cost projection (§4.4)
  order             number
  colour            string        // hex; keep chart colours consistent app-wide
  icon              string?       // optional emoji, added Phase 2.1; colour stays required
```

```
categories/{categoryId}
  name           string        // "Decor", "Venue", "Food", "Transport", "Attire", "Jewellery"
  colour         string
  order          number
  icon           string?       // optional emoji, added Phase 2.1 QA; charts still fill from colour
```

Note there is **no budget amount on the category** — budgets are per side, so they live in their
own collection (§2.1). A category is just a label shared by both sides.

### 1.3 Money representation

**All money is an integer number of paise. Never a float.** `₹13,00,000` is `130000000`. Field
names end in `Paise` so this is impossible to forget.

Rupee floats produce settlements that don't balance by a few paise, and debugging that later is
miserable. Format for display only at the render edge.

Display: Indian grouping (`₹13,00,000`) with a compact form for charts and summaries (`13L`,
`1.2Cr`). Pick one helper module and use it everywhere.

### 1.4 Currency display

```
settings/currency
  rates          { USD: number, EUR: number, GBP: number, AED: number }  // units per 1 INR
  updatedAt      timestamp
  updatedBy      uid
```

A user-level preference selects the display currency; INR is the default. Conversion happens at
render time from the single rates doc.

**Do not store converted values, and do not snapshot a rate per expense.** Historical-rate
conversion sounds more correct but means an expense's USD value differs by screen, and it
requires a rate on every record. A display-time toggle at the current rate is what's actually
wanted here.

Rates are hand-editable by the couple. A daily auto-refresh can come later via the same Vercel
Cron used for reminders (§9.2) — not needed for launch.

### 1.5 Read-cost pattern (hard rules)

Per `CLAUDE.md` §3:

1. **No screen computes a total by scanning a collection.** All totals come from aggregate docs
   (§2.5, §4.5), updated inside the same transaction that writes the underlying record.
2. **All list queries are bounded** — `limit()` always, page size 50, cursor via `startAfter()`.
3. **No query fires per keystroke.** Search filters the loaded page client-side.

Guests is the only collection likely to exceed a few hundred documents. Design its queries for
that from day one.

Composite indexes go in `firestore.indexes.json` as they're needed, not discovered via runtime
errors in production.

---

## 2. Budget and expenses

Two questions that must stay visually separate, because they can point opposite ways:
**"are we within budget?"** and **"who owes whom?"** You can be comfortably under budget while
owing ₹4L, or over budget while being owed money. Never merge them into one number.

### 2.1 Budget allocations

```
tenants/{tenantId}/budgets/{side}_{categoryId}
  side              "a" | "b"
  categoryId        string
  eventId           string | null // Phase 2.1: optional breakdown INSIDE this category's
                                   // amount ("of Decor's ₹2L, ₹50k is Mehendi") — never an
                                   // extra amount. null/absent is the category's own CEILING.
  allocatedPaise    number
  notes             string
  updatedAt         timestamp

tenants/{tenantId}/budgets/_totals_{side}
  totalBudgetPaise  number        // e.g. 200000000 for ₹20L
```

Each side sets its own amount per category — that amount is a ceiling. Optionally, it can be
broken down further per event (`eventId` set); the event amounts are children of the ceiling and
must sum to no more than it, with the difference shown as "unassigned". A category never itemised
by event behaves exactly as before. See `src/lib/budget.ts` (`eventBreakdown`, `eventComparisonRows`)
and `src/lib/tenantIds.ts` (`budgetAllocationId`) for the id scheme and the maths that prevents an
event amount from double-counting into the category or side total. The `_totals_{side}` id (one
underscore, not a subcollection) matches `budgetTotalsId()` — the path shown here was corrected
to match the actual implementation.

The two sides will distribute very differently and that's expected — Swara's side may carry far
more of the accommodation and catering because of guest numbers.

### 2.2 Expenses

```
expenses/{expenseId}
  description     string
  amountPaise     number         // total
  status          "estimated" | "committed" | "paid"    // see §2.3
  categoryId      string
  eventId         string | null  // null for non-event costs (invitations, jewellery)
  date            timestamp      // when spent or due, not when recorded
  paidBy          uid | null     // null while still estimated
  splitMode       "equal" | "exact" | "percentage" | "single"
  shares          [ { uid, amountPaise } ]   // who SHOULD bear it; must sum to amountPaise
  notes           string
  receiptURL      string | null
  createdBy       uid
  createdAt       timestamp
  updatedAt       timestamp
```

**`paidBy` and `shares` are independent, and the distinction is the core of the feature.**

Worked example. Sangeet decor, ₹3L, split evenly between Shivam and Swara. Swara's dad fronts
the entire amount.

- `paidBy` = Swara's dad, `amountPaise` = 30000000
- `shares` = `[{shivam: 15000000}, {swara: 15000000}]`
- Swara's dad is **owed ₹3L** (he paid ₹3L, bears ₹0)
- Shivam's side budget is charged **₹1.5L** of decor — not ₹3L, not ₹0
- Swara's side budget is charged **₹1.5L** of decor

> **Budget consumption follows `shares`, never `amountPaise` and never `paidBy`.**
> Charging the payer's side the full amount is the single most likely bug in this app. Comment
> this at the aggregate-update code.

Single-payer case: if Swara's side covers all guest accommodation, that's one share at 100%.
Lands entirely on her budget, creates no debt. No special-casing needed.

### 2.3 The three states

A signed venue with a ₹2L deposit against an ₹18L contract is neither "spent ₹2L" nor "spent
₹18L". Without this field the budget view understates the real position for the entire first
year.

- **estimated** — a guess. No `paidBy`. Counts toward projections, not toward money owed.
- **committed** — contractually owed. Counts toward budget consumption and projections; creates
  a debt only once someone has actually paid.
- **paid** — money has moved. Counts toward everything, including balances.

Estimated expenses are what make this feature usable *now*, a year out, before any money moves.
A partial payment is modelled as a paid expense plus a committed one for the balance.

Only `paid` expenses affect balances (§2.4). All three affect budget analytics, shown as
distinct segments (§2.6).

### 2.4 Settlements and balances

```
settlements/{settlementId}
  fromUid         uid
  toUid           uid
  amountPaise     number
  date            timestamp
  method          string         // "UPI", "cash", "bank transfer"
  note            string
  createdBy       uid
  createdAt       timestamp
```

A settlement is a transfer of money between people. **It is not an expense and must never appear
in budget totals.**

Per user: `net = (paid on paid-status expenses) − (their shares on paid-status expenses)
+ (settlements they sent) − (settlements they received)`. Positive means owed, negative means
owing.

Then **simplify debts** before display — reduce to the minimum number of transfers rather than
showing every pairwise relationship. Greedy (largest creditor against largest debtor, repeat) is
correct enough at this scale. Render as plain sentences:

> Shivam → Swara's dad: ₹1,50,000   [Settle up]

"Settle up" pre-fills a settlement record.

### 2.5 Aggregates

```
aggregates/budgetTotals
  bySideCategory   { ["a_decor"]: { estimatedPaise, committedPaise, paidPaise } }
  byEvent          { [eventId]: { estimatedPaise, committedPaise, paidPaise } }
  bySide           { a: {...}, b: {...} }
  updatedAt        timestamp

aggregates/balances
  byUid            { [uid]: netPaise }
  updatedAt        timestamp
```

Both updated inside a Firestore **transaction** on every expense/settlement create, update and
delete — including status changes, which move money between the three buckets.

Note `bySideCategory` is keyed on side and category, per §2.2. Splitting a ₹3L expense updates
two keys, not one.

Provide a couple-only **"recalculate totals"** button that rebuilds both docs from scratch.
Drift will happen; build the repair tool now. Comment it as deliberately expensive and bound it
with pagination.

### 2.6 Budget analytics

Every number here answers a decision. Reads come from `aggregates/*` only.

**Projected total — the headline.** Committed + estimated + paid, plus the guest-driven catering
projection (§4.4), against the combined ₹50L. The only honest "are we on track?" number this far
out. Show per side and combined.

**Allocation health, per side.** Total budget versus the sum of that side's category
allocations, as one bar with an explicit **unallocated remainder**. If allocations total ₹22L
against a ₹20L budget, the side is over-allocated before spending a rupee. The unallocated
remainder is the number that quietly gets eaten, so show it rather than leaving it to be
inferred.

**Side-by-side allocation comparison.** Shivam's categories against Swara's, same chart, same
category colours. This is the actual planning conversation at this stage.

**Per category, stacked bar.** Paid / committed / estimated / remaining, one row per category
per side. Red past the allocation. **Sorted by percent consumed, descending** — overruns belong
at the top, not in alphabetical order.

**Per event, all-in.** Total for the Sangeet across both sides, broken down by category. Crosses
the side boundary, which is the entire reason side and event are separate dimensions.

**Top ten line items.** Largest expenses across the wedding, any status. Venue, catering and
jewellery will dominate; confirming that early stops time being spent optimising ₹20k decisions
while a ₹5L one drifts.

**Balances panel.** Simplified transfers, §2.4. On its own screen or a clearly separate card —
never merged into budget health.

Charts via Recharts. Horizontal bars for anything with category names (labels are unreadable on
a phone otherwise). One donut maximum.

**Not yet:** burn-down over time, month-by-month spend, category trend lines. All need spend
history that doesn't exist and will render as empty or misleading charts for months. Add once
there's a year of data.

### 2.7 Expense entry UX

The most repeated action in the app once spending starts. On a phone:

- Amount first, numeric keypad, autofocused.
- Status defaults to `estimated` during planning; make the three states a visible segmented
  control, not a buried dropdown.
- Category and event as horizontal chip rows, not dropdowns.
- Split defaults to the last-used mode; `paidBy` defaults to the current user.
- Remember and pre-select the last-used category and event.
- Show the live budget impact as the amount is typed: *"Decor: ₹8.5L of ₹13L after this."*

### 2.8 Receipts (optional, cost flag)

Firebase Storage on Spark: 5 GB stored, 1 GB/day download. Phone photos are ~3 MB, so a few
hundred receipts fits — **but only with client-side compression** (`browser-image-compression`,
target ≤ 500 KB, max 1600px). Uncompressed uploads will exhaust the daily download quota once
several people browse them. Comment this at the upload code.

---

## 3. Planning board

### 3.1 Open questions

```
questions/{questionId}
  text            string
  askWho          string         // free text: "Venue manager at Taj", "Pandit ji"
  contactId       string | null  // → contacts
  categoryId      string | null
  eventId         string | null
  status          "open" | "asked" | "answered" | "moot"
  answer          string
  askedBy         uid | null
  askedAt         timestamp | null
  createdBy       uid
  createdAt       timestamp
```

**Default view groups by `askWho`.** That grouping is the point of the feature — "here are the 6
things to raise with the caterer on Thursday" is useful in a way a flat list of questions is not.

Filters: status, category, event.

### 3.2 Comparison tables

Generic by design — the same component serves venues, caterers, photographers and decorators.
Building it specific to venues means building it three more times.

```
comparisons/{comparisonId}
  name            string         // "Wedding venues", "Caterers"
  criteria        [ { id, label, type, weight, source } ]
                  // type: "text" | "number" | "money" | "rating" | "boolean"
                  // weight: 1-5, default 3, used for optional scoring
                  // source: "seed" | "human" | "ai" — see §3.3; a criterion the AI
                  //   proposed and a human accepted is tagged "ai" until edited
  createdBy       uid
  createdAt       timestamp

comparisons/{comparisonId}/options/{optionId}
  name            string         // "Taj Palace"
  contactId       string | null
  values          { [criterionId]: string | number | boolean }
  valueMeta       { [criterionId]: { source: "human" | "ai", confidence?: number,
                    aiAt?: timestamp } }
                  // provenance only — kept out of `values` so every existing reader
                  // (table, cards, highlight-best) stays untouched. Absent entry = human.
  summary         string         // short prose description; human-written or AI-suggested
                                  // and confirmed (§3.3). Useful with or without AI.
  notes           string
  photoURLs       [ string ]
  status          "considering" | "shortlisted" | "rejected" | "booked"
  updatedAt       timestamp
```

Criteria are fully user-defined — add, rename, reorder, delete. Deleting warns that stored values
go with it.

Seed a new venue comparison with editable defaults: capacity, per-plate cost, rental cost,
in-house catering required, parking, AC, distance, available dates.

**Mobile rendering is the hard part.** A wide table does not work on a phone. Two views:

- **Cards (default on mobile)** — one option per card, criteria as label/value rows, swipe or tab
  between options.
- **Table (default on desktop)** — options as columns, criteria as rows, sticky first column.

Add a **"highlight best"** toggle marking the winning value per numeric criterion (lowest for
money, highest for rating). An optional weighted score per option is useful but must stay
visually secondary to the raw numbers.

Capacity here feeds the guest tier ladder (§4.4) — a booked venue's capacity becomes the target
headcount.

### 3.3 AI assist on comparisons

The criteria you think of in advance are not the criteria that turn out to matter. You come back
from a site visit with a paragraph of notes and the table has no column for generator backup, DJ
curfew, or whether an outside caterer is allowed. This closes that gap: one free-text box in, a
reviewed, editable set of table changes out.

**Flow:**

1. **"Add with AI"** on a comparison opens a single free-text box — paste or dictate visit notes,
   a forwarded vendor message, a brochure blurb.
2. That text, plus the comparison's existing `criteria[]` (labels + types only, no other options'
   data), goes to a server route handler.
3. The model returns structured JSON:
   - `values{}` — proposed values for **existing** criteria, each with a confidence and the
     source snippet;
   - `newCriteria[]` — criteria the text implies but the table doesn't have yet
     (`label`, `type`, `weight`, `why`). **This is the point of the feature** — covering what
     nobody thought to add a column for;
   - `summary` — 2–3 sentences on the option;
   - `unknowns[]` — what it couldn't determine; offered as candidate **open questions** (§3.1)
     with `askWho` prefilled from the option's contact.
4. **Review screen, nothing auto-saves.** Every value, new criterion, and the summary has its own
   checkbox (pre-checked only above a confidence threshold) and is editable inline. One **Apply**
   writes the option and any accepted criteria in a single batch.
5. A newly accepted criterion is blank on every other existing option. Optional "fill this for the
   others too" re-runs extraction per option against that option's own stored notes/summary, and
   leaves a field blank rather than inventing a value when the notes don't say.

**Non-negotiables** (same standard as §9.1's expense categoriser):

- **Never auto-save.** Every field is a suggestion in a review UI until a human confirms it.
- **Provenance travels with the value.** `valueMeta[criterionId].source: "ai"` renders as a small
  "AI" chip in both cards and table; it clears the moment a human edits the value. An unverified
  guess must never look identical to something confirmed on a call.
- **Money is never trusted pre-formatted.** The model returns a bare number plus a unit hint
  (`1800`, `"per plate"`); the server converts to integer paise via `src/lib/money.ts` and rejects
  anything that doesn't parse cleanly.
- **Structured output, server-validated.** Request JSON output with a schema (Gemini's
  `responseMimeType: "application/json"`), then validate the response against a **zod** schema in
  the handler before it ever reaches the client. One retry on parse failure, then a plain-English
  error — never a partial write.
- Proposed criteria are restricted to the five existing `type` values; anything else is dropped
  server-side.

**Where it runs.** A **Next.js Route Handler on Vercel Hobby** (free) —
`src/app/api/ai/compare/route.ts` — pulling forward the same free-path pattern §9.1 already
specifies for the Phase 6 categoriser, rather than inventing a second one later. **Firebase stays
on Spark; no Cloud Functions.** The handler never writes to Firestore — it returns a suggestion,
and the client performs the write under the existing member-write rule on `comparisons`, so this
adds no new collection and no new rules surface.

- `GEMINI_API_KEY` is a **server-only** env var (no `NEXT_PUBLIC_` prefix) — unlike the public
  Firebase config values, this one is a real secret.
- The route **authenticates the caller**: verify the Firebase ID token the client sends, and check
  tenant membership before calling the model, so the endpoint can't be used to spend someone
  else's quota.
- Degrades to "button hidden" with no key set — the rest of the app is unaffected.

**Provider.** Google **Gemini**, free tier (`flash-lite`-class, no credit card) via
`src/lib/ai/provider.ts` — one module wrapping `generateJSON(prompt, schema)`, so swapping
providers later is a one-file change and nothing else imports an AI SDK directly. Two caveats:
free-tier prompts may be used to improve Google's models (don't send `contacts` phone numbers or
emails into a prompt), and free quotas are Google's to change — read current numbers in AI Studio
rather than trusting a fixed figure here. Handle `429` with backoff and a plain retry message.

**Out of scope:** no browsing/scraping vendor sites, no PDF or image ingestion (Storage is off
until Phase 6), no chat interface, no AI on budgets/allocations, and nothing AI-driven near money
movement. Text in, structured suggestion out, human confirms.

---

## 4. Guest list

More than a year out this is not an RSVP tool. Its job is **headcount negotiation**: four parties
contribute names, the total comes to 800, the venue holds 400. The app's role is to make that
conversation arithmetic instead of an argument.

### 4.1 Data model

```
households/{householdId}
  name                string        // "The Agarwals"
  side                "a" | "b"
  invitedBy           uid           // whose guest they actually are
  tier                "must" | "should" | "if_space"
  status              "proposed" | "confirmed"
  relationship        string        // "Paternal cousins", "Dad's colleagues"
  eventIds            [ string ]    // which events they're invited to
  adultCount          number        // PLANNED headcount — hand-entered, authoritative
  childCount          number        // PLANNED headcount — hand-entered, authoritative
  travelNeeded        boolean
  accommodationNeeded boolean
  roomsNeeded         number | null
  nightsNeeded        number | null
  address             string        // optional until invitations are printed
  primaryPhone        string
  notes               string
  createdBy           uid
  createdAt           timestamp
  updatedAt           timestamp

guests/{guestId}                    // TOP-LEVEL, not nested under the household
  householdId     string            // → households
  name            string
  ageGroup        "adult" | "child" | "infant"
  dietary         string            // optional until the caterer asks
  notes           string
  createdBy       uid
  createdAt       timestamp
  updatedAt       timestamp
  // Phase 6 adds per-person fields here without restructuring anything:
  //   rsvp  { [eventId]: "pending" | "yes" | "no" }
  //   seat  string | null
```

**Households, not individuals, are the invitation unit.** One invitation to "Mr & Mrs Agarwal + 2
children" is one card, one delivery, one follow-up call — but four plates. Both numbers are needed
and they're different. Tiers, per-event invitation, travel and accommodation all attach to the
household, never to a person.

**Guests are top-level, not a subcollection of the household.** This is the one structural
decision here worth being deliberate about, and it is driven by tenancy rather than by the guest
list itself. Nesting them would make every cross-cutting question — *"all vegetarians attending
the sangeet"*, *"everyone who hasn't replied"*, *"seating for the reception"* — a **collectionGroup**
query, which in Firestore matches that collection name at **every path depth in the database**,
including other weddings. Securing that means a `match /{path=**}/guests/{guestId}` rule plus a
`tenantId ==` filter on every query — precisely the forgettable-filter model that `CLAUDE.md`
§ Multi-tenancy exists to avoid. A top-level `tenants/{tenantId}/guests` collection gets an
ordinary rules block and keeps isolation a path prefix.

Moving a person between households also becomes a field update rather than a delete-and-recreate.

**Counts are the planning number; names are optional detail. They are deliberately NOT derived
from each other.**

This is the rule that makes progressive entry work, so it is worth stating plainly. `adultCount`
and `childCount` are hand-entered on the household and are what every projection reads. Named
`guests` documents are a *subset* that may not exist at all. "Dad's colleagues, 12 people" is a
complete, valid household with twelve planned heads and zero guest documents — which is exactly
what parents will actually enter, and forcing twelve blank name rows to get a headcount of twelve
is how this feature dies.

The UI shows both (*"12 planned · 3 named"*) and offers to reconcile when they drift; it never
silently rewrites one from the other. Phase 6 requires them to match before invitations go out.
First you count, then you name, then you invite.

**Per-event invitation.** A colleague invited only to the reception must not appear in the
mehendi catering count.

**Progressive detail.** Only name, side, tier and the two counts are required. Address, phone,
dietary and travel fields are optional and **kept out of the default entry form** behind a "more
details" expander. A form demanding twelve fields per guest will not get filled in — parents will
add three names and stop.

### 4.2 Tiers

The highest-value part of this feature and nearly free to build — one enum plus a running total.

Every household is `must` / `should` / `if_space`. With a cap of 400: tier A is 260, adding tier B
takes you to 430, so 30 people come off B. The conversation becomes "which of these are really
B?" rather than "why did you delete my cousin?"

Also enables staged invitations later — send tier A, release tier B as declines arrive.

### 4.3 Proposed vs confirmed, and provenance

Anyone may add a household as `proposed`. It counts toward projections but is visibly not agreed;
confirming is a deliberate act. This lets parents contribute a full list without it feeling like
a unilateral commitment.

`createdBy` plus a lightweight change log (who added or removed each household, and when) costs
very little and prevents the "who deleted my aunt" problem outright.

**Duplicate detection.** With four people adding names independently, mutual family friends will
be entered twice. Warn on fuzzy name or phone match at entry.

### 4.4 Analytics

**Tier ladder — the primary view.** Cumulative, not per-tier:

| Tier | Households | People | Running total | Projected cost |
|---|---|---|---|---|
| Must | 62 | 260 | 260 | ₹19.5L |
| + Should | 41 | 170 | 430 | ₹32.3L |
| + If space | 28 | 120 | 550 | ₹41.3L |

The running total is the point. Set a target headcount (from the booked venue's capacity where
available) and mark which tier breaks it, by how many people.

**Cost projection.** For each household, sum `perPlateEstPaise` across the events they're
invited to, times its **planned** head count (`adultCount + childCount` — never a count of `guests`
documents, per §4.1). Aggregate by tier. This is the bridge between guest list and budget and it's
the analytic to build first — it turns "should we invite the extended office?" into "40 people
across three events at ₹2,500 is ₹3L."

Feed the total into the projected-total figure in §2.6.

**Marginal cost at entry.** When adding or editing a household, show the live delta to the
projection. Seeing "+₹30,000" while typing changes behaviour more than any report does.

**Filters.** Tier, side, invitedBy, event, relationship, status, travel needed, accommodation
needed. Combinable, shown as removable chips, and **every count on screen respects the active
filter set** — filtering to "Swara's side, tier B, sangeet" gives a live headcount and cost for
exactly that slice.

**Breakdowns.** Households and people by side, by invitedBy, by event; adults versus children
(child plates price differently).

**Room block.** Households needing accommodation, with people, rooms and nights. Hotels want this
number early and it's a large budget line — feed it into the cost projection.

### 4.5 Aggregates

```
aggregates/guestTotals
  byTier         { must: {households, adults, children, projectedPaise}, ... }
  bySide         { a: {...}, b: {...} }
  byEvent        { [eventId]: {adults, children, projectedPaise} }
  roomsNeeded    number
  updatedAt      timestamp
```

**Recompute-and-overwrite, not transactional** (revised during Phase 3 build — see CLAUDE.md
§ Current phase for why). The Guests screen already holds the full household list in memory
(every on-screen count has to respect the active filters, which rules out serving them from a
handful of fixed aggregate keys), so after any household create/update/delete it recomputes this
whole document from that list and `setDoc`s it. One writer path, no transaction to get wrong, and
a document that somehow drifted heals itself on the next household write. **Not** written on
`guests` writes — naming someone changes no count (§4.1), so the aggregate cannot drift from the
planning numbers.

Filtered counts that aren't covered by these keys are computed over the loaded page client-side —
acceptable given filtered views are exploratory, and far cheaper than a query per filter
combination.

### 4.6 CSV import and export

**Build this early, in the same phase as the list itself.** The guest list almost certainly
already exists in a spreadsheet, or will the moment names are requested from parents. Typing 200
names by hand is how this feature dies.

Import: column mapping UI, dry-run preview with duplicate warnings, then commit as `proposed`.
Export: flat CSV for vendors, who will ask for one.

### 4.7 Not yet

RSVP tracking, chase lists, dietary summaries, invitation delivery status, seating charts. All
genuinely useful, all worthless more than a year out, all addable later **without restructuring** —
that is what the top-level `guests` collection buys (§4.1). Each of them is a field on the guest
document plus an ordinary query: `rsvp` for replies and chase lists, `dietary` for the caterer's
summary, `seat` for seating. Building them now means maintaining dead screens for a year.

The one thing that *does* change at that point is §4.1's counts-vs-names rule: before invitations
go out, every planned head must be a named guest. Enforce it there, not now.

---

## 5. Contacts

```
contacts/{contactId}
  name            string
  organisation    string         // "Taj Palace", "Sharma Caterers"
  role            string         // "Venue manager", "Photographer", "Pandit"
  type            "vendor" | "family" | "service" | "other"
  phone           string
  altPhone        string
  email           string
  address         string
  categoryId      string | null
  eventIds        [ string ]
  notes           string
  updatedAt       timestamp
```

> `isBooked` was removed in the Phase 2.1 QA round: it was written and shown as a pill but read by
> nothing, and `ComparisonOption.status` already has its own `"booked"` value — two sources of
> truth for one fact. Whether a vendor is confirmed lives on the comparison option.

- `tel:` and `mailto:` links so a tap dials — this is most of why the feature exists on a phone.
  Add a WhatsApp link (`https://wa.me/91XXXXXXXXXX`); realistically most vendor contact happens
  there.
- Search by name, organisation, role. Filter by type, category and event.
- From a contact, show linked open questions, expenses, tasks and comparison options.

---

## 6. Tasks

```
tasks/{taskId}
  title           string
  description     string
  assigneeUids    [ uid ]
  dueDate         timestamp | null
  status          "todo" | "in_progress" | "done" | "blocked"
  priority        "low" | "normal" | "high"
  categoryId      string | null
  eventId         string | null
  isMilestone     boolean        // surfaces on the planning timeline (§7.1)
  completedAt     timestamp | null
  completedBy     uid | null
  createdBy       uid
  createdAt       timestamp
```

Views:
- **My tasks** (default) — assigned to me, by due date.
- **Everyone's** — grouped by assignee.
- **By event** — grouped by event, then due date.
- **Overdue** — a persistent banner on the home screen.

**Keep it a list, not a kanban board.** Kanban is poor on phones and the parents will not use it.

---

## 7. Schedule and timelines

Two different things. Build both; don't merge them.

### 7.1 Planning timeline

Milestones between now and the wedding, backed by the same `tasks` collection — a milestone is a
task with `isMilestone: true`. Rendered as a vertical timeline grouped by month with a "you are
here" marker.

This is the only part of §7 worth building before the date is fixed.

### 7.2 Day-of run sheets

Per event, minute by minute. Used *at* the wedding, so it must be fast and work offline.

```
events/{eventId}/schedule/{itemId}
  time            string         // "16:30" as HH:mm, NOT a timestamp —
                                 // avoids timezone bugs, makes reordering trivial
  durationMins    number | null
  title           string
  location        string
  ownerUids       [ uid ]
  contactIds      [ string ]
  notes           string
  order           number
```

- Sorted by time, grouped by event.
- Tappable phone numbers for linked contacts on each item.
- **Cache in the service worker.** Venue connectivity is unreliable and this is the one screen
  where that matters. Extend the existing shell caching to hold schedule data for the current and
  next event.
- A "today" view opening straight to the current event's run sheet when the date matches.

---

## 8. Home screen

Answers "what needs my attention?" in one glance, at a handful of document reads:

- Days until the wedding.
- My overdue and due-soon tasks (count plus top 3).
- Projected total against combined budget, one bar.
- What I owe / what I'm owed, one line each, straight from `aggregates/balances`.
- Current headcount against target, from `aggregates/guestTotals`.
- Quick-add → expense entry.

---

## 9. Deferred features (implementation paths that matter)

Both of these would normally be built on Firebase Cloud Functions, which **requires the Blaze
plan**. Neither needs to be. Architect toward the free paths below so nothing forces a plan
upgrade later.

### 9.1 AI expense categorisation

A **Next.js Route Handler on Vercel** (`app/api/categorise/route.ts`), running on the Hobby tier,
keeping Firebase on Spark. API key in a Vercel environment variable, **unprefixed** — no
`NEXT_PUBLIC_`.

Flow: description + amount → handler returns a suggested `categoryId` → UI pre-selects it with an
"AI suggested" tag → user confirms. **Never auto-save without confirmation.**

> This route-handler-on-Vercel-Hobby pattern (server-only key, human confirms every suggestion,
> never auto-save) was pulled forward into **Phase 2 §3.3** for the comparison-table AI assist,
> rather than waiting for Phase 6. §3.3's `src/lib/ai/provider.ts` should be reused here rather
> than building a second AI integration from scratch — this categoriser becomes a second caller
> of the same provider module, with its own route handler and prompt.

### 9.2 Task reminders

**Vercel Cron** (Hobby allows scheduled invocations at daily granularity) hits a route handler
each morning, queries tasks due within 3 days plus anything overdue, and emails via a
free-tier provider (Resend's free tier is ~3,000/month — far beyond what 15 users need).

**Do not plan on web push.** iOS supports it only for installed PWAs, support is inconsistent,
and half the users will never grant permission. Email is the reliable channel for this group. For
in-app nudging, a badge count on the tasks tab costs nothing.

---

## 10. Build order

Ordered by what's actually useful more than a year out. Ship each phase working before starting
the next.

**Phase 1 — Foundation**
Next.js App Router scaffold, Firebase init, Google sign-in, allowlist gate, security rules, PWA
manifest and service worker, bottom tab navigation, money formatting helpers.
*Deployable and installable at the end of this phase, even with empty screens.*

**Phase 1.5 — Multi-tenancy** *(inserted after Phase 1 shipped; see `PHASE1.5.md`)*
weddingHQ became a container for many weddings. The allowlist gate above was replaced by
`memberships`, all wedding data moved under `tenants/{tenantId}/…`, sides became `"a"`/`"b"` with
tenant-supplied labels, and a global admin role was added.

**Phase 2 — Decision support**
Categories and events setup. Comparison tables (cards + table), plus an AI assist (§3.3) that
turns plain-English notes into suggested criteria and filled-in values, reviewed before saving.
Open questions grouped by who to ask. Contacts. Budget allocations per side, with allocation
health and side-by-side comparison — planning only, no expense entry yet.

**Phase 3 — Guest list**
Households, named guests, tiers, per-event invitation. Filters and the tier ladder. Cost projection
and marginal cost at entry. CSV import/export. Pulled ahead of expenses deliberately: headcount ×
per-plate is usually the largest line in the whole wedding, so it's the input that tells you
whether the budget is realistic at all. The brief is in `PHASE3.md`.

**Phase 4 — Money in motion**
Expense entry with the three states, splits, aggregates, balances, settle-up, the full analytics
set in §2.6. Build when deposits and real payments start, roughly six months out.

**Phase 5 — Day-of**
Run sheets, offline caching, today view. Useless until dates and vendors are locked.

**Phase 6 — Deferred**
AI expense categorisation (§9.1 — reuses the provider module §3.3 introduced in Phase 2), email
reminders, receipts, RSVP tracking, seating.

---

## 11. Manual steps

Per `CLAUDE.md`, these need explicit click-by-click instructions. **Flag each one as it becomes
relevant rather than dumping the list up front.**

1. Create the Firebase project; enable Firestore and Authentication (Google provider). Storage
   only if receipts are being built.
2. Register a Web App in Firebase; copy the config values.
3. Add `NEXT_PUBLIC_FIREBASE_*` to `.env.local` and to the Vercel dashboard.
4. Add the Vercel production domain to Firebase Auth's **authorised domains**. Sign-in fails
   silently in production without this and the error is unhelpful.
5. Connect the GitHub repo to Vercel.
6. Seed the first tenant, its first `couple` membership, and the `isAdmin` flag by hand in the
   Firestore console (bootstrap — nobody can sign in to create them via the app).
7. Deploy security rules and composite indexes via the Firebase CLI.
8. **(Phase 2, §3.3)** Create a free Gemini API key in Google AI Studio; add `GEMINI_API_KEY`
   (unprefixed — no `NEXT_PUBLIC_`) to `.env.local` and to Vercel → Environment Variables for
   Production and Preview, then redeploy. Reused as-is by the §9.1 categoriser in Phase 6.
