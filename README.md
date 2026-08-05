# weddingHQ

A private wedding planning app for a small, closed group — a couple, their parents and their
in-laws (~5–15 people per wedding). Not a commercial product, not public.

weddingHQ can hold **more than one wedding**. Each wedding is a separate space with its own data
and its own invited people; you only ever see the weddings you've been invited to. The first one
is Shivam & Swara's.

**Live app:** [wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)

## What it does (so far)

Phases 1 (foundation), 1.5 (multi-tenancy), 2 (decision support) and 3 (guest list) are done —
everything up to actually spending money.

- Sign in with Google, one tap — no passwords, no forms.
- Only invited people can get in, and only to the weddings they were invited to. Enforced by
  Firestore security rules, not just the app's UI.
- If you belong to one wedding you land straight in it; if you belong to several you pick.
- Any member can edit a wedding's data — budgets, setup, contacts, questions. Only the couple (or
  an admin) can invite or remove people, from the **More** tab; an admin can create new weddings.
- **Setup** (More tab): categories and events, reorderable, with a shared colour and an optional
  emoji icon used by every chart and list in the app.
- **Budget** tab: each side's total budget, per-category allocations (optionally broken down per
  event, e.g. "of Decor's ₹2L, ₹50k is Mehendi"), an allocation health bar with the unallocated
  remainder shown explicitly, and a side-by-side comparison chart that can group by category or by
  event. Planning only — no expenses yet.
- **Plan** tab: comparison tables (cards on mobile, a table on desktop, "highlight best"), open
  questions grouped by who to ask (filterable by status/category/event behind one drawer), and
  contacts with one-tap call / WhatsApp / email links (filterable by type/category/event).
- An optional **AI assist** on comparisons — paste rough notes, get suggested columns and filled-in
  values in a review screen where nothing saves until you confirm it. Hidden unless the app has a
  Gemini key configured; see [`CLAUDE.md`](CLAUDE.md) for how to turn it on.
- **Guests** tab: households as the invitation unit — "Dad's colleagues, 12 people" is a complete
  entry with no names needed. A **tier ladder** (must / should / if space) against an editable
  target headcount that says which tier breaks it and by how many, a **cost projection** from each
  event's per-plate estimate (with the live "+₹30,000" delta while you're still typing), combinable
  filters where every number on screen respects them, a room block, CSV import (map your columns,
  preview with duplicate warnings, then commit) and export, a duplicate warning as you type a name,
  and a log of who added or removed whom. Tap any household or name for a profile with one-tap
  call / WhatsApp / email.
- A light **Home** summary — allocation health, headcount against target, and how many questions
  are still open.
- Installs to your phone's home screen and opens like a native app (see below).

The full feature roadmap lives in [`FEATURES.md`](FEATURES.md). Completed phases are recorded in
[`PHASE1.md`](PHASE1.md), [`PHASE1.5.md`](PHASE1.5.md), [`PHASE2.md`](PHASE2.md) and
[`PHASE3.md`](PHASE3.md). Next up is Phase 4, money in motion — its brief,
[`PHASE4.md`](PHASE4.md), is drafted but **not yet reviewed**.

## How to install it on your phone

The app is a **PWA** (Progressive Web App) — no App Store or Play Store, just add it from your
browser and it behaves like an installed app (its own icon, full-screen, no address bar).

### iPhone (must use Safari — Chrome/others can't install PWAs on iOS)

1. Open **[wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)** in **Safari**.
2. Tap the **Share** button (square with an arrow pointing up), at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** (top right).
5. A "weddingHQ" icon appears on your home screen — tap it to open. It should launch
   full-screen with no Safari address bar.

### Android (Chrome)

