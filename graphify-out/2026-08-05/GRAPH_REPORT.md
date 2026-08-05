# Graph Report - wedding_app  (2026-08-05)

## Corpus Check
- 115 files · ~93,938 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 854 nodes · 1983 edges · 94 communities (32 shown, 62 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da2883b7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App Root & Layout
- Tenant Shell & More Tab
- Budget Page & Home
- Tenant Config & Firestore Paths
- Deploy & Hosting Config
- Package Dependencies
- TypeScript Lib References
- Dev Dependencies
- Phase 2 Firestore Collections
- Path Builder Helpers
- AI Comparison Route
- contacts/page.tsx
- Comparison Views & Criteria Editor
- FEATURES Collections & Aggregates
- FEATURES AI & Money Rules
- tenantHref
- README Feature Highlights
- Multi-tenancy Data Model
- CLAUDE.md Doc Cross-references
- Sides & Tenant Context Hooks
- Tenancy Collections & Build Order
- Stack Choices & OAuth Setup
- Prettier Config
- Admin Grant Process
- Rejected Backend Options
- Guests Page & Empty State
- Icon Generation Script
- server-only & Vitest Config
- ESLint Config
- Storage & Receipts (Deferred)
- Tasks & Timeline (Deferred)
- Task Reminders & Cron
- Next.js Config
- Tenant Picker Entry Flow
- Memberships Doc Placement
- Phase 1 Scope
- PostCSS Config
- Service Worker Precache
- verifyCaller Test
- Email Magic Link Option
- Firebase Env Vars
- Gemini Model Env Override
- GitHub-Vercel Autodeploy
- Google Sign-in Method
- Phase 1 Doc Reference
- Shivam & Swara Wedding
- Tenants Picker Route
- Tenants Route
- Vercel Production URL
- Firebase Project ID
- Budget Visibility Rule
- Per-side Budgets
- Budget Totals
- Contacts Collection
- INR Currency
- Currency Settings
- Day-of Run Sheets
- Deferred Features List
- Expense Entry UX
- Expense Lifecycle States
- Expense Splits
- Guest List Feature
- Guest Households & Tiers
- Proposed/Confirmed Provenance
- Side Membership Exclusivity
- Sides A & B
- Phase 1.5 People Screen
- Phase 1.5 Sides Rename
- Tenant Creation Admin-only
- Phase 1 Standing Rules
- Apple Touch Icon
- File Icon Asset
- Globe Icon Asset
- 192px App Icon
- 512px App Icon
- Maskable 512px Icon
- Next.js Logo Asset
- Vercel Logo Asset
- Window Icon Asset
- README Local Dev Commands
- README Nav Components
- README Service Worker Note
- README Budget/Comparison Screens
- TenantProvider.tsx
- Landing.tsx
- PHASE4.md — Money in motion
- AuthProvider.tsx
- Step 2: tiers + tier ladder
- Vercel (frontend hosting)

## God Nodes (most connected - your core abstractions)
1. `useTenant()` - 51 edges
2. `useAuth()` - 38 edges
3. `toPaise()` - 34 edges
4. `useConfig()` - 30 edges
5. `Side` - 27 edges
6. `tenantHref()` - 26 edges
7. `formatINR()` - 25 edges
8. `Paise` - 19 edges
9. `PrimaryButton()` - 18 edges
10. `useLoader()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Next.js breaking-changes warning` --semantically_similar_to--> `Next.js (App Router)`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `isMember() rules helper` --semantically_similar_to--> `isTenantMember(tid) rules helper`  [INFERRED] [semantically similar]
  PHASE1.md → PHASE1.5.md
- `isCouple() rules helper` --semantically_similar_to--> `isTenantCouple(tid) rules helper`  [INFERRED] [semantically similar]
  PHASE1.md → PHASE1.5.md
- `Tech stack table` --cites--> `Vercel (frontend hosting)`  [EXTRACTED]
  README.md → CLAUDE.md
- `Data layout: subcollections under tenants/{tenantId}` --conceptually_related_to--> `Multi-tenancy model (authoritative)`  [EXTRACTED]
  PHASE1.5.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **FEATURES.md §0 Settled Decisions** — features_weddinghq_tenancy, features_sides_a_b, features_expense_splits_individuals, features_budgets_per_side, features_budget_consumption_shares, features_side_membership_exclusive, features_budget_visibility_everyone, features_currency_inr, features_expense_lifecycle_three_states, features_guest_management_households_tiers [EXTRACTED 1.00]
- **Changing hostname / adding a domain checklist** — claude_vercel, claude_google_cloud_console_oauth_client, claude_authdomain_same_origin_proxy, claude_wedding_hq_ten_vercel_app [EXTRACTED 1.00]
- **AI comparison-assist route-handler pattern** — phase2_ai_route_handler, phase2_gemini_api_key, phase2_verifycaller, phase2_zod_schema_validation, phase2_src_lib_ai_provider_ts [EXTRACTED 1.00]

## Communities (94 total, 62 thin omitted)

### Community 0 - "App Root & Layout"
Cohesion: 0.14
Nodes (20): GET(), POST(), RequestBody, AiResponse, aiResponseSchema, buildPrompt(), coerceValue(), RESPONSE_SCHEMA (+12 more)

### Community 1 - "Tenant Shell & More Tab"
Cohesion: 0.08
Nodes (47): BudgetData, BreakdownRow, GuestSummary, Paise, LoadedTenant, TenantContextValue, BudgetAllocation, BudgetAllocationWithId (+39 more)

### Community 2 - "Budget Page & Home"
Cohesion: 0.14
Nodes (34): AllocationRow(), AmountEditor(), EventAmountRow(), GroupBy, SideDetail(), TotalBudgetEditor(), View, EventForm() (+26 more)

### Community 3 - "Tenant Config & Firestore Paths"
Cohesion: 0.06
Nodes (47): CategoriesSection(), CategoryRow(), EventsSection(), reorder(), NewWeddingForm(), ColourPicker(), OptionMark(), IconPicker() (+39 more)

### Community 4 - "Deploy & Hosting Config"
Cohesion: 0.05
Nodes (41): Same-origin authDomain proxy for Google sign-in, npx firebase deploy --only firestore:rules, npm run dev:https localhost workaround, firebase-tools pinned to v13 (Java 14), Firestore security rules (real access boundary), Money stored as integer paise, next.config.ts (/__/auth rewrite), src/lib/firebase.ts (+33 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.11
Nodes (19): firebase, jose, next, dependencies, firebase, jose, next, papaparse (+11 more)

### Community 6 - "TypeScript Lib References"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "Dev Dependencies"
Cohesion: 0.11
Nodes (19): eslint, firebase-tools, devDependencies, eslint, firebase-tools, tailwindcss, @tailwindcss/postcss, @types/node (+11 more)

### Community 8 - "Phase 2 Firestore Collections"
Cohesion: 0.11
Nodes (23): Turning the AI assist on (manual steps), GEMINI_API_KEY (server-only secret), Phase 2 — Decision support (complete), src/app/api/ai/compare/route.ts, AI assist on comparisons (§3.3), AI expense categorisation (§9.1), comparisons/{id}/options/{optionId} (§3.2), comparisons/{comparisonId} (§3.2) (+15 more)

### Community 9 - "Path Builder Helpers"
Cohesion: 0.22
Nodes (9): scripts, build, dev, dev:https, lint, start, test, test:rules (+1 more)

### Community 10 - "AI Comparison Route"
Cohesion: 0.10
Nodes (44): Mode, FilterRows(), STATUS_STYLES, AiAssistSheet(), SuggestedCriterion, SuggestedValue, Suggestion, CardsView() (+36 more)

### Community 11 - "contacts/page.tsx"
Cohesion: 0.17
Nodes (20): ContactCard(), GuestNames(), GuestView(), HouseholdView(), Rows(), PageHeader(), guestDoc(), guestsCol() (+12 more)

### Community 12 - "Comparison Views & Criteria Editor"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 16 - "README Feature Highlights"
Cohesion: 0.18
Nodes (11): Optional AI assist on comparisons, src/lib/auth/AuthProvider.tsx, Budget tab: allocations + allocation health, Sign in with Google, one tap, Guests tab: coming-soon placeholder, Light Home summary, Live app: wedding-hq-ten.vercel.app, Plan tab: comparisons, questions, contacts (+3 more)

### Community 17 - "Multi-tenancy Data Model"
Cohesion: 0.24
Nodes (10): Bootstrap: hand-created tenant/membership/isAdmin docs, tenants/{tenantId}/categories subcollection, tenants/{tenantId}/events subcollection, memberships/{tenantId}__{email} collection, Multi-tenancy model (authoritative), Phase 1.5 — Multi-tenancy (complete), tenants/{tenantId}/settings subcollection, src/lib/paths.ts (+2 more)

### Community 18 - "CLAUDE.md Doc Cross-references"
Cohesion: 0.40
Nodes (5): FEATURES.md (authoritative on what), tenants/{tenantId}/guests top-level collection, Household head counts never derived from guest docs, Phase 3 — Guest list (active brief), The two decisions that shape everything else

### Community 19 - "Sides & Tenant Context Hooks"
Cohesion: 0.22
Nodes (9): sideLabel(side) renderer, Sides are "a"/"b", labels from tenant doc, useTenant() hook, Routes moved to /t/{tenantId}/…, AuthProvider (reduced to identity), Known consequence: generic landing screen, MembershipsProvider (bounded query), TenantProvider (canWrite, sideLabel) (+1 more)

### Community 20 - "Tenancy Collections & Build Order"
Cohesion: 0.22
Nodes (9): Build order (§10), memberships/{tenantId}__{email} (§1.1), tenants/{tenantId} (§1.1), users/{uid} global identity (§1.1), Settled decision: weddingHQ holds many weddings (tenancy), Data layout: subcollections under tenants/{tenantId}, Phase 1.5 goal: multi-tenancy, Phase 2 goal: decision support tool (+1 more)

### Community 21 - "Stack Choices & OAuth Setup"
Cohesion: 0.50
Nodes (4): Firebase Cloud Functions (avoid, Blaze-only), Firebase Firestore (Spark plan), Rejected: Railway/Render/Fly.io/DigitalOcean/AWS EC2, Rejected: standalone Postgres/MySQL/Mongo

### Community 22 - "Prettier Config"
Cohesion: 0.29
Nodes (6): plugins, printWidth, semi, singleQuote, trailingComma, prettier-plugin-tailwindcss

### Community 23 - "Admin Grant Process"
Cohesion: 0.33
Nodes (6): First tenant tenants/shivam-swara, Granting admin (console-only process), users/{uid}.isAdmin global admin flag, Owner account shivamjee@rocketmail.com, users/{uid} global identity collection, Admin grant is console-only

### Community 24 - "Rejected Backend Options"
Cohesion: 0.06
Nodes (63): Home(), BudgetPage(), HomePage(), TenantShell(), fetchMembers(), InviteForm(), MorePage(), RemoveButton() (+55 more)

### Community 26 - "Guests Page & Empty State"
Cohesion: 0.06
Nodes (67): ImportGuestsPage(), Loaded, LOG_VERB, Mode, GuestBarRow, GuestBars(), GuestTooltip(), HouseholdCard() (+59 more)

### Community 92 - "PHASE4.md — Money in motion"
Cohesion: 0.08
Nodes (24): Aggregates — the open architectural question, Build order, Definition of done, Navigation mapping, New data models, Open questions — settle these before building, Out of scope — do not build (later phases), `paidBy` and `shares` are independent, and budget consumption follows `shares` (+16 more)

### Community 94 - "AuthProvider.tsx"
Cohesion: 0.13
Nodes (15): geistMono, geistSans, metadata, viewport, ServiceWorkerRegistrar(), AuthContext, AuthContextValue, AuthProvider() (+7 more)

### Community 96 - "Step 2: tiers + tier ladder"
Cohesion: 0.05
Nodes (47): aggregates/balances (§2.5), aggregates/budgetTotals (§2.5), Budget analytics (§2.6), Budget consumption driven by shares, never who paid, tenants/{tenantId}/budgets/{side}_{categoryId} (§2.1), categories/{categoryId} (§1.2), CSV import and export (§4.6), events/{eventId} (§1.2) (+39 more)

### Community 100 - "Vercel (frontend hosting)"
Cohesion: 0.18
Nodes (12): Next.js breaking-changes warning, Firebase Authentication, Google Cloud Console OAuth 2.0 Web client, Next.js (App Router), Changing hostname / adding a domain checklist, PWA (installable web app), Rejected: native iOS/Android apps (React Native), Rejected: self-hosting + dynamic DNS (+4 more)

## Knowledge Gaps
- **238 isolated node(s):** `Mode`, `Loaded`, `LOG_VERB`, `semi`, `singleQuote` (+233 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **62 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useTenant()` connect `Rejected Backend Options` to `Tenant Config & Firestore Paths`, `AI Comparison Route`, `Budget Page & Home`, `Guests Page & Empty State`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Phase 3 — Guest list (active brief)` connect `CLAUDE.md Doc Cross-references` to `Phase 2 Firestore Collections`, `Tenancy Collections & Build Order`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `tenants/{tenantId}/guests top-level collection` connect `CLAUDE.md Doc Cross-references` to `Multi-tenancy Data Model`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `Mode`, `Loaded`, `LOG_VERB` to the rest of the system?**
  _238 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Root & Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.14153846153846153 - nodes in this community are weakly interconnected._
- **Should `Tenant Shell & More Tab` be split into smaller, more focused modules?**
  _Cohesion score 0.0777323202805377 - nodes in this community are weakly interconnected._
- **Should `Budget Page & Home` be split into smaller, more focused modules?**
  _Cohesion score 0.13636363636363635 - nodes in this community are weakly interconnected._