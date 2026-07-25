# CLAUDE.md — Wedding App

## Project overview

A private wedding planning web app for a small, closed group: me, my girlfriend, my parents, and my in-laws. Roughly 5–15 users total, all invited by me. Not a commercial product, not public-facing.

Primary use is on phones. Desktop should work, but design mobile-first.

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

- Mobile-first responsive layout.
- Keep the UI simple and legible. Assume non-technical users of varying ages — large tap targets, clear labels, minimal jargon.
- Keep Firebase config in environment variables (`NEXT_PUBLIC_FIREBASE_*`), set in both `.env.local` and the Vercel dashboard. Never commit real credentials.
- Comment anything that has a cost or security implication so I can spot it later.

## How to work with me

- I want Claude Code to build this. I'm not planning to hand-write the application code myself.
- Explain the manual steps I do have to perform, in order, with no assumed knowledge.
- If a decision above turns out to be genuinely wrong for a specific feature, say so directly and explain why — but don't quietly substitute a different stack.

## Project context

Wedding for Shivam and Swara. The wedding is **more than a year away** and we are at an early
planning stage — the app's job right now is decision support (comparing venues, negotiating
headcount, sketching budgets), not day-of execution. Build order reflects that.

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
- **Couple/admin account:** `shivamjee@rocketmail.com` (allowlist `role: "couple"`, `side: "shivam"`).

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

### Toolchain / ops notes
- **`firebase-tools` is pinned to v13** in devDependencies because this Mac has **Java 14**;
  v14+ needs Java 21 for the Firestore emulator. Unpin only after upgrading Java to 21+.
- **Deploy security rules:** `npx firebase deploy --only firestore:rules --project weddinghq-d125b`
  (needs `npx firebase login` first).
- **Test security rules locally:** `npm run test:rules` (spins up the Firestore emulator).
- **Bootstrap:** the first `allowlist/{email}` doc is created by hand in the Firestore console
  (nobody can sign in to create it). New invitees are added by a `role: "couple"` user.
- **Money:** stored as integer **paise**, never floats. Format via `src/lib/money.ts` only.
- **Service worker** (`public/sw.js`) is **hand-written** (not Serwist) — Next 16 is bleeding-edge
  and the offline-shell requirement is minimal. Bump `CACHE` in it when shell assets change.

## Current phase

**Phase 2 — Decision support.** The active brief is in `PHASE2.md`. Read it before starting work.

Phase 1 — Foundation is **COMPLETE** (`PHASE1.md`, kept as a record): a deployed, installable,
allowlist-gated PWA shell — Google sign-in, Firestore rules + emulator tests, money helpers,
manifest + service worker, five-tab nav.

Phase 2 builds categories/events setup, per-side budget allocations, comparison tables, open
questions, and contacts — **planning only, no expense entry**. Scope draws on `FEATURES.md` §2–§5;
`PHASE2.md` is authoritative on what's in/out for this phase. Do not build later-phase features
(expenses, guests, tasks, receipts) — see `PHASE2.md` "Out of scope".