1. Open **[wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)** in **Chrome**.
2. Tap the **⋮** menu (top right) → **Add to Home screen** (or **Install app**, or accept
   Chrome's own install banner if it appears).
3. Confirm by tapping **Install** / **Add**.
4. A "weddingHQ" icon appears on your home screen — tap it to open, full-screen.

Once signed in, you stay signed in — you won't see the sign-in screen again on that device.

## Tech stack

Chosen to stay entirely on free tiers and minimise manual infrastructure work (see
[`CLAUDE.md`](CLAUDE.md) for the full reasoning).

| Layer | Choice |
|---|---|
| Framework | [Next.js](https://nextjs.org) (App Router) + TypeScript |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Hosting | [Vercel](https://vercel.com) (Hobby/free) — auto-deploys on push to `main` |
| Database | [Firebase Firestore](https://firebase.google.com/docs/firestore) (Spark/free plan) |
| Auth | [Firebase Authentication](https://firebase.google.com/docs/auth) — Google sign-in |
| Testing | [Vitest](https://vitest.dev) + [`@firebase/rules-unit-testing`](https://firebase.google.com/docs/rules/unit-tests) (Firestore emulator) |
| PWA | Hand-written service worker (offline shell cache) + web manifest |

### Key pieces of the codebase

- **`src/lib/firebase.ts`** — Firebase client SDK setup. `authDomain` is set to the app's own
  domain (proxied via `next.config.ts`) rather than Firebase's default, so Google sign-in works
  reliably across browsers that block third-party storage.
- **`src/lib/auth/AuthProvider.tsx`** — who you are: Google sign-in and your global profile.
- **`src/lib/tenants/`** — which weddings you belong to (`MembershipsProvider`) and the one
  you're currently looking at (`TenantProvider`, the source of truth for "may I edit this?" and
  for the names shown for each side).
- **`src/lib/paths.ts`** — every Firestore path in one place. Each wedding's data lives under
  `tenants/{tenantId}/…`, so isolation is built into the path rather than into each query.
- **`firestore.rules`** — the actual security boundary. Every read/write to the database is
  checked against this file on Google's servers; the app's UI checks are just for a good
  experience, not the real gate.
- **`src/lib/money.ts`** — money helpers. All amounts are stored as integer paise (never
  floating-point rupees) and formatted with correct Indian digit grouping (₹13,00,000, not
  ₹1,300,000); also the only place typed rupee input is parsed.
- **`src/lib/budget.ts` / `src/lib/comparison.ts` / `src/lib/phone.ts`** — pure, unit-tested logic
  for allocation health, comparison-table scoring/highlighting, and turning a phone number typed
  any which way into working `tel:` / `wa.me` links.
- **`src/lib/guests.ts` / `src/lib/guestCsv.ts`** — pure, unit-tested guest-list maths: head counts
  and the cost projection (which read the household's hand-entered numbers and never count name
  documents), the tier ladder, the filters every on-screen total is derived through, and the CSV
  column mapping whose dry-run genuinely cannot write anything because it can't reach Firestore.
- **`src/lib/ai/`** — the AI comparison assist: `provider.ts` is the one place that calls Gemini
  (swap providers by editing this file alone), `verifyCaller.ts` verifies the caller's Firebase ID
  token with no service-account secret, `compareSchema.ts` is the zod contract for what the model
  is allowed to return. Called from `src/app/api/ai/compare/route.ts`, the app's only server code —
  it never writes to Firestore, only returns a suggestion the client saves after confirmation.
- **`src/components/nav/`** — the app's navigation shell: header, a bottom tab bar on phones, a
  sidebar on tablet/desktop (`md:` and up) — both read the same tab list so they can't drift.
- **`public/sw.js`** — the service worker that caches the app shell so it opens (rather than
  showing a browser error) with no signal.
- **`tests/rules/`** — automated tests proving the security rules actually block non-invited
  accounts, and that someone in one wedding cannot reach another's data. Run against a local
  Firestore emulator, with two weddings set up so isolation is genuinely tested.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` with Firebase
config — copy `.env.local.example` and fill in the values from the Firebase console. The AI assist
is optional: leave `GEMINI_API_KEY` blank and its button simply doesn't appear.

Google sign-in needs HTTPS locally — run `npm run dev:https` and open `https://localhost:3000`
instead of plain `npm run dev` (see `CLAUDE.md` for why).

```bash
npm test          # unit tests (money, tenant ids, budget, comparison, phone, guests, guest CSV)
npm run test:rules  # Firestore security rules tests (spins up a local emulator)
npm run build      # production build
npm run lint       # ESLint
```
