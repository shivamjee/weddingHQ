# WeddingHQ

A private wedding planning app for Shivam & Swara's family — a small, closed group (~5–15
people: the couple, parents, and in-laws). Not a commercial product, not public.

**Live app:** [wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)

## What it does (so far)

The app is in **Phase 1 — Foundation**: no wedding features yet, just the plumbing every later
phase builds on.

- Sign in with Google, one tap — no passwords, no forms.
- Only invited family members can get in; everyone else sees a "not invited" screen and is
  signed out. This is enforced by Firestore security rules, not just the app's UI.
- Installs to your phone's home screen and opens like a native app (see below).
- A five-tab shell (Home, Budget, Guests, Plan, More) — each tab currently shows a "coming
  soon" placeholder. Real features land in later phases.

The full feature roadmap lives in [`FEATURES.md`](FEATURES.md); the active phase's scope is in
[`PHASE1.md`](PHASE1.md).

## How to install it on your phone

The app is a **PWA** (Progressive Web App) — no App Store or Play Store, just add it from your
browser and it behaves like an installed app (its own icon, full-screen, no address bar).

### iPhone (must use Safari — Chrome/others can't install PWAs on iOS)

1. Open **[wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)** in **Safari**.
2. Tap the **Share** button (square with an arrow pointing up), at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** (top right).
5. A "WeddingHQ" icon appears on your home screen — tap it to open. It should launch
   full-screen with no Safari address bar.

### Android (Chrome)

1. Open **[wedding-hq-ten.vercel.app](https://wedding-hq-ten.vercel.app)** in **Chrome**.
2. Tap the **⋮** menu (top right) → **Add to Home screen** (or **Install app**, or accept
   Chrome's own install banner if it appears).
3. Confirm by tapping **Install** / **Add**.
4. A "WeddingHQ" icon appears on your home screen — tap it to open, full-screen.

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
- **`src/lib/auth/AuthProvider.tsx`** — the sign-in flow: Google sign-in → check the invite
  allowlist → create/update the user's profile → into the app. Also the source of truth for
  "am I signed in and invited?" everywhere else in the app.
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
- **`tests/rules/`** — automated tests proving the security rules actually block
  non-invited accounts, run against a local Firestore emulator.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll need a `.env.local` with Firebase
config — copy `.env.local.example` and fill in the values from the Firebase console.

```bash
npm test          # money-helper unit tests
npm run test:rules  # Firestore security rules tests (spins up a local emulator)
npm run build      # production build
npm run lint       # ESLint
```
