# PHASE1.5.md — Multi-tenancy

Kept as a record. Done between Phase 1 and Phase 2, at the point where the only real data in
Firestore was a single allowlist entry.

**Goal:** weddingHQ is the product; "Shivam & Swara" is one wedding inside it. Data is isolated per
wedding, people are invited per wedding, and a global admin can reach all of them.

**Why before Phase 2, not after:** Phase 2 builds per-side budget allocations, side-by-side
comparison charts, contacts, comparisons and questions — every one of them tenant-scoped and
side-keyed. Retrofitting tenancy under five new collections and a chart layer is several times the
work of doing it while the schema is nearly empty.

---

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Data layout | Subcollections under `tenants/{tenantId}/…` | Isolation is a path prefix, so no query can forget a `tenantId ==` filter and leak |
| Sides | `"a"` / `"b"` with labels on the tenant doc | `"shivam"`/`"swara"` cannot be schema values in a multi-wedding app |
| Access records | One `memberships/{tenantId}__{email}` doc = invitation **and** membership | Keyed by email so people can be invited before first sign-in; written only by the couple/admin, so self-elevation is structurally impossible |
| `memberships` placement | Top-level, not a tenant subcollection | "Which weddings am I in?" becomes one indexed query; a collection-group query would need an extra index and a second recursive rules block |
| Tenant creation | Admin only | The app is closed and invite-only; self-serve signup would make it a funnel |
| Entry flow | 1 wedding → straight in; 2+ or admin → `/tenants` picker | Most users are parents/in-laws in a single wedding and should never learn tenants exist |
| Admin grant | Console only — rules refuse every client write to `isAdmin` | The one privilege that crosses every tenant shouldn't be reachable from a phone |

---

## What changed

**Data model** — `allowlist/*` deleted. `users/{uid}` reduced to global identity plus `isAdmin`
(no more `role`/`side`). New `tenants/{tenantId}` and `memberships/{tenantId}__{email}`.
`categories` / `events` / `settings` moved under the tenant.

**`firestore.rules`** — full rewrite around `isTenantMember(tid)` / `isTenantCouple(tid)` /
`isAdmin()`. Two subtleties worth remembering:

- `tenants` splits `get` from `list`, with `list` admin-only. A member check inside a list rule
  runs one `exists()` per document scanned and would hit Firestore's 20-document-access limit per
  query as weddings accumulate. Members never list — they read memberships, then `get` by id.
- The `memberships` read rule is a three-way OR evaluated per document, which is what lets both
  real queries through (`where("email","==",me)` and `where("tenantId","==",t)`) while an
  unfiltered read of the collection is denied on the first document belonging to someone else.

**Tests** — `tests/rules/firestore.rules.test.ts` rewritten around **two** tenants so isolation is
proven, not assumed. 30 tests. The headline cases: a couple of tenant 1 cannot read, write, or
invite into tenant 2; nobody can make themselves an admin; a family member cannot promote
themselves. The test file imports the app's real `membershipId()` rather than reimplementing it,
so if `src/lib/tenantIds.ts` and the rules ever disagree the suite fails loudly — that drift would
otherwise be a silent, total access failure.

**App** — routes moved to `/t/{tenantId}/…`. `AuthProvider` reduced to identity; new
`MembershipsProvider` (one bounded query) and `TenantProvider` (tenant doc + the caller's
membership, exposing `canWrite` and `sideLabel()`). New `/tenants` picker with an admin
create-wedding form. More tab became a real People screen with invite-by-email. Landing, loading
screen, manifest and metadata rebranded to weddingHQ.

---

## Known consequence

**`PHASE1.md` Definition-of-done #4 no longer holds.** It required the landing screen to show both
names. Signed out, the app cannot know which wedding you are heading for, and the tenant document
is deliberately unreadable before sign-in. The landing screen is now generic weddingHQ, softened
by a `localStorage` line — "Sign back in to Shivam & Swara" — on a device that has opened a wedding
before. That is a display convenience only; nothing about it is trusted.

---

## Definition of done — met

1. All wedding data lives under `tenants/{tenantId}/…`; no top-level wedding collections remain.
2. A member of one wedding cannot read or write another's data — proven by emulator tests, not by
   the absence of a UI path.
3. A global admin reads and writes every wedding, can list all of them, and can create new ones;
   nobody else can create a tenant.
4. `isAdmin` cannot be granted through the client by anyone, including an admin.
5. Sides are `"a"`/`"b"` everywhere; every rendered side name comes from the tenant document.
6. Someone in exactly one wedding lands in it without seeing a picker.
7. `npm test`, `npm run test:rules`, `npm run lint`, `npm run build` all pass.
8. Firebase still on **Spark**. No Cloud Functions, no Storage, no new dependencies.
