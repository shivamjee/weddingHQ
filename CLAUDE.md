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

## Current phase

**Phase 1 — Foundation.** The active brief is in `PHASE1.md`. Read it before starting work.

Do not build features from later phases, and do not read past §1 of `FEATURES.md` while phase 1
is active — the rest is out of scope and reading it invites drift.

When phase 1 is complete, I will update this section to point at the next phase brief.
