# weddingHQ

A private wedding planning app for a small, closed group — a couple, their parents and their
in-laws (~5–15 people per wedding). Not a commercial product, not public.

weddingHQ can hold **more than one wedding**. Each wedding is a separate space with its own data
and its own invited people; you only ever see the weddings you've been invited to. The first one
is Shivam & Swara's.

**Live app:** [wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)

## What it does (so far)

Phases 1 (foundation) and 1.5 (multi-tenancy) are done: the plumbing every later phase builds on,
plus the ability to host several weddings.

- Sign in with Google, one tap — no passwords, no forms.
- Only invited people can get in, and only to the weddings they were invited to. Enforced by
  Firestore security rules, not just the app's UI.
- If you belong to one wedding you land straight in it; if you belong to several you pick.
- The couple can invite family from the **More** tab; an admin can create new weddings.
- Installs to your phone's home screen and opens like a native app (see below).
- A five-tab shell (Home, Budget, Guests, Plan, More) — Home, Budget, Guests and Plan currently
  show "coming soon" placeholders. Real features land in Phase 2.

The full feature roadmap lives in [`FEATURES.md`](FEATURES.md); the next phase's scope is in
[`PHASE2.md`](PHASE2.md), and the completed phases are recorded in [`PHASE1.md`](PHASE1.md) and
[`PHASE1.5.md`](PHASE1.5.md).

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
  ₹1,300,000).
- **`src/components/nav/`** — the bottom tab bar and header that make up the app's navigation
  shell.
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
config — copy `.env.local.example` and fill in the values from the Firebase console.

```bash
npm test          # unit tests (money helpers, tenant id scheme)
npm run test:rules  # Firestore security rules tests (spins up a local emulator)
npm run build      # production build
npm run lint       # ESLint
```
