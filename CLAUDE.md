# CLAUDE.md — Wedding App

## Project overview

A private wedding planning web app for a small, closed group: me, my girlfriend, my parents, and my in-laws. Roughly 5–15 users total, all invited by me. Not a commercial product, not public-facing.

Primary use is on phones — design mobile-first. But tablet (iPad) and desktop
(laptop) are real, regular use, not an afterthought: they get their own
genuinely considered layout — sidebar nav, multi-column, list+detail split
where it earns its keep — not just a stretched phone view. See § Responsive
layout below; it is authoritative on this.

## Stack (decided — do not re-litigate)

| Layer | Choice | Notes |
|---|---|---|
| Frontend hosting | **Vercel** | Hobby (free) tier. Non-commercial use, so free tier is fine indefinitely. |
| Framework | **Next.js (React)** | Pairs natively with Vercel. App Router. |
| Database | **Firebase Firestore** | Spark (free) plan. |
| Auth | **Firebase Authentication** | Spark plan includes 10k auths/month. |
| Backend logic | **Firebase Cloud Functions** *(only if needed)* | Prefer client-side + Firestore security rules. Functions require the Blaze plan, so avoid unless genuinely necessary. |
| Mobile | **PWA** (installable web app) | No native app, no app stores. |
| Deploy | GitHub → Vercel auto-deploy on push | No manual server ops. |

Vercel hosts only the frontend. Firebase is a separate service. They talk to each other via the Firebase Web SDK included in the frontend code.

## Explicitly rejected approaches

Do not suggest or drift toward these — they were considered and ruled out:

- **Self-hosting on a local machine + No-IP / dynamic DNS.** Requires a machine on 24/7, exposes the home network, unreliable under CGNAT, and migrating to cloud later is double work.
- **Railway / Render / Fly.io / DigitalOcean / AWS EC2.** Unnecessary; Firebase covers the backend needs.
- **Native iOS/Android apps (React Native).** Overkill for this group. App store fees and review processes aren't worth it. PWA is the mobile answer. (If this ever changes, React Native + the *same* Firebase project is the migration path — no backend rewrite needed.)
- **Separate standalone database (Postgres/MySQL/Mongo).** Firestore is sufficient.

## Constraints and priorities

1. **Minimise manual DevOps.** I want to write as little infrastructure config by hand as possible. Where a manual step is unavoidable (creating the Firebase project, connecting GitHub to Vercel, pasting credentials), give me explicit click-by-click instructions rather than assuming I'll figure it out.
2. **Stay on free tiers.** Vercel Hobby and Firebase Spark. Flag clearly in comments or in chat if any proposed feature would push usage past the free thresholds — especially anything requiring Cloud Functions (Blaze plan) or generating high Firestore read volume.
3. **Guard against runaway Firestore reads.** Always bound queries with `limit()`. Never call an unbounded `getDocs()` on a growing collection. Reads are the main cost driver on Firebase.
4. **Access must be restricted.** Only invited family members should be able to see anything. No "anyone with the link" access to real data.

## Auth requirements

- Prefer **Sign in with Google** as the primary method — everyone in the group already has a Google account and it avoids new passwords.
- Email magic link is an acceptable secondary option.
- Access control: maintain an allowlist of permitted emails/UIDs in Firestore. Anyone not on the list gets a "not invited" screen, not the app.
- Enforce this in **Firestore security rules**, not just in the UI. Client-side checks alone are not security.
- Some users are not technical (parents, in-laws). Sign-in must be as close to one tap as possible.

## PWA requirements

- Must install to the home screen and launch **standalone** — no visible browser address bar or tabs.
- Include a `manifest.json` with proper name, icons (all required sizes), `display: "standalone"`, theme colour, and start URL.
- Register a service worker for offline shell caching at minimum.
- Test assumptions for **both** iOS Safari and Android Chrome. iOS has more PWA limitations — don't rely on features that silently fail there. If a feature needs push notifications, verify current iOS support before building on it.

