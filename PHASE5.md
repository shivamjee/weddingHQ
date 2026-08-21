# PHASE5.md — Tasks, timeline and run sheets

> ## ✅ REVIEWED — decisions settled 21 Aug 2026. Build Steps 1–4 only.
>
> The seven § Open questions below are **answered here**; the body of this file is left as the
> drafted record, exactly as `PHASE4.md`'s was. Where an answer contradicts the body, **this block
> wins**.
>
> 1. **Scope: tasks + timeline only.** Phase 5 = Steps 1–4 (`src/lib/tasks.ts`, tasks CRUD + list,
>    the §7.1 milestone timeline, Home's overdue line). **Steps 5–6 — run sheets and offline — are
>    deferred to their own phase**, built roughly a month out when dates and vendors are locked, per
>    `FEATURES.md` §10's own reasoning. The two halves have opposite readiness; that is why they
>    split. `FEATURES.md` §10 updated to match. No `ScheduleItem` type, no `schedule` rules block,
>    no `scheduleCol`/`scheduleDoc` path builders ship in this phase — the rules deploy happens once
>    now and once again then.
> 2. **Tasks live under Plan**, as a fourth entry in `SECTIONS` in `plan/layout.tsx`
>    (`/plan/tasks`). One array entry and one route — no change to `TABS`, so neither
>    `BottomTabBar` nor `SidebarNav` is touched. Four `flex-1` tabs at 375px are ~90px each, which
>    clears the 44px tap target comfortably. The "tasks are checked more often than anything in
>    Plan" worry is answered by Home's overdue line (Step 4) linking straight into the Overdue
>    view — the frequent path does not go through the Plan switcher.
> 3. **Offline: deferred with run sheets** (see #1). When that phase happens, the answer is
>    Firestore's own **`persistentLocalCache`**, not service-worker caching: `public/sw.js` passes
>    every cross-origin request straight through by design, and caching Firestore responses there
>    would mean reimplementing enough of the wire protocol to serve them back. That is not a small
>    extension of a 60-line file; the SDK already does the whole job in one line of config at `db`.
>    `FEATURES.md` §7.2 gets its AS-BUILT note **then**, not now.
> 4. **Home gets overdue/due-soon from a small bounded query**, not an aggregate and not a COUNT.
>    `where("assigneeUid","==",uid)` + `where("status","in",[open statuses])` +
>    `where("dueDate","<=",soonCutoff)` + `orderBy("dueDate")` + `limit(4)` — at most 4 document
>    reads, and it renders the top 3 *and* a "+ more" marker when the 4th comes back, which a COUNT
>    alone cannot. The `aggregates/taskTotals` candidate is **rejected** for the reason the body
>    already identifies: overdue changes at midnight with no write happening, which is exactly what
>    recompute-on-write cannot heal. Note the range filter also enforces Definition of done #2 at
>    the query level — a null `dueDate` is a different type in Firestore's ordering and never
>    matches a Timestamp `<=`, so a "someday" task cannot reach Home. Needs the first composite
>    index in this project (`assigneeUid` ASC, `status` ASC, `dueDate` ASC); **[MANUAL]** deploy it
>    with `--only firestore:indexes`.
> 5. **Single `assigneeUid: string | null`, not a list.** Deviates from §6 as written, so
>    `FEATURES.md` §6 is updated. Every task really has one owner; a list invites "assigned to
>    everyone", which means assigned to nobody, and it would make #4's index and the one-glance row
>    both worse. `null` renders as "Unassigned" and groups as its own bucket.
> 6. **No provenance log for tasks.** `completedAt` / `completedBy` cover "who ticked this off",
>    which is the question anyone actually asks. Phase 4 declined a log even for a deleted paid
>    expense; a deleted task is less consequential than that.
> 7. **Done tasks are hidden from the list by default**, via a `status` chip that can show them —
>    not archived, not deleted. The read stays **one bounded read of the whole collection, filtered
>    in memory**, the same trade Guests (§4.4) and Expenses already make, and for the same reason:
>    every on-screen count must respect the active filters, which is impossible over a partial page.
>    A wedding's whole backlog including completed tasks is realistically under 200 documents. If it
>    ever approaches the cap, move the `status != "done"` filter server-side then — not now.

Scope for Phase 5. Read `CLAUDE.md` (stack, hosting, **§ Multi-tenancy**, **§ Responsive layout**,
constraints) and `FEATURES.md` **§0, §1, §6, §7, §8** before starting. Phases 1–4 are complete;
their briefs are in `PHASE1.md`, `PHASE1.5.md`, `PHASE2.md`, `PHASE3.md` and `PHASE4.md` (kept as
records — the foundation they describe is what you build on here).

> **Everything in this phase is per-wedding.** Every collection named below lives under
> `tenants/{tenantId}/…`, and sides are `"a"` / `"b"` with labels from the tenant document. Build
> paths with `src/lib/paths.ts`; read `canWrite` / `canInvite` and `sideLabel()` from `useTenant()`
> rather than checking a role or naming a person in the UI.

**Goal:** answer "what needs doing, and by when?" — and, on the day itself, "what happens next?".
Two questions that look adjacent and are not: one is a year-long backlog nobody reads in order, the
other is a minute-by-minute script read on a phone with no signal. `FEATURES.md` §7 opens by saying
*"Two different things. Build both; don't merge them."* That is the spine of this phase.

**When to build:** the tasks half is useful **now** — 484 days out (2 Dec 2027), with venue and
vendor decisions live, there is already a backlog worth writing down. The run-sheet half is
**useless until dates and vendors are locked**, per `FEATURES.md` §10, which is realistically the
final month. **These two halves have opposite readiness, which is why § Open questions #1 asks
whether they belong in the same phase at all.**

---

## What Phases 1–4 already give you (build on this, don't rebuild)

- **Identity & wedding context** — `useAuth()` for `{ user, profile, isAdmin }`, `useTenant()` for
  `{ tenantId, tenant, role, side, canWrite, canInvite, sideLabel() }`.
- **The member list** — `memberships` filtered by `tenantId`, as `guests/page.tsx` and
  `budget/expenses/page.tsx` both already load it (`limit(MAX_MEMBERS)`). `assigneeUids` is a list
  of these people; this is where the picker gets its names.
- **Categories & events** — `useConfig()`, loaded once per wedding, with `categoryById()` /
  `eventById()`. Both are dimensions on a task, exactly as on an expense.
- **Dates at the input edge** — `src/lib/dates.ts` (`dateInputValue`, `toTimestamp`, `formatDate`).
  It already solves the local-midnight timezone bug that would otherwise put a due date a day
  early. `dueDate` goes through it; **the run sheet's `time` field deliberately does not — see
  § The two clocks below.**
- **The pure-logic + unit-test pattern** — `src/lib/budget.ts`, `src/lib/guests.ts`,
  `src/lib/expenses.ts`: structural parameters, no Firebase import, one `describe` per exported
  function with full-sentence invariant names. Grouping, sorting and overdue maths belong in
  `src/lib/tasks.ts` under this pattern, not inline in a component.
- **Aggregate maintenance** — `writeExpenseAggregates()` in `src/lib/aggregateWriter.ts` and
  `guestTotalsFrom()` + the writer in `guests/page.tsx`. Both are recompute-and-overwrite; the
  reasoning is recorded in `src/types/expenseTotals.ts` and `src/types/guestTotals.ts`. **Read
  § Open questions #4 before assuming this phase needs an aggregate at all.**
- **UI kit** — `src/components/ui/form.tsx` (`Field`, `TextInput`, `TextArea`, `ChipRow`,
  `ChipMultiRow`, `FilterPanel`, `Expander`, `ActionLink`, `PrimaryButton`, `SecondaryButton`,
  `OptionMark`, `FormMessage`), `PageHeader` (with `backHref` **or** `onBack`), `EmptyState`.
- **The list → profile → form shape** established in Phase 3.1 and reused by Phase 4: a minimal
  tappable row, a read-only view screen, an explicit Edit. Tasks should follow it rather than
  inventing a fifth pattern.
- **The desktop split** — `useMediaQuery("(min-width: 1024px)")` plus the
  `lg:grid-cols-[minmax(0,1fr)_380px]` + `lg:sticky lg:top-6` shape, in `guests/page.tsx`,
  `plan/contacts/page.tsx`, `plan/questions/page.tsx` and `budget/expenses/page.tsx`. Read
  CLAUDE.md § Responsive layout first — it records three bugs already fixed in this exact
  mechanism, including why no ancestor may declare `overflow`.
- **Security rules** — `firestore.rules` uses `isTenantMember(tid)` / `isTenantCouple(tid)` /
  `isAdmin()`, default-deny, with `budgets` and now `expenses` as worked examples of blocks that
  validate field shape. `comparisons/{id}/options/{id}` is the worked example of a **subcollection
  needing its own `match` block** — rules do not cascade, which matters directly for §7.2's
  `events/{eventId}/schedule/{itemId}`. Tests in `tests/rules/` run against two tenants; **add
  cross-tenant denial cases for each new collection.**
- **Service worker** — `public/sw.js`, hand-written, **shell-only by design**: it caches app
  routes and static chunks, and explicitly passes every cross-origin (i.e. Firestore) request
  straight through. §7.2's offline requirement is therefore **not** a small edit to this file —
  see § Offline below.
- **Nav shell** — bottom tabs Home / Budget / Guests / Plan / More, from the single `TABS` array
  in `src/components/nav/navItems.tsx` (both `BottomTabBar` and `SidebarNav` read it). Plan has its
  own sub-switcher in `plan/layout.tsx` (`SECTIONS`: Compare / Questions / Contacts). Budget gained
  `/budget/expenses` and `/budget/balances` as plain subroutes in Phase 4. **All five bottom tabs
  are taken — see § Open questions #2.**

---

## The two clocks

The single most copyable mistake in this phase is treating a run-sheet time as a date.

- **`Task.dueDate` is a `Timestamp | null`.** A due date is a real point on the calendar, it sorts
  against "now", and it must survive the local-midnight trap — so it goes through
  `src/lib/dates.ts` exactly as `Event.date` and `Expense.date` already do.
- **`ScheduleItem.time` is a `"HH:mm"` string.** `FEATURES.md` §7.2 states this and gives the two
  reasons: it avoids timezone bugs entirely, and it makes reordering trivial. A run sheet is read
  *at* the event; "16:30" means 16:30 in the room, not an instant in UTC that a device in another
  zone would render as something else. Sorting is lexicographic on a zero-padded `"HH:mm"`, which
  is the same as chronological — that is the whole trick, and it wants a named test.

> **Never store a run-sheet time as a Timestamp, and never render a `dueDate` with string
> arithmetic.** Comment this at both type definitions.

An `ownerUids` on a schedule item and an `assigneeUids` on a task are the same idea at two
timescales; they are deliberately separate fields on separate documents, because "Ravi chases the
florist this month" and "Ravi walks the bride in at 16:30" are not one record.

---

## Build order

Dependencies first. Ship each step working before the next. Update `firestore.rules` **and its
tests** as part of the step that introduces a collection — not as an afterthought.

### Step 1 — `src/lib/tasks.ts` and its tests
Pure logic first, as in Phases 3 and 4. Nothing here imports Firebase.
- `taskFilters` / `filterTasks(tasks, filters)` — the combinable-filter shape
  `src/lib/guests.ts` established, so every on-screen count respects the active filters.
- `groupTasks(tasks, key)` for `"assignee" | "event" | "dueMonth" | "status"` — the four §6 views
  are one function with a key, not four functions.
- `overdueOf(tasks, uid, now)` → the caller's overdue and due-soon sets. `now` is a **parameter**,
  never `Date.now()` inside the function — that is what makes it testable, and `home/page.tsx`
  already captures "now" once per mount via a lazy `useState` initialiser for exactly this reason.
- `milestoneTimeline(tasks)` → §7.1's month-grouped rows with the "you are here" index.
- Named test: **a task with no `dueDate` is never overdue** — null-vs-zero is how a "someday"
  task ends up screaming at everyone in red.

### Step 2 — Tasks CRUD + the list
- `tasks` per §6. Member-readable and member-writable, like every other planning collection.
- The list follows the Phase 3.1 shape: minimal row → read-only profile → explicit Edit. At `lg:+`,
  the sticky-column split (§ What Phases 1–4 already give you).
- **Keep it a list, not a kanban board** (§6, verbatim). Kanban is poor on phones and the parents
  will not use it. `status` is a chip row, not a column to drag between.
- Entry should be as cheap as Phase 4's expense form: title first with autofocus, assignee and
  status as chips, due date via `<input type="date">`, everything else folded into an `Expander`.
  A task nobody can add in fifteen seconds is a task that gets sent as a WhatsApp message instead.
- The four §6 views (**My tasks** default, **Everyone's**, **By event**, **Overdue**) are one
  screen with a `ChipRow` over `groupTasks`, not four routes.

### Step 3 — The planning timeline (§7.1)
- **Same `tasks` collection.** A milestone is a task with `isMilestone: true` — not a second
  collection, and not a `milestones` array anywhere.
- Vertical timeline grouped by month with a "you are here" marker, from `milestoneTimeline()`.
- This is the only part of §7 worth building before the date is fixed (§7.1, verbatim).
- Milestones with no `dueDate` cannot be placed on a timeline. Decide whether they are hidden or
  collected in an "unscheduled" group at the end, and say so at the code — silently dropping them
  is how a milestone disappears.

### Step 4 — Home's task line (§8)
- Overdue and due-soon: a count plus the top 3, linking into the Overdue view.
- **Home's read budget is the constraint, not the feature.** It currently does one bounded
  `budgets` read, one COUNT aggregation, and four single-document reads (`guestTotals`,
  `guestTarget`, `expenseTotals`, `balances`). It must not learn to load the task list — see
  § Open questions #4 for the three ways to avoid that, which is a real decision.

### Step 5 — Run sheets (§7.2) — *gated on § Open questions #1*
- `events/{eventId}/schedule/{itemId}` per §7.2. **Its own rules `match` block** — rules do not
  cascade into subcollections; `comparisons/{id}/options/{id}` is the worked precedent, including
  why the recursive `{path=**}` form is deliberately not used.
- Sorted by `time`, grouped by event. Add / edit / reorder; `order` breaks ties within a minute.
- Tap-to-call for each item's linked `contactIds`, via the existing `ActionLink` + `src/lib/phone.ts`.
  This is most of why the screen exists on the day.
- A **"today" view** opening straight to the current event's run sheet when the date matches
  (§7.2). Note `Event.date` is `Timestamp | null`, so "today" is undefined for an undated event —
  decide the fallback rather than letting it throw.
- **Deleting an event does not delete its schedule.** Firestore has no cascade delete, and this is
  the first subcollection in the app hanging off a document a user can remove from Setup. Either
  delete the children explicitly or accept documented orphans; do not leave it unconsidered.

### Step 6 — Offline for the run sheet — *the hard part, see § Offline*
Do not start this before § Open questions #3 is settled. It is the one step in this phase that
cannot be done by copying an existing pattern in the codebase.

### Step 7 — *(not this phase)* reminders
§9.2's Vercel Cron + email reminders are **Phase 6**. An in-app badge count on the tasks tab costs
nothing and can ship here if it falls out of Step 4's numbers for free — nothing more.

---

## Offline — the open architectural question

`FEATURES.md` §7.2 says to *"cache in the service worker … extend the existing shell caching to
hold schedule data for the current and next event."*

**That sentence describes work the current architecture actively avoids.** `public/sw.js` is
shell-only by deliberate design, and its fetch handler returns early on any cross-origin request —
which every Firestore call is. Caching Firestore *responses* in a service worker would mean
intercepting Google's API endpoints and reimplementing enough of the Firestore wire protocol to
serve them back, which is not a small extension of a 60-line file.

**The alternative the SDK already offers**, and which needs no service-worker work at all, is
Firestore's own IndexedDB persistence (`persistentLocalCache` in the modular SDK, configured where
`db` is created in `src/lib/firebase.ts`). Reads then resolve from disk when offline, and writes
queue and replay on reconnect — the whole requirement, in roughly one line of configuration.

It is not free, though, and the trade is the decision:

- It caches **everything the app has read**, not just the current event's schedule. For 15 users and
  a few hundred documents that is almost certainly fine, but it is a different guarantee from "the
  next event's run sheet, specifically".
- Multi-tab behaviour needs the right cache manager, or a second tab silently fails to initialise
  persistence. This app is installed as a standalone PWA, which makes it less likely, not
  impossible.
- Stale data is now possible on every screen, not just the run sheet. A budget number from
  yesterday is a much smaller problem than a run sheet that won't open, but it is a new class of
  wrongness the app has never had.

Do not default to either. Decide it, write the reasoning next to the code as Phases 3 and 4 did,
and if `persistentLocalCache` wins, **update `FEATURES.md` §7.2 with an AS-BUILT note** rather than
leaving it describing a service-worker approach nobody took.

---

## New data models

Add TypeScript interfaces in `src/types/` in the existing style (`X` / `XWithId`, a doc-comment
that opens with the Firestore path and carries a `SECURITY:` note, `TYPES` const + `TYPE_LABELS`
beside each literal union — see `src/types/expense.ts` for the current best example):
`Task`, `TaskWithId`, `TaskStatus`, `TaskPriority`, `ScheduleItem`, `ScheduleItemWithId`.

Add path builders to `src/lib/paths.ts` — `tasksCol`, `taskDoc`, `scheduleCol(tenantId, eventId)`,
`scheduleDoc(tenantId, eventId, itemId)`. **Never build a Firestore path by hand** (CLAUDE.md
§ Multi-tenancy).

## Security rules (the boundary — update `firestore.rules` + tests per collection)

Inside `match /tenants/{tenantId}`, alongside the existing blocks:

| Collection (under `tenants/{tenantId}/`) | Read | Write |
|---|---|---|
| `tasks/*` | member | **member** |
| `events/{eventId}/schedule/*` | member | **member** |

Member-writable, like every other planning collection — a task somebody else has to do is still a
task anybody may write down, and gating it would recreate the bottleneck the guest list avoids.

Shape validation is worth less here than it was for `budgets` and `expenses`: there is no money and
no id/field agreement to protect. `status` and `priority` being one of their allowed values is
cheap and worth doing; **`time` matching `"HH:mm"` is the one genuinely load-bearing check**, since
a malformed value silently sorts to the wrong place in a run sheet read at speed. Confirm whether
the rules language's regex support (`string.matches()`) is a clean fit before promising it — and if
not, enforce it client-side and say so in a comment at the rules block, exactly as the `expenses`
block already does for `shares` summing to `amountPaise`.

Add emulator tests for each: member allowed, non-member denied, **and a member of the other tenant
denied**. The fixtures already set up two weddings for exactly this. Note the `schedule` tests need
a nested path — the `comparisons/{id}/options/{id}` tests are the pattern.

**[MANUAL]** redeploy rules afterwards:
`npx firebase deploy --only firestore:rules --project weddinghq-d125b`.

## Read-cost & indexes (CLAUDE.md §3 / FEATURES §1.5)

- **Bound every list query with `limit()`.** Declare the cap as a named const with a READ COST
  comment, as every other screen does.
- Tasks are small — a wedding's whole backlog is realistically under 200 documents. One bounded
  read of the lot and grouping in memory is almost certainly right, and it is what makes every
  on-screen count respect the filters (the Phase 3 §4.4 argument, which applies unchanged).
- **Home is the exception and the reason § Open questions #4 exists.** Everything else on that
  screen costs one document.
- `firestore.indexes.json` is currently **empty**. An overdue query
  (`assigneeUids array-contains` + `dueDate` ordering) is the first thing in this app that
  plausibly needs a composite index. Add it **when a query needs it** — not via a runtime error in
  production. **[MANUAL]** deploy with `--only firestore:indexes`.

## UX guidance

- Mobile-first; ≥44px tap targets; 16px type (smaller makes iOS Safari zoom on focus).
- Reuse `src/components/ui/form.tsx` and the warm rose/stone/white theme. Chips, not dropdowns.
- **The run sheet is read one-handed, standing up, possibly in low light.** Large type, high
  contrast, the current item obvious. It is the one screen in this app where "dense and
  information-rich" is the wrong instinct.
- Tasks are the opposite: scanned in bulk, so a row is one glance line (Phase 3.1's lesson —
  stacking three action pills under every card made a hundred-row list unreadable).
- Follow CLAUDE.md § Responsive layout: single column by default, `lg:` split only where there is
  a genuine second thing to put beside the first.

## Navigation mapping

- **Tasks** — needs a home, and all five bottom tabs are taken. See § Open questions #2.
- **Timeline** — a view of the same collection, so it belongs beside Tasks rather than as a
  separate destination.
- **Run sheets** — per event. Reachable from the event, from a Day-of screen, or from a "today"
  entry point; the answer depends on #2.
- **Home** — gains the overdue/due-soon line (§8). Everything else on Home is unchanged.
- Budget, Guests and Plan are otherwise unchanged.

---

## Out of scope — do not build (later phases)

Email/push reminders (§9.2 — **Vercel Cron + a free email provider in Phase 6**; do not plan on web
push, per §9.2's own reasoning about iOS). AI expense categorisation (§9.1). Receipts and Firebase
Storage (§2.8 — **Storage is not enabled on this project**). RSVP, dietary summaries and seating
(Phase 6). Anything that requires Cloud Functions, which need the Blaze plan.

No kanban board, at any point, for the reason §6 gives.

## Definition of done

1. A task can be created in fifteen seconds with a title alone, and appears in **My tasks**.
2. A task with no `dueDate` is never reported as overdue. Named test.
3. The four §6 views are one screen over one `groupTasks()` call, and every count on screen
   respects the active filters.
4. A milestone (`isMilestone: true`) is the same document as its task, and appears on the §7.1
   timeline grouped by month with a "you are here" marker.
5. Home shows the caller's overdue/due-soon count **without loading the task list**.
6. Run-sheet times are `"HH:mm"` strings, sort chronologically by string comparison, and no
   Timestamp appears anywhere in the schedule model. Named test.
7. A run sheet opens and is readable **with the network off**, having been visited once online.
8. Tap-to-call works from a schedule item's linked contacts.
9. Tasks and run sheets are never merged into one screen or one collection (§7).
10. Every new collection is enforced in `firestore.rules` with an emulator test including
    cross-tenant denial; **rules deployed**. Any composite index deployed.
11. All list queries bounded with `limit()`.
12. Firebase still on **Spark**; no Cloud Functions, no Storage. Vercel still on **Hobby**.

## Open questions — settle these before building

1. **Does this phase contain run sheets at all?** `CLAUDE.md` says "tasks and run sheets (Phase 5+)";
   `FEATURES.md` §10 defines Phase 5 as *"Day-of — run sheets, offline caching, today view. Useless
   until dates and vendors are locked."* Under §10's definition, tasks and the planning timeline
   (§6, §7.1) are **unassigned to any phase**, which cannot be right — they are the half that is
   useful today, 484 days out, while run sheets are the half that is useless until roughly a month
   before. Per CLAUDE.md's division of authority, **CLAUDE.md wins and this is flagged rather than
   silently resolved**. The likely answer is: Phase 5 = tasks + timeline + Home's line (Steps 1–4),
   run sheets + offline become their own phase nearer the date (Steps 5–6). Confirm, and update
   `FEATURES.md` §10 to match whichever way it goes.
2. **Where does Tasks live in the nav?** All five bottom tabs are taken (Home / Budget / Guests /
   Plan / More) and `TABS` in `navItems.tsx` drives both the phone tab bar and the desktop sidebar.
   Options: a fourth section in `plan/layout.tsx`'s switcher (cheapest — but four 44px tabs across a
   phone is tight, and Plan becomes "everything else"); a sixth bottom tab (six tabs on a phone is
   past comfortable); replacing a tab; or Tasks as a Home-linked subroute with no tab of its own.
   Tasks are checked more often than anything in Plan, which argues against burying them.
3. **Offline: `persistentLocalCache` or service-worker caching?** See § Offline. This changes Step 6
   entirely and is the largest technical decision in the phase. It also decides whether
   `FEATURES.md` §7.2 needs an AS-BUILT correction.
4. **How does Home get the overdue count without reading the task list?** Three candidates: a
   `getCountFromServer` COUNT aggregation (Home already uses one for open questions — one read, but
   an overdue *count* alone can't render "the top 3"); a small bounded query for just the caller's
   overdue tasks (needs the composite index above); or a `aggregates/taskTotals` document on the
   recompute-and-overwrite pattern (a fourth aggregate to keep honest, for a number that changes
   every midnight **without any write happening** — which is exactly the case recompute-on-write
   cannot heal). The midnight problem is the interesting part and argues against the aggregate.
5. **Is `assigneeUids` really a list?** §6 says yes, and `array-contains` queries work. But every
   task in practice has one owner, and a list invites "assigned to everyone", which means assigned
   to nobody. Keep the list (it costs nothing and matches §6) or narrow it to a single `assigneeUid`
   — decide once, because changing it later rewrites every query.
6. **Do completed tasks need provenance?** `completedAt` / `completedBy` are already in the §6
   model, which covers "who ticked this off". The `guestLog` append-only pattern answers a different
   question — "who *deleted* this" — and a deleted task is less consequential than a deleted
   household or a deleted paid expense (Phase 4 decided against a log even there). Probably no log;
   confirm.
7. **Does a "done" task stay in the list forever?** A year of completed tasks will dominate the
   list and inflate every bounded read. Filter them out by default, archive them, or delete on
   completion — the first is almost certainly right, but it needs choosing before the list screen
   is built rather than after it gets slow.

## Standing rules (unchanged from Phases 1–4 / CLAUDE.md)

- Ask before deviating from the stack; flag anything that costs money (especially Cloud Functions
  → Blaze, or enabling Storage) before building it.
- Comment anything with a cost or security implication.
- Bound every query with `limit()`.
- Explain any remaining manual steps click-by-click. The expected manual steps this phase are
  **deploying updated rules and the first composite index** — no new Firebase console setup, no new
  environment variables, no new host wiring.
