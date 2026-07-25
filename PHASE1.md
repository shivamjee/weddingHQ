# PHASE1.md — Foundation

Scope for the first Claude Code session. Read `CLAUDE.md` (stack, constraints) and `FEATURES.md`
§0–§1 (settled decisions, foundations) before starting. **Do not read past §1 of `FEATURES.md`
for this phase** — everything after it is out of scope and reading it invites drift.

**Goal:** a deployed, installable PWA that a family member can sign into on their phone, that
correctly refuses anyone not on the allowlist, with an empty but navigable shell.

No wedding features. Not one. This phase is entirely plumbing, and its value is that every later
phase starts from a working deployment instead of debugging auth and hosting at the same time as
business logic.

---

## Build order within the phase

Work in these steps. Stop and hand back at each **[MANUAL]** marker — those need me to click
things in a dashboard, and the following steps will not work until I have.

### Step 1 — Scaffold

- Next.js, App Router, TypeScript, Tailwind.
- `src/` directory structure.
- ESLint + Prettier.
- `.gitignore` covering `.env.local`, `.next`, `node_modules`.
- Commit and push. **[MANUAL]** I connect the GitHub repo to Vercel and confirm the first deploy
  succeeds before we go further. Give me click-by-click instructions.

Verifying the deploy pipeline on an empty app takes five minutes. Verifying it after three days
of feature work means debugging the app and the pipeline simultaneously.

### Step 2 — Firebase project

**[MANUAL]** Walk me through, with no assumed knowledge:
- Creating the Firebase project (Spark plan — do not let me enable Blaze).
- Enabling Firestore in production mode, choosing a region (`asia-south1`).
- Enabling Authentication with the Google provider.
- Registering a Web App and copying the config values.

Do **not** enable Storage. Receipts are phase 6.

Then:
- `src/lib/firebase.ts` — client SDK init from `NEXT_PUBLIC_FIREBASE_*` env vars, guarded against
  re-initialisation on hot reload.
- `.env.local.example` committed with empty values; `.env.local` gitignored.
- **[MANUAL]** I paste real values into `.env.local` and into the Vercel dashboard.
- **[MANUAL]** I add the Vercel production domain to Firebase Auth → Settings → Authorised
  domains. Remind me explicitly: sign-in fails silently in production without this and the error
  message is useless.

### Step 3 — Types and money helpers

- `src/types/` — TypeScript interfaces for every collection in `FEATURES.md` §1. Only §1: users,
  allowlist, events, categories, settings. Not expenses, not households.
- `src/lib/money.ts`:
  - All money is integer paise. Types should make a bare `number` for money awkward — consider a
    branded type.
  - `formatINR(paise)` → `₹13,00,000` with Indian digit grouping (not Western thousands).
  - `formatCompact(paise)` → `13L`, `1.2Cr`.
  - `convert(paise, rate)` for display currency, returning a formatted string.
  - Unit tests for the grouping logic. Indian grouping is `##,##,###` not `###,###` and getting it
    wrong is subtle enough to survive eyeballing.

### Step 4 — Landing screen and auth

This app is private and closed — nobody needs convincing to use it, so this is **not** a
marketing page. It has exactly one job: get a family member signed in with one tap, and make it
unmistakable that they're in the right place before they do.

**The signed-out screen shows:**
- Both names — "Shivam & Swara" — so nobody wonders if they've opened the wrong link.
- The wedding date if it's set, otherwise omitted rather than showing a placeholder.
- One large "Sign in with Google" button. Nothing else competing for attention.
- No form fields, no "learn more", no marketing copy.

This is a real design decision, not a stub — treat it with the same care as the rest of the UI
(§ Code and UX guidance in `CLAUDE.md`): legible type, generous spacing, works at a glance for a
non-technical parent.

**Auth logic:**
- Google sign-in via Firebase Auth popup, with redirect fallback for iOS Safari.
- On successful sign-in: read `allowlist/{email.toLowerCase()}`.
  - Exists → create or update `users/{uid}` with side and role copied from the allowlist entry,
    then into the app.
  - Missing → sign out immediately and show a **separate** "not invited" screen — distinct from
    the landing screen, no app chrome, no retry loop.
- An auth context provider exposing `{ user, profile, loading }`.
- Route protection: unauthenticated or non-allowlisted users never reach an app route, and never
  see the landing screen again once signed in — they land straight in the app on return visits.