## Code and UX guidance

- Mobile-first responsive layout — see § Responsive layout for the
  breakpoints, the sidebar-nav shell, and which screens get bespoke
  desktop/tablet treatment vs. which stay single-column on purpose. When
  building a new screen, default to single-column (mobile) and only add a
  `lg:` grid/split if there's a genuine second thing to put beside the first —
  don't grid-ize for its own sake.
- Keep the UI simple and legible. Assume non-technical users of varying ages — large tap targets, clear labels, minimal jargon.
- Keep Firebase config in environment variables (`NEXT_PUBLIC_FIREBASE_*`), set in both `.env.local` and the Vercel dashboard. Never commit real credentials.
- Comment anything that has a cost or security implication so I can spot it later.

## How to work with me

- I want Claude Code to build this. I'm not planning to hand-write the application code myself.
- Explain the manual steps I do have to perform, in order, with no assumed knowledge.
- If a decision above turns out to be genuinely wrong for a specific feature, say so directly and explain why — but don't quietly substitute a different stack.

## Project context

**weddingHQ** is the product; **"Shivam & Swara"** is one wedding inside it. The app is
multi-tenant: it can hold several weddings, each with its own data and its own invited people,
and a global admin who can reach all of them. See § Multi-tenancy below — it is authoritative.

The Shivam & Swara wedding is **more than a year away** and we are at an early planning stage —
the app's job right now is decision support (comparing venues, negotiating headcount, sketching
budgets), not day-of execution. Build order reflects that.

## Multi-tenancy (authoritative — read before touching data access)

Added between Phase 1 and Phase 2. See `PHASE1.5.md` for the full brief.

**One wedding = one tenant.** All of a wedding's data lives in subcollections under
`tenants/{tenantId}/…`, so isolation is a *path prefix* rather than a `tenantId ==` filter that a
query could forget. Never add a top-level collection for wedding data.

```
tenants/{tenantId}                     name, sideA{label}, sideB{label},
                                       weddingDate|null, archived, createdBy, createdAt
tenants/{tenantId}/categories/{id}     ┐
tenants/{tenantId}/events/{id}         ├─ everything per-wedding goes here,
tenants/{tenantId}/settings/{docId}    ┘  including all Phase 2+ collections

users/{uid}                            GLOBAL identity only: email, displayName, photoURL,
                                       isAdmin, createdAt, lastSeenAt. No wedding data.
memberships/{tenantId}__{email}        tenantId, email, role, side, displayName,
                                       invitedBy, invitedAt, uid|null, lastSeenAt|null
```

Rules of the road:

- **Sides are `"a"` and `"b"`**, never `"shivam"`/`"swara"`. Display labels come from the tenant
  doc. Render `sideLabel(side)` from `useTenant()`; never hardcode a person's name in the UI.
- **`memberships` is the invitation *and* the membership**, keyed by lowercased email so someone
  can be invited before they have ever signed in. The couple/admin writes it fully formed; the
  invitee may only ever stamp their own `uid`/`lastSeenAt`. There is no self-created membership
  and therefore no self-elevation hole.
- **`users/{uid}.isAdmin` is a global admin** across every tenant. Frozen in `firestore.rules` —
  it cannot be granted through the client by anyone, including another admin. Set it by hand in
  the Firestore console.
- **Only an admin creates a tenant.** Only an admin may *list* `tenants`; members `get` theirs by
  id. That split is load-bearing: a member check inside a `list` rule runs one `exists()` per
  document scanned and would hit Firestore's 20-document-access-per-query limit.
- **Never build a Firestore path by hand.** Use `src/lib/paths.ts`. The membership id scheme is
  duplicated inside `firestore.rules`; `src/lib/tenantIds.ts` holds the one implementation and
  the rules tests import it, so drift fails the build.