- A loading state that is not a blank white screen, between tapping sign-in and reaching the app.
  This is the slowest moment in the app and parents will assume it's broken if it's blank.

**Sign-in must be as close to one tap as possible.** No email entry, no password, no confirmation
step beyond Google's own account picker.

### Step 5 — Security rules

`firestore.rules`, and this is the security boundary — **not** the UI checks in step 4.

- Helper: `isMember()` — caller is authenticated and `users/{request.auth.uid}` exists.
- Helper: `isCouple()` — the above, and that doc's `role == "couple"`.
- Default deny on everything.
- `users/{uid}` — readable by any member, writable only by that uid, and the `role` and `side`
  fields must not be self-editable.
- `allowlist/*` — readable by any member, writable only by `isCouple()`.
- `categories`, `events`, `settings/*` — readable by any member, writable by `isCouple()`.
- Everything else — denied for now, opened per phase as collections arrive.

**[MANUAL]** I install the Firebase CLI and deploy the rules. Walk me through it.

Write rules tests using the emulator if it's cheap to do so. If it isn't, at minimum give me a
short manual test script: sign in as a non-allowlisted account and confirm reads fail.

**[MANUAL]** Bootstrap: I create the first `allowlist` document by hand in the Firestore console,
since nobody can sign in to create it. Tell me the exact document ID (my lowercased email) and
field values.

### Step 6 — PWA

- `manifest.json` — name, short name, `display: "standalone"`, theme colour, background colour,
  `start_url: "/"`, and icons at every required size (192, 512, plus a maskable 512 and the iOS
  180 apple-touch-icon).
- Placeholder icons are fine; flag that I should replace them.
- Service worker registering an offline shell cache. Keep it simple — no runtime data caching in
  this phase.
- iOS meta tags: `apple-mobile-web-app-capable`, status bar style, apple-touch-icon link.
- **Test on both iOS Safari and Android Chrome.** Tell me what to check and what "installed
  correctly" looks like on each. Standalone launch with no visible address bar is the pass
  condition.

Don't build anything on web push. iOS support is inconsistent and it isn't needed until phase 6,
where email is the chosen channel anyway.

### Step 7 — Navigation shell

- Bottom tab bar, mobile-first. Tabs: Home, Budget, Guests, Plan, More.
- Every tab renders an empty state saying what's coming, not a 404 or a blank page.
- Large tap targets — minimum 44px. Legible default type size; assume older eyes.
- A header showing the signed-in user and a sign-out control.
- Desktop: the same layout, centred, max-width constrained. Don't build a separate desktop
  navigation.

---

## Definition of done

All of these must be true before phase 2 starts:

1. Pushing to `main` auto-deploys to Vercel with no manual step.
2. I can install the app to my iPhone home screen and it launches standalone, no address bar.
3. The same is true on an Android device.
4. The signed-out landing screen shows both names and a single sign-in button, and I can sign in
   with Google in one tap.
5. A Google account **not** on the allowlist gets a distinct "not invited" screen and is signed
   out — it does not just re-show the landing screen.
6. A non-allowlisted account cannot read any Firestore data even via direct SDK calls — verified
   against the rules, not just the UI.
7. All five tabs navigate and render an empty state.
8. `formatINR` and `formatCompact` pass their tests.
9. No real credentials in the repo.
10. Firebase is still on the **Spark** plan.

---

## Out of scope — do not build

Expenses, budgets, guests, tasks, contacts, comparisons, schedules, charts, AI, email, receipts,
seating, RSVP.

If any of these feel necessary to make phase 1 "look finished", they aren't. Empty states are the
correct output of this phase.

---

## Standing rules for this and every phase

- **Ask before deviating from the stack.** `CLAUDE.md` lists explicitly rejected approaches. If
  one of them looks genuinely right for a specific problem, say so and explain why — don't
  quietly substitute.
- **Flag anything that costs money** before building it. Especially anything implying Cloud
  Functions, which means Blaze.
- **Comment anything with a cost or security implication** so I can find it later.
- **Bound every query with `limit()`.** No unbounded `getDocs()` on a growing collection, ever.
- **Explain manual steps in order, click by click**, assuming no prior knowledge of the Firebase
  or Vercel consoles.
- Stop at each `[MANUAL]` marker rather than assuming I've done it.