- **Roles: every member writes; only `couple` invites.** Both `couple` and `family` may write a
  wedding's data — categories, events, settings, budgets, contacts, questions, comparisons, and
  the tenant doc's own name/labels/date. `couple` adds exactly one power: creating and deleting
  `memberships`. Family are parents and in-laws, not untrusted users, and `memberships` is also
  the privilege-escalation boundary, so it is the one thing still gated. Screens read **`canWrite`**
  (any member) or **`canInvite`** (couple/admin) from `useTenant()`, never a raw role — an invite
  control on `canWrite` shows family a form the rules will reject. Note `canWrite` is currently
  true for anyone who can reach a tenant screen at all, since the shell already turns non-members
  away; its read-only UI branches are kept for a future narrower role, not currently reachable.
- Routes are `/t/{tenantId}/…`. `/` routes you in (one wedding → straight there; several or an
  admin → the `/tenants` picker).
- Rule `get()`/`exists()` calls are **billed as document reads** (cached per request, per path).
  Negligible at this scale, but it is where tenancy costs anything at all.

## Responsive layout (mobile / tablet / desktop — authoritative)

Through Phase 3, the whole app was one hard `max-w-md` column at every
viewport (`src/app/t/[tenantId]/layout.tsx`), documented in `PHASE1.md` as
"the same layout, centred, max-width constrained. Don't build a separate
desktop design." That was right when there was nothing yet to design for; it
stopped being right once the app was in regular use from iPads and laptops,
not just phones. This section supersedes that PHASE1 decision. (`PHASE1.md`
itself is left unedited — it's a record of what shipped at the time, same as
`PHASE2.md`/`PHASE3.md`.)

**Breakpoints** (Tailwind defaults — there is no `tailwind.config`, so these
are the framework's own `sm`/`md`/`lg`):

- **Mobile** `< 768px` — unchanged: bottom tab bar, single column, `max-w-md`.
- **Tablet** `768–1023px` (`md:`) — the sidebar replaces the bottom bar;
  content widens but mostly stays single-column (a sidebar plus a 3-up grid
  doesn't fit at 768px).
- **Desktop** `≥ 1024px` (`lg:`) — the multi-column / split-pane treatments
  below are active.

**Shell** (`src/app/t/[tenantId]/layout.tsx`): below `md:`, `AppHeader` →
scrollable content → `BottomTabBar`, capped at `max-w-md`, exactly as before.
At `md:+`, `SidebarNav` (`src/components/nav/SidebarNav.tsx`) replaces the
bottom bar as a persistent left column, and the content column fills whatever
width is left beside it — no max-width cap; capping it just strands the rest
of a wide screen as dead space next to the sidebar. Both nav components read
the same `TABS` array from `src/components/nav/navItems.tsx` — add a tab
there, not in either component, or the two navs will drift.

**Screens with bespoke desktop/tablet treatment**, and why each one earns it:

- **Home** (`home/page.tsx`) — the three summary cards (Budget/Guests/
  Questions) become a `lg:grid-cols-3` dashboard instead of a stacked column.
- **Budget** (`budget/page.tsx`) — the "both sides" health bars sit
  `lg:grid-cols-2`; in a single side's detail view, the category list and the
  "Where it goes" chart sit side by side (`lg:grid-cols-2`) instead of
  stacked.
- **Guests** (`guests/page.tsx`) — below `lg:`, opening a household/guest
  fully replaces the list (a full-screen swap, unchanged). At `lg:+`,
  `detail` (whichever mode is open — view/edit/names/named-guest) opens in a
  **`lg:sticky lg:top-6` column beside the list**, in a
  `lg:grid-cols-[minmax(0,1fr)_380px]` row. Two earlier attempts got this
  wrong: a genuine left-list/right-detail split pane with independent
  scrolling broke because nothing in the shell had a definite height for
  `overflow-y-auto` to clip against (`body` is `min-h-full`, a floor not a
  cap); an inline expansion directly under the clicked row worked but put
  the row you clicked and its detail in the same scrolling column, so a
  long list meant scrolling twice. `sticky` needs no scroll container of
  its own — it just stays pinned near the top of the viewport as the list
  (and the page — this app scrolls the *document*, not an inner container)
  scrolls past it, the same mechanism `BottomTabBar` already uses. A third bug
  of the same shape shipped anyway: the shell's `<main>` (`layout.tsx`) had
  `overflow-y-auto` left on it. `main` never had a definite height to clip
  against either, so it never actually scrolled — but declaring `overflow`
  on it still made it the nearest scrollport for every `sticky` descendant,
  which then had a permanently-zero `scrollTop` to pin against and so never
  pinned at all. Result: opening a household far down the list rendered the
  detail card off the top of the viewport with nothing visibly happening.
  Fixed by dropping `overflow-y-auto` from `main` — it was vestigial, nothing
  in the codebase reads its `scrollTop`. **Any ancestor of a `sticky`
  element declaring `overflow` (auto/hidden/scroll) hijacks its scrollport
  this way, even if that ancestor itself never ends up scrolling.** Same
  `Mode` state and handlers as the full-screen-swap path — `isDesktop`
  (`useMediaQuery`, same hook the Comparisons cards/table split already
  uses) only changes *where* `detail` is placed, never the state.
- **Plan → Contacts / Questions** — their card lists go
  `sm:grid-cols-2 lg:grid-cols-3`. Cheap: the cards were already
  self-contained, this is just the wrapping `<ul>`'s className. Edit/Add
  itself reuses the Guests split-pane wholesale: below `lg:` it still fully
  replaces the list (`if (!isDesktop) return detail ?? list`), but at `lg:+`
  the form opens in the same `lg:sticky lg:top-6` right column beside the
  list instead of swapping the whole screen away — same `isDesktop` +
  `list`/`detail` shape as `guests/page.tsx`, no new mechanism.

**Deliberately left single-column** (wider shell only, no grid/split): More,
More → Setup, the `/tenants` picker, Landing, NotInvited. Short settings or
choice screens — there's nothing on them to put in a second column. Don't
add one just because the viewport is wide.

**Comparisons** (`plan/comparisons/[comparisonId]/page.tsx`) needed no
structural change — its existing `CardsView`/`TableView` split (cards on
mobile, table on desktop, FEATURES.md §3.2) simply gets more real width now
that the shell isn't clamped, so `TableView` needs its sideways scroll less
often.

## Feature spec

Product scope, data model, analytics and build order live in `@FEATURES.md`.

Division of authority:
- **This file** is authoritative on *how* — stack, hosting, constraints, rejected approaches.
- **`FEATURES.md`** is authoritative on *what* — features, Firestore collections, phasing.
- If the two conflict, **this file wins**, and tell me about the conflict rather than silently
  picking one.

`FEATURES.md` §0 records decisions that were worked through deliberately. Do not re-derive or
quietly change them.

## Deployment & hosting (as-built, from the Phase 1 session)

Concrete infrastructure state. Identifiers and the manual console wiring that isn't captured in
code — read this before changing anything host-related.

### Identifiers
- **Firebase project:** `weddinghq-d125b` — Spark (free) plan. **Never enable Blaze.**
- **Firestore location:** `nam5` (US multi-region). **Permanent — cannot be changed** without a
  new project + data migration. Chosen because the primary user is in Phoenix.
- **Auth:** Google provider only. **Storage is NOT enabled** (receipts are Phase 6).
- **GitHub repo:** `shivamjee/weddingHQ` (note: local folder is `wedding_app`).
- **Vercel:** auto-deploys `main`. **Production URL: `wedding-hq-ten.vercel.app`.**
- **Config:** the six `NEXT_PUBLIC_FIREBASE_*` values live in `.env.local` (local) **and** the
  Vercel dashboard (production, build-time inlined). They are public web config, not secrets.
- **`GEMINI_API_KEY`** (Phase 2 §5b, optional): the project's **only real secret**. Deliberately
  **unprefixed** so Next.js never inlines it into the browser bundle. Free tier from
  [AI Studio](https://aistudio.google.com/apikey) — no card, no billing account, and **not** a
  Google Cloud/Blaze thing. Unset ⇒ the "Add with AI" button is hidden and everything else works
  identically. `GEMINI_MODEL` optionally overrides the model id when Google retires one.
- **Server code:** exactly one route handler, `src/app/api/ai/compare/route.ts`, on Vercel Hobby.
  It reads and writes **nothing** in Firestore — it returns a suggestion and the client performs
  the write — so it adds no rules surface. Everything else is still pure client + Firestore rules.
- **Owner account:** `shivamjee@rocketmail.com` — global admin (`users/{uid}.isAdmin = true`) and
  `role: "couple"`, `side: "a"` in the `shivam-swara` tenant.
- **First tenant:** `tenants/shivam-swara` — `sideA.label` "Shivam", `sideB.label` "Swara".

### How Google sign-in is wired to the host (important)
Sign-in uses a **same-origin `authDomain`** to dodge browser third-party-storage blocking
(which otherwise silently reverts sign-in to signed-out, on Vercel *and* localhost). Two code
pieces make the app serve Firebase's auth handler from its own domain:
- `next.config.ts` rewrites `/__/auth/:path*` → `https://<NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN>/__/auth/:path*`
- `src/lib/firebase.ts` sets `authDomain` to `window.location.host` on the client.

Because `authDomain` follows `window.location.host`, **the code needs no change for a new
domain** — but two console registrations do (both are per-domain, and sign-in fails without
them: `redirect_uri_mismatch` or a silent bounce back to the landing screen).

### ⚙️ Changing the hostname / adding a domain — checklist
Do all of these for the new domain (e.g. a custom domain like `weddinghq.com`):
1. **Vercel** → add the domain to the project (Settings → Domains). Env vars carry over.
2. **Firebase Console** → Authentication → Settings → **Authorised domains** → **Add domain** →
   the new host (e.g. `weddinghq.com`).
3. **Google Cloud Console** (`console.cloud.google.com/apis/credentials`, project
   `weddinghq-d125b`) → the **OAuth 2.0 Web client** ("Web client (auto created by Google
   Service)") → **Authorised redirect URIs** → add `https://<newhost>/__/auth/handler`.
4. No code change needed. Test sign-in on the new host.

Currently registered redirect URIs: `https://wedding-hq-ten.vercel.app/__/auth/handler` and
`http://localhost:3000/__/auth/handler`. Currently authorised domains include
`wedding-hq-ten.vercel.app` (plus Firebase's defaults + `localhost`).

### Google sign-in on plain `npm run dev` (localhost, HTTP) does not work
Confirmed in the installed SDK (`@firebase/auth` 1.13.3, `getHandlerBase()`): the popup/redirect
auth widget URL is *always* built as `https://${authDomain}/__/auth/handler` — there is no
exception for `localhost`, and no fallback to the page's own protocol. Since `authDomain` is
`window.location.host` (see `src/lib/firebase.ts`), on plain `next dev` that resolves to
`https://localhost:3000/__/auth/handler` — but `next dev` only speaks HTTP on that port, so the
browser gets `ERR_SSL_PROTOCOL_ERROR` before Google is ever reached. This affects **both** popup
and redirect sign-in, and is unrelated to the tenant/rules code — it's a hard SDK constraint.
Production is unaffected: Vercel serves the whole app over HTTPS, so the same logic produces a
URL that actually resolves.

**To test sign-in locally**, run `npm run dev:https` instead of `npm run dev` (adds
`--experimental-https`, a self-signed cert Next generates automatically) and open
`https://localhost:3000` — accept the one-time browser certificate warning. No code change is
needed; `authDomain` already follows `window.location.host` and picks up `https` automatically.
Alternatively, just test against the deployed Vercel URL.

### Toolchain / ops notes
- **`firebase-tools` is pinned to v13** in devDependencies because this Mac has **Java 14**;
  v14+ needs Java 21 for the Firestore emulator. Unpin only after upgrading Java to 21+.
- **Deploy security rules:** `npx firebase deploy --only firestore:rules --project weddinghq-d125b`
  (needs `npx firebase login` first).
- **Test security rules locally:** `npm run test:rules` (spins up the Firestore emulator).
- **Bootstrap:** three documents are created by hand in the Firestore console, because nobody can
  sign in to create them — `tenants/{tenantId}`, `memberships/{tenantId}__{email}` with
  `role: "couple"`, and `isAdmin: true` on that person's `users/{uid}`. After that, admins create
  weddings from `/tenants` and the couple invites people from the More tab.
- **Granting admin** is console-only, by design: the rules refuse every client write to `isAdmin`,
  including from another admin. Steps: the person must **sign in at least once first** —
  `users/{uid}` is only created on sign-in, even if they land on "not invited." Then, in the
  `users` collection, filter on `email == their@address` to find their doc (the doc id is their
  Firebase Auth **uid**, not their email — unlike `memberships`, which is email-keyed). Add
  `isAdmin` (boolean) = `true`. No redeploy needed.
- **Money:** stored as integer **paise**, never floats. Format via `src/lib/money.ts` only, and
  parse user input only via its `parseRupeeInput` — which rejects "₹1.8k" rather than guessing.
- **Turning the AI assist on** (Phase 2 §5b, optional): AI Studio → *Get API key* → *Create API
  key* → copy. Then Vercel → the project → **Settings → Environment Variables** → add
  `GEMINI_API_KEY` (name exactly that, **no** `NEXT_PUBLIC_` prefix) for **Production and
  Preview** → Save → **Deployments → ⋯ → Redeploy** (env vars are read at build time, so an
  existing deployment will not pick it up). Same line in `.env.local` for local dev. To confirm it
  never reached the browser: `grep -r GEMINI .next/static` must return nothing.
- **`server-only`** is aliased to its no-op entry in `vitest.config.ts`. Without that, importing
  any `src/lib/ai/*` module in a test throws "cannot be imported from a Client Component module",
  because the marker package needs React's `react-server` resolve condition, which Next supplies
  and Vitest does not.
- **Service worker** (`public/sw.js`) is **hand-written** (not Serwist) — Next 16 is bleeding-edge
  and the offline-shell requirement is minimal. Bump `CACHE` in it when shell assets change.

## Current phase

**Phase 2 — Decision support is COMPLETE** (`PHASE2.md`, kept as a record). Shipped: categories
and events setup under More, per-side budget allocations with allocation health and a side-by-side
comparison, contacts with tap-to-call/WhatsApp, open questions grouped by who to ask, generic
comparison tables (cards on mobile, table on desktop, highlight-best), the AI comparison assist,
and a light Home summary. **Planning only — no expense entry**, by design.

Two additions beyond the brief's letter, both deliberate and commented at the code:
- `Criterion.betterIs` (optional) — deriving the winner from `type` alone marks the *farthest*
  venue as best on "Distance (km)". Existing criteria keep the type-based default.
- The comparison table renders inside the standard max-w-md app column and scrolls sideways with a
  sticky first column, rather than breaking the shell's single layout on desktop. Change the shell
  deliberately if the full window is ever wanted.

**Phase 2.1 — QA fixes, layered on top of Phase 2, is COMPLETE.** From real usage over two weeks:
- **Bottom nav no longer scrolls away.** It was a plain flex sibling with no `sticky`/`fixed`; a
  long page scrolled the *document*, taking the nav with it. Fixed with `sticky bottom-0` on
  `BottomTabBar` — see the comment there for why `<body>` itself isn't clamped instead.
- **Roles loosened.** Every member now writes a wedding's data — config, budgets, contacts,
  questions, comparisons, the tenant doc's own labels. `role == "couple"` now gates exactly one
  thing: inviting/removing people (`memberships`), which is also the privilege-escalation
  boundary. `useTenant()` exposes `canWrite` (any member) and `canInvite` (couple/admin) — never
  use `canWrite` for an invite control. `FEATURES.md` §1.1 and this file's § Multi-tenancy above
  are both updated; `PHASE2.md` is left as-is since it's a record of what Phase 2 shipped at the
  time.
- **Filters collapsed into one drawer** (native `<details>`, see `FilterPanel` in
  `src/components/ui/form.tsx`) on Questions and Contacts — three unlabelled stacked chip rows
  were most of the screen on a phone. Contacts gained the event filter Questions already had.
- **Contact `isBooked` removed** — written and shown as a pill but read by nothing;
  `ComparisonOption.status` already had its own `"booked"`.
- **Optional emoji icons** on categories and events, alongside colour (`WEDDING_ICONS` in
  `src/lib/colours.ts`, `IconPicker`). Colour stays required — charts fill from it, not from an
  emoji.
- **Budget: optional per-event breakdown inside a category.** The category amount is the
  *ceiling*; event amounts (`BudgetAllocation.eventId`) are children of it and must sum to no more
  than it, surfaced as "unassigned" rather than enforced in rules (would need a get() per write).
  `allocationHealth` / `comparisonRows` filter to `eventId == null` internally so itemising a
  category can never inflate its total — see `src/lib/budget.ts`. A new `eventComparisonRows()`
  plus a Category/Event toggle on the Budget charts shows the same event amounts aggregated across
  every category. `FEATURES.md` §2.1 is updated to match, including a stale `_totals/{side}`
  subcollection path that was actually always a flat `_totals_{side}` doc.

**Phase 3 — Guest list is COMPLETE** (`PHASE3.md`, kept as a record — it has an "AS BUILT" note
where the shipped read model differs from the original brief). Households as the invitation unit,
`guests` top-level with names deliberately optional, a tier ladder (`must` → `should` → `if_space`)
with a cumulative running total against an editable `settings/guestTarget`, a cost projection from
`Event.perPlateEstPaise` with a live marginal-cost line while adding a household, combinable
filters where every on-screen count respects them, a room block, CSV import (column mapping →
dry-run preview with duplicate warnings → commit as `proposed`) and export, fuzzy duplicate
detection at entry, and an append-only `guestLog` for provenance. All in `src/lib/guests.ts` (pure,
unit-tested) plus `src/app/t/[tenantId]/guests/`.

Two decisions from `FEATURES.md` §4.1, load-bearing and made deliberately — don't quietly undo
them:
- **Named guests are a top-level `tenants/{tenantId}/guests` collection, not a subcollection of
  the household.** Nesting them would force `collectionGroup` queries for RSVP, dietary and
  seating in Phase 6 — and a collectionGroup query spans *every* tenant, which would put tenant
  isolation back on a `tenantId ==` filter a query could forget. See § Multi-tenancy above.
- **Head counts live on the household and are never derived from guest documents.** "Dad's
  colleagues, 12 people" must be enterable with zero names attached; that is what people actually
  type, and demanding twelve blank rows is how the feature goes unused. Enforced in
  `src/lib/guests.ts`: no function there takes a `guests` document at all.

One read-model correction made during the build, not in the original brief: `PHASE3.md` asked for
50-row pages with a cursor, but "every count respects the active filters" (§4.4) is impossible over
a partial page — a filtered headcount computed from page 1 of several is simply wrong. The Guests
screen instead does **one** bounded read of the whole household list (`limit(500)`) and paginates
only the *rendering*; every count is computed from the full in-memory list. Same trade the Budget
screen already makes at 300 documents. `aggregates/guestTotals` (for Home, which cannot afford that
same read) is **recompute-and-overwrite, not transactional** — the screen already holds the full
list after any write, so it recomputes the whole aggregate and `setDoc`s it. No `runTransaction`
existed anywhere in this codebase to build the originally-briefed version on top of; this is the
same guarantee (Home never shows numbers from before the last write settled) with nothing to get
wrong in a transaction. `FEATURES.md` §4.5 and `PHASE3.md` are both updated to match.

**Phase 3.1 — Guest-list QA, layered on top of Phase 3, is COMPLETE.** From walking the shipped
screens:
- **Rows are minimal; detail lives on a profile screen.** A household row and a named-guest row are
  now one glance line each, and the whole row is the tap target. Tapping opens `HouseholdView` /
  `GuestView` — read-only, with the full detail set and tap-to-call/WhatsApp/email. Edit, Names and
  Remove moved there. Stacking three action pills under every card made a list of a hundred
  households unreadable on a phone.
- **`ActionLink` promoted into `src/components/ui/form.tsx`** from `plan/contacts/page.tsx`, which
  now imports it. Three screens render call/WhatsApp/email pills; one implementation.
- **`PageHeader` gained `onBack`** alongside `backHref`, for screens reached by in-component state
  (the "view" modes above) rather than a real route. `backHref` still wins when both are set.
- **Named guests carry optional `phone` / `email`**, falling back to the household's when unset —
  the household is still the invitation unit, so most names will never set their own. Households
  gained an optional `email` for the same reason. Both are `?`-optional in TypeScript because
  documents written before them exist; read as `?? ""`.
- **Every household save routes into that household's Names screen**, add or edit, with a line on
  the form saying names are optional and come next. Saving then hunting for a "Names" button was
  the hop people forgot.
- **The tier ladder's `Running` column became `Rooms`** (per-tier, not cumulative — `LadderRow.rooms`
  off the same `summarise()` call). The cumulative running total that marks *which tier breaks the
  target* now appears only in the sentence under the table. `FEATURES.md` §4.4 is updated.
- **A "Named guests" browser** under the summary box on the Guests tab: every named guest across the
  currently filtered households, lazily read only when the expander is opened. Tapping a row opens
  the same `GuestView`, minus Edit/Remove — it is a cross-household browse, and editing stays on the
  household the guest belongs to.

**Responsive layout — tablet/desktop, layered across Phases 1–3, is COMPLETE.**
Cross-cutting, not tied to one feature phase — see § Responsive layout above
for the full, authoritative account (breakpoints, the sidebar shell, which
screens got bespoke desktop treatment and which stayed single-column). This
reverses the `PHASE1.md` call to keep one phone-width layout everywhere;
`PHASE1.md` itself is left as the historical record of that original decision.

Phase 1 — Foundation is **COMPLETE** (`PHASE1.md`, kept as a record): a deployed, installable,
access-gated PWA shell — Google sign-in, Firestore rules + emulator tests, money helpers,
manifest + service worker, five-tab nav.

Phase 1.5 — Multi-tenancy is **COMPLETE** (`PHASE1.5.md`): weddingHQ became a container for many
weddings. It replaced the `allowlist` collection with `memberships`, moved all wedding data under
`tenants/{tenantId}/…`, changed sides from `"shivam"/"swara"` to `"a"/"b"` with tenant labels, and
added the global admin role. **Phase 2 builds on that shape** — see § Multi-tenancy above.

**Phase 4 — Money in motion is NEXT and NOT STARTED.** The brief is `PHASE4.md`, which is
**marked TO BE REVIEWED** — it was drafted from `FEATURES.md` §2.2–§2.7 at the end of the Phase 3
session and has not been read back or agreed. Read it and settle its open questions before writing
any code against it. Nothing in this repo implements expenses yet.

Still out of scope until their own phase: tasks and run sheets (Phase 5+); receipts, Firebase
Storage, RSVP and AI expense categorisation (Phase 6). The categoriser will reuse
`src/lib/ai/provider.ts` and the route-handler pattern Phase 2 established rather than building a
second AI integration.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
