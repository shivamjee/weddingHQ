import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { budgetAllocationId, budgetTotalsId, membershipId } from "@/lib/tenantIds";

// Emulator-backed proof that firestore.rules holds. Run via `npm run test:rules`
// (starts the Firestore emulator around Vitest).
//
// Two things are on trial here:
//   1. Non-invited accounts cannot read anything (the Phase 1 boundary).
//   2. A member of one wedding cannot reach another wedding's data — the whole
//      point of multi-tenancy, and the failure mode that would be invisible in
//      the UI because no screen ever tries it.

const PROJECT_ID = "weddinghq-rules-test";

// Two tenants. T2 exists solely so cross-tenant access has something to fail at.
const T1 = "shivam-swara";
const T2 = "other-wedding";

const ADMIN = { uid: "uid_admin", email: "admin@example.com" };
const T1_COUPLE = { uid: "uid_t1_couple", email: "shivamjee@rocketmail.com" };
const T1_FAMILY = { uid: "uid_t1_family", email: "mom@example.com" };
const T2_COUPLE = { uid: "uid_t2_couple", email: "someone@example.com" };
const INVITEE = { uid: "uid_invitee", email: "dad@example.com" }; // invited to T1, never signed in
const STRANGER = { uid: "uid_stranger", email: "stranger@example.com" }; // no memberships at all

// Deliberately the APP's id builder, not a copy of it. The membership id scheme
// is duplicated in firestore.rules (which concatenates tenantId + "__" + email);
// using the real function here means these tests fail loudly if the two ever
// drift apart, which would otherwise be a silent, total access failure.
const mid = membershipId;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

// Fresh data every test so writes in one test never leak into another.
beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, "users", ADMIN.uid), { email: ADMIN.email, isAdmin: true });
    for (const u of [T1_COUPLE, T1_FAMILY, T2_COUPLE, STRANGER]) {
      await setDoc(doc(db, "users", u.uid), { email: u.email, isAdmin: false });
    }

    for (const [tenantId, name] of [
      [T1, "Shivam & Swara"],
      [T2, "Someone & Someone"],
    ]) {
      await setDoc(doc(db, "tenants", tenantId), {
        name,
        sideA: { label: "A" },
        sideB: { label: "B" },
        weddingDate: null,
        archived: false,
        createdBy: ADMIN.uid,
      });
      await setDoc(doc(db, "tenants", tenantId, "categories", "decor"), {
        name: "Decor",
        colour: "#f00",
        order: 1,
      });
      await setDoc(doc(db, "tenants", tenantId, "events", "sangeet"), {
        name: "Sangeet",
        order: 1,
        colour: "#0f0",
      });
      await setDoc(doc(db, "tenants", tenantId, "settings", "currency"), {
        rates: { USD: 0.012 },
      });
      await setDoc(doc(db, "tenants", tenantId, "budgets", budgetTotalsId("a")), {
        side: "a",
        totalBudgetPaise: 200000000, // ₹20L
      });
      await setDoc(doc(db, "tenants", tenantId, "budgets", budgetAllocationId("a", "decor")), {
        side: "a",
        categoryId: "decor",
        allocatedPaise: 30000000, // ₹3L
        notes: "",
      });
    }

    const membership = (tenantId: string, email: string, role: string, side: string) =>
      setDoc(doc(db, "memberships", mid(tenantId, email)), {
        tenantId,
        email,
        role,
        side,
        displayName: null,
        invitedBy: ADMIN.uid,
        uid: null,
        lastSeenAt: null,
      });

    await membership(T1, T1_COUPLE.email, "couple", "a");
    await membership(T1, T1_FAMILY.email, "family", "a");
    await membership(T1, INVITEE.email, "family", "b");
    await membership(T2, T2_COUPLE.email, "couple", "a");
  });
});

function authed(user: { uid: string; email: string }) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

// ---------------------------------------------------------------------------

describe("tenant isolation — a member of one wedding cannot reach another", () => {
  it("T1's couple cannot read T2's tenant doc, categories, events or settings", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(getDoc(doc(db, "tenants", T2)));
    await assertFails(getDoc(doc(db, "tenants", T2, "categories", "decor")));
    await assertFails(getDoc(doc(db, "tenants", T2, "events", "sangeet")));
    await assertFails(getDoc(doc(db, "tenants", T2, "settings", "currency")));
  });

  it("T1's couple cannot WRITE into T2", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "tenants", T2, "categories", "food"), {
        name: "Food",
        colour: "#00f",
        order: 2,
      }),
    );
    await assertFails(updateDoc(doc(db, "tenants", T2), { name: "hijacked" }));
  });

  it("T1's couple cannot read T2's memberships", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(getDoc(doc(db, "memberships", mid(T2, T2_COUPLE.email))));
    await assertFails(
      getDocs(query(collection(db, "memberships"), where("tenantId", "==", T2))),
    );
  });

  it("T1's couple cannot invite anyone into T2", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "memberships", mid(T2, "gatecrash@example.com")), {
        tenantId: T2,
        email: "gatecrash@example.com",
        role: "couple",
        side: "a",
        invitedBy: T1_COUPLE.uid,
      }),
    );
  });

  it("T1's couple cannot grant THEMSELVES a membership in T2", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "memberships", mid(T2, T1_COUPLE.email)), {
        tenantId: T2,
        email: T1_COUPLE.email,
        role: "couple",
        side: "a",
        invitedBy: T1_COUPLE.uid,
      }),
    );
  });
});

describe("non-invited / unauthenticated — the security boundary", () => {
  it("unauthenticated cannot read anything", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "tenants", T1)));
    await assertFails(getDoc(doc(db, "tenants", T1, "categories", "decor")));
    await assertFails(getDoc(doc(db, "users", T1_COUPLE.uid)));
    await assertFails(getDoc(doc(db, "memberships", mid(T1, T1_COUPLE.email))));
  });

  it("a signed-in stranger with no membership cannot read real data", async () => {
    const db = authed(STRANGER);
    await assertFails(getDoc(doc(db, "tenants", T1)));
    await assertFails(getDoc(doc(db, "tenants", T1, "categories", "decor")));
    await assertFails(getDoc(doc(db, "tenants", T1, "events", "sangeet")));
    await assertFails(getDoc(doc(db, "tenants", T1, "settings", "currency")));
    await assertFails(getDoc(doc(db, "users", T1_COUPLE.uid)));
  });

  it("a stranger cannot fabricate their own membership", async () => {
    const db = authed(STRANGER);
    await assertFails(
      setDoc(doc(db, "memberships", mid(T1, STRANGER.email)), {
        tenantId: T1,
        email: STRANGER.email,
        role: "family",
        side: "a",
        invitedBy: STRANGER.uid,
      }),
    );
  });

  it("a stranger cannot create a tenant of their own", async () => {
    const db = authed(STRANGER);
    await assertFails(
      setDoc(doc(db, "tenants", "stranger-wedding"), {
        name: "Mine",
        sideA: { label: "A" },
        sideB: { label: "B" },
        createdBy: STRANGER.uid,
      }),
    );
  });

  it("nobody can list the whole memberships collection unfiltered", async () => {
    // Would leak every invitee's email across every wedding.
    await assertFails(getDocs(collection(authed(T1_FAMILY), "memberships")));
    await assertFails(getDocs(collection(authed(STRANGER), "memberships")));
  });
});

describe("sign-in discovery", () => {
  it("anyone signed in may query THEIR OWN memberships by email", async () => {
    const db = authed(INVITEE); // invited, but has never signed in before
    await assertSucceeds(
      getDocs(query(collection(db, "memberships"), where("email", "==", INVITEE.email))),
    );
  });

  it("a stranger's own-email query simply returns nothing (it is not denied)", async () => {
    const db = authed(STRANGER);
    await assertSucceeds(
      getDocs(query(collection(db, "memberships"), where("email", "==", STRANGER.email))),
    );
  });

  it("querying SOMEONE ELSE'S memberships by email is denied", async () => {
    const db = authed(STRANGER);
    await assertFails(
      getDocs(query(collection(db, "memberships"), where("email", "==", T1_COUPLE.email))),
    );
  });

  it("a member may stamp uid/lastSeenAt on their own membership", async () => {
    const db = authed(INVITEE);
    await assertSucceeds(
      updateDoc(doc(db, "memberships", mid(T1, INVITEE.email)), {
        uid: INVITEE.uid,
        lastSeenAt: new Date(),
      }),
    );
  });
});

describe("within a tenant: members read and write, couple invites", () => {
  it("a family member reads their own tenant's config and the member list", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(getDoc(doc(db, "tenants", T1)));
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "categories", "decor")));
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "events", "sangeet")));
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "settings", "currency")));
    await assertSucceeds(
      getDocs(query(collection(db, "memberships"), where("tenantId", "==", T1))),
    );
  });

  it("a family member writes config and the wedding's own details", async () => {
    // Family are parents and in-laws. Categories and events are the vocabulary
    // the whole family plans in — gating them to the couple is how the setup
    // screen goes stale.
    const db = authed(T1_FAMILY);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "categories", "food"), {
        name: "Food",
        colour: "#00f",
        order: 2,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "events", "mehendi"), {
        name: "Mehendi",
        order: 2,
        colour: "#ff0",
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "settings", "currency"), { rates: { USD: 0.9 } }),
    );
    await assertSucceeds(updateDoc(doc(db, "tenants", T1), { name: "Renamed by family" }));
  });

  it("a family member cannot invite anyone — the ONE thing role still gates", async () => {
    // This is also the privilege-escalation boundary (see the dedicated block
    // further down). If this ever flips to assertSucceeds, the memberships rules
    // were loosened by mistake.
    const db = authed(T1_FAMILY);
    await assertFails(
      setDoc(doc(db, "memberships", mid(T1, "new@example.com")), {
        tenantId: T1,
        email: "new@example.com",
        role: "family",
        side: "a",
        invitedBy: T1_FAMILY.uid,
      }),
    );
    await assertFails(deleteDoc(doc(db, "memberships", mid(T1, T1_COUPLE.email))));
  });

  it("the couple can write config and invite into their own tenant", async () => {
    const db = authed(T1_COUPLE);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "categories", "food"), {
        name: "Food",
        colour: "#00f",
        order: 2,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "events", "mehendi"), {
        name: "Mehendi",
        order: 2,
        colour: "#ff0",
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "settings", "currency"), { rates: { USD: 0.9 } }),
    );
    await assertSucceeds(
      setDoc(doc(db, "memberships", mid(T1, "new@example.com")), {
        tenantId: T1,
        email: "new@example.com",
        role: "family",
        side: "b",
        invitedBy: T1_COUPLE.uid,
      }),
    );
    await assertSucceeds(updateDoc(doc(db, "tenants", T1), { name: "Shivam & Swara 💍" }));
  });

  it("the couple cannot create a tenant (admin-only)", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "tenants", "brand-new"), {
        name: "New",
        sideA: { label: "A" },
        sideB: { label: "B" },
        createdBy: T1_COUPLE.uid,
      }),
    );
  });

  it("a membership document id must agree with its tenantId and email fields", async () => {
    // Otherwise the id-based membership lookup in the rules could be pointed at
    // a tenant the document doesn't actually belong to.
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "memberships", mid(T1, "mismatch@example.com")), {
        tenantId: T1,
        email: "someone.else@example.com",
        role: "family",
        side: "a",
        invitedBy: T1_COUPLE.uid,
      }),
    );
  });
});

describe("budgets — every member reads and writes; integrity is the guard", () => {
  const alloc = (categoryId: string, side = "a", allocatedPaise = 50000000) => ({
    side,
    categoryId,
    eventId: null,
    allocatedPaise,
    notes: "",
  });

  it("a family member reads both allocations and totals", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(
      getDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor"))),
    );
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "budgets", budgetTotalsId("a"))));
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "budgets")));
  });

  it("a family member sets a budget and an allocation", async () => {
    // Each side's parents are the people actually setting that side's numbers.
    const db = authed(T1_FAMILY);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "food")), alloc("food")),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "budgets", budgetTotalsId("b")), {
        side: "b",
        totalBudgetPaise: 300000000,
      }),
    );
    await assertSucceeds(
      deleteDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor"))),
    );
  });

  it("accepts a per-event breakdown at {side}_{categoryId}__{eventId}", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor", "sangeet")), {
        ...alloc("decor"),
        eventId: "sangeet",
        allocatedPaise: 5000000,
      }),
    );
  });

  it("rejects an event allocation whose id omits the event", async () => {
    // Otherwise `a_decor` could carry `eventId: "sangeet"` and be read as the
    // category's own ceiling — the exact double-count the model rules out.
    const db = authed(T1_FAMILY);
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor")), {
        ...alloc("decor"),
        eventId: "sangeet",
      }),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor", "sangeet")), {
        ...alloc("decor"),
        eventId: null, // id says sangeet, fields say category-level
      }),
    );
  });

  it("a family member's malformed allocation is still rejected", async () => {
    // Loosening the role check must not loosen the integrity check — that is
    // now the only thing standing between a typo and a wrong allocation total.
    const db = authed(T1_FAMILY);
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "food")), {
        ...alloc("food"),
        side: "b", // id says "a"
      }),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "food")), {
        ...alloc("food"),
        allocatedPaise: 1234.5, // rupees, not integer paise
      }),
    );
  });

  it("the couple sets totals and allocations for BOTH sides", async () => {
    // Not just their own: the two sides plan together, and FEATURES.md §0 puts
    // everything in the open.
    const db = authed(T1_COUPLE);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "budgets", budgetTotalsId("b")), {
        side: "b",
        totalBudgetPaise: 300000000,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("b", "food")), alloc("food", "b")),
    );
    await assertSucceeds(
      deleteDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor"))),
    );
  });

  it("a document id that disagrees with its own fields is rejected", async () => {
    // Otherwise `b_venue` could hold `side: "a"` and be summed into the wrong
    // side's allocation health — wrong numbers, no error anywhere.
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "venue")), alloc("venue", "b")),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", "a_venue"), alloc("something-else")),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetTotalsId("a")), {
        side: "b",
        totalBudgetPaise: 100,
      }),
    );
    await assertFails(setDoc(doc(db, "tenants", T1, "budgets", "nonsense"), alloc("venue")));
  });

  it("money must be a non-negative integer — no floats, no negatives", async () => {
    const db = authed(T1_COUPLE);
    // A float here means someone wrote rupees where paise were expected.
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "venue")), {
        ...alloc("venue"),
        allocatedPaise: 1234.56,
      }),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "venue")), {
        ...alloc("venue"),
        allocatedPaise: -1,
      }),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "venue")), {
        ...alloc("venue"),
        allocatedPaise: "3 lakh",
      }),
    );
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", budgetTotalsId("a")), {
        side: "a",
        totalBudgetPaise: 200000.5,
      }),
    );
  });

  it("only sides 'a' and 'b' exist", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      setDoc(doc(db, "tenants", T1, "budgets", "shivam_venue"), alloc("venue", "shivam")),
    );
  });

  it("T1's couple cannot read or write T2's budgets", async () => {
    const db = authed(T1_COUPLE);
    await assertFails(
      getDoc(doc(db, "tenants", T2, "budgets", budgetAllocationId("a", "decor"))),
    );
    await assertFails(getDocs(collection(db, "tenants", T2, "budgets")));
    await assertFails(
      setDoc(doc(db, "tenants", T2, "budgets", budgetTotalsId("a")), {
        side: "a",
        totalBudgetPaise: 1,
      }),
    );
  });

  it("a stranger cannot read budgets at all", async () => {
    const db = authed(STRANGER);
    await assertFails(
      getDoc(doc(db, "tenants", T1, "budgets", budgetAllocationId("a", "decor"))),
    );
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), "tenants", T1, "budgets", budgetTotalsId("a"))),
    );
  });

  it("an admin writes budgets in a wedding they are not a member of", async () => {
    const db = authed(ADMIN);
    await assertSucceeds(
      setDoc(doc(db, "tenants", T2, "budgets", budgetAllocationId("b", "decor")), alloc("decor", "b")),
    );
  });
});

describe("contacts & questions — collaborative, so every member writes", () => {
  const contact = { name: "Taj Palace", organisation: "Taj", type: "vendor", phone: "9876543210" };
  const question = { text: "Is there a DJ curfew?", askWho: "Venue manager", status: "open" };

  it("a family member — not just the couple — can add and edit both", async () => {
    // The contrast with `categories` and `budgets` above is the point: config
    // and money are couple-only, planning notes are everybody's.
    const db = authed(T1_FAMILY);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "contacts", "c1"), contact));
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "questions", "q1"), question));
    await assertSucceeds(updateDoc(doc(db, "tenants", T1, "contacts", "c1"), { isBooked: true }));
    await assertSucceeds(updateDoc(doc(db, "tenants", T1, "questions", "q1"), { status: "asked" }));
    await assertSucceeds(deleteDoc(doc(db, "tenants", T1, "contacts", "c1")));
  });

  it("members read each other's contacts and questions", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tenants", T1, "contacts", "c1"), contact);
      await setDoc(doc(ctx.firestore(), "tenants", T1, "questions", "q1"), question);
    });
    const db = authed(T1_FAMILY);
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "contacts", "c1")));
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "questions")));
  });

  it("a member of the OTHER wedding is denied both", async () => {
    const db = authed(T2_COUPLE);
    await assertFails(getDocs(collection(db, "tenants", T1, "contacts")));
    await assertFails(getDocs(collection(db, "tenants", T1, "questions")));
    await assertFails(setDoc(doc(db, "tenants", T1, "contacts", "c2"), contact));
    await assertFails(setDoc(doc(db, "tenants", T1, "questions", "q2"), question));
  });

  it("a stranger and an unauthenticated caller are denied both", async () => {
    for (const db of [authed(STRANGER), testEnv.unauthenticatedContext().firestore()]) {
      await assertFails(getDocs(collection(db, "tenants", T1, "contacts")));
      await assertFails(getDocs(collection(db, "tenants", T1, "questions")));
      await assertFails(setDoc(doc(db, "tenants", T1, "contacts", "c3"), contact));
    }
  });

  it("an invitee who has never signed in still counts as a member", async () => {
    // Membership is keyed by email, not uid — that is what makes an invitation
    // work before the person's first sign-in.
    const db = authed(INVITEE);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "questions", "q9"), question));
  });
});

describe("comparisons — including the options subcollection", () => {
  const comparison = { name: "Wedding venues", criteria: [], categoryId: null };
  const option = { name: "Taj Palace", values: {}, status: "considering" };

  it("a family member can create a comparison and its options", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "comparisons", "venues"), comparison));
    await assertSucceeds(
      setDoc(doc(db, "tenants", T1, "comparisons", "venues", "options", "taj"), option),
    );
    await assertSucceeds(
      updateDoc(doc(db, "tenants", T1, "comparisons", "venues", "options", "taj"), {
        status: "shortlisted",
      }),
    );
    await assertSucceeds(
      deleteDoc(doc(db, "tenants", T1, "comparisons", "venues", "options", "taj")),
    );
  });

  it("options are readable — a parent rule does NOT cascade to a subcollection", async () => {
    // Without its own match block the options would be invisible under
    // default-deny, with the comparison itself loading fine. That failure looks
    // like "the table is empty", not like a permissions problem.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tenants", T1, "comparisons", "venues"), comparison);
      await setDoc(
        doc(ctx.firestore(), "tenants", T1, "comparisons", "venues", "options", "taj"),
        option,
      );
    });
    const db = authed(T1_FAMILY);
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "comparisons", "venues")));
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "comparisons", "venues", "options")));
  });

  it("the other wedding's member is denied the comparison AND its options", async () => {
    const db = authed(T2_COUPLE);
    await assertFails(getDocs(collection(db, "tenants", T1, "comparisons")));
    await assertFails(getDocs(collection(db, "tenants", T1, "comparisons", "venues", "options")));
    await assertFails(
      setDoc(doc(db, "tenants", T1, "comparisons", "venues", "options", "sneak"), option),
    );
  });

  it("a stranger is denied both levels", async () => {
    const db = authed(STRANGER);
    await assertFails(getDocs(collection(db, "tenants", T1, "comparisons")));
    await assertFails(getDocs(collection(db, "tenants", T1, "comparisons", "venues", "options")));
  });
});

describe("guest list — households, guests and the derived totals", () => {
  const household = {
    name: "The Agarwals",
    side: "a",
    tier: "must",
    status: "proposed",
    invitedBy: T1_FAMILY.uid,
    eventIds: ["sangeet"],
    adultCount: 2,
    childCount: 2,
  };
  const guest = { householdId: "hh1", name: "Rohit Agarwal", ageGroup: "adult", dietary: "" };
  const totals = { overall: { households: 1, people: 4 }, roomsNeeded: 0 };

  it("a family member — not just the couple — adds, edits and removes households", async () => {
    // The premise of the whole feature: four people contribute names
    // independently (FEATURES.md §4).
    const db = authed(T1_FAMILY);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "households", "hh1"), household));
    await assertSucceeds(updateDoc(doc(db, "tenants", T1, "households", "hh1"), { tier: "should" }));
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "guests", "g1"), guest));
    await assertSucceeds(updateDoc(doc(db, "tenants", T1, "guests", "g1"), { dietary: "veg" }));
    await assertSucceeds(deleteDoc(doc(db, "tenants", T1, "guests", "g1")));
    await assertSucceeds(deleteDoc(doc(db, "tenants", T1, "households", "hh1")));
  });

  it("any member writes the derived totals, and the target setting", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "aggregates", "guestTotals"), totals));
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "settings", "guestTarget"), {
      targetHeads: 400,
    }));
  });

  it("members read each other's households, guests and totals", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tenants", T1, "households", "hh1"), household);
      await setDoc(doc(ctx.firestore(), "tenants", T1, "guests", "g1"), guest);
      await setDoc(doc(ctx.firestore(), "tenants", T1, "aggregates", "guestTotals"), totals);
    });
    const db = authed(T1_COUPLE);
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "households")));
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "guests")));
    await assertSucceeds(getDoc(doc(db, "tenants", T1, "aggregates", "guestTotals")));
  });

  it("a member of the OTHER wedding is denied every part of it", async () => {
    const db = authed(T2_COUPLE);
    await assertFails(getDocs(collection(db, "tenants", T1, "households")));
    await assertFails(getDocs(collection(db, "tenants", T1, "guests")));
    await assertFails(getDoc(doc(db, "tenants", T1, "aggregates", "guestTotals")));
    await assertFails(getDocs(collection(db, "tenants", T1, "guestLog")));
    await assertFails(setDoc(doc(db, "tenants", T1, "households", "sneak"), household));
    await assertFails(setDoc(doc(db, "tenants", T1, "guests", "sneak"), guest));
    await assertFails(setDoc(doc(db, "tenants", T1, "aggregates", "guestTotals"), totals));
  });

  it("a stranger and an unauthenticated caller are denied", async () => {
    for (const db of [authed(STRANGER), testEnv.unauthenticatedContext().firestore()]) {
      await assertFails(getDocs(collection(db, "tenants", T1, "households")));
      await assertFails(getDocs(collection(db, "tenants", T1, "guests")));
      await assertFails(setDoc(doc(db, "tenants", T1, "households", "hh9"), household));
    }
  });

  it("an invitee who has never signed in can still add their side's households", async () => {
    const db = authed(INVITEE);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "households", "hh2"), household));
  });
});

describe("guestLog is append-only — that is the whole point of it", () => {
  const entry = (uid: string) => ({
    action: "removed",
    householdName: "The Agarwals",
    householdId: null,
    people: 4,
    by: uid,
    byName: "Mom",
  });

  it("any member files an entry and everyone can read the log", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(setDoc(doc(db, "tenants", T1, "guestLog", "e1"), entry(T1_FAMILY.uid)));
    await assertSucceeds(getDocs(collection(db, "tenants", T1, "guestLog")));
  });

  it("nobody can edit or delete an entry — not the couple, not the admin", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "tenants", T1, "guestLog", "e1"), entry(T1_FAMILY.uid));
    });
    for (const db of [authed(T1_FAMILY), authed(T1_COUPLE), authed(ADMIN)]) {
      await assertFails(updateDoc(doc(db, "tenants", T1, "guestLog", "e1"), { byName: "Someone" }));
      await assertFails(deleteDoc(doc(db, "tenants", T1, "guestLog", "e1")));
    }
  });

  it("an entry cannot be filed under somebody else's name", async () => {
    const db = authed(T1_FAMILY);
    await assertFails(setDoc(doc(db, "tenants", T1, "guestLog", "e2"), entry(T1_COUPLE.uid)));
  });
});

describe("privilege escalation is closed", () => {
  it("a family member cannot promote themselves to couple", async () => {
    const db = authed(T1_FAMILY);
    await assertFails(
      updateDoc(doc(db, "memberships", mid(T1, T1_FAMILY.email)), { role: "couple" }),
    );
  });

  it("a family member cannot change their own side", async () => {
    const db = authed(T1_FAMILY);
    await assertFails(
      updateDoc(doc(db, "memberships", mid(T1, T1_FAMILY.email)), { side: "b" }),
    );
  });

  it("a member cannot delete their way out of an invitation they dislike", async () => {
    const db = authed(T1_FAMILY);
    await assertFails(
      updateDoc(doc(db, "memberships", mid(T1, T1_COUPLE.email)), { role: "family" }),
    );
  });

  it("nobody can make themselves a global admin", async () => {
    await assertFails(updateDoc(doc(authed(T1_COUPLE), "users", T1_COUPLE.uid), { isAdmin: true }));
    await assertFails(updateDoc(doc(authed(T1_FAMILY), "users", T1_FAMILY.uid), { isAdmin: true }));
  });

  it("a new user doc cannot be created pre-set as admin", async () => {
    const db = authed(INVITEE);
    await assertFails(
      setDoc(doc(db, "users", INVITEE.uid), { email: INVITEE.email, isAdmin: true }),
    );
    await assertSucceeds(
      setDoc(doc(db, "users", INVITEE.uid), { email: INVITEE.email, isAdmin: false }),
    );
  });

  it("a member cannot write another user's profile", async () => {
    const db = authed(T1_FAMILY);
    await assertFails(updateDoc(doc(db, "users", T1_COUPLE.uid), { displayName: "hacked" }));
  });

  it("a member can still update their own profile fields", async () => {
    const db = authed(T1_FAMILY);
    await assertSucceeds(updateDoc(doc(db, "users", T1_FAMILY.uid), { displayName: "Mom" }));
  });

  it("an admin's own sign-in upsert does not trip the frozen-isAdmin rule", async () => {
    // AuthProvider merge-writes the profile on every sign-in WITHOUT isAdmin in
    // the payload. If the rule read that as "isAdmin removed", the only admin
    // would be locked out of the whole app on their next sign-in.
    const db = authed(ADMIN);
    await assertSucceeds(
      setDoc(
        doc(db, "users", ADMIN.uid),
        { email: ADMIN.email, displayName: "Shivam", photoURL: null },
        { merge: true },
      ),
    );
    // ...and it is still true afterwards.
    const after = await getDoc(doc(db, "users", ADMIN.uid));
    expect(after.data()?.isAdmin).toBe(true);
  });

  it("an admin cannot strip or grant isAdmin through the client, even their own", async () => {
    const db = authed(ADMIN);
    await assertFails(updateDoc(doc(db, "users", ADMIN.uid), { isAdmin: false }));
    await assertFails(updateDoc(doc(db, "users", T1_FAMILY.uid), { isAdmin: true }));
  });
});

describe("the global admin reaches every tenant", () => {
  it("admin reads and writes both weddings", async () => {
    const db = authed(ADMIN);
    await assertSucceeds(getDoc(doc(db, "tenants", T1)));
    await assertSucceeds(getDoc(doc(db, "tenants", T2)));
    await assertSucceeds(getDoc(doc(db, "tenants", T2, "categories", "decor")));
    await assertSucceeds(
      setDoc(doc(db, "tenants", T2, "categories", "food"), {
        name: "Food",
        colour: "#00f",
        order: 2,
      }),
    );
  });

  it("admin can list all tenants; a member cannot", async () => {
    await assertSucceeds(getDocs(collection(authed(ADMIN), "tenants")));
    await assertFails(getDocs(collection(authed(T1_COUPLE), "tenants")));
  });

  it("admin can create a tenant and invite into any tenant", async () => {
    const db = authed(ADMIN);
    await assertSucceeds(
      setDoc(doc(db, "tenants", "third-wedding"), {
        name: "Third",
        sideA: { label: "A" },
        sideB: { label: "B" },
        weddingDate: null,
        archived: false,
        createdBy: ADMIN.uid,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, "memberships", mid(T2, "guest@example.com")), {
        tenantId: T2,
        email: "guest@example.com",
        role: "family",
        side: "a",
        invitedBy: ADMIN.uid,
      }),
    );
  });

  it("admin cannot forge createdBy when creating a tenant", async () => {
    const db = authed(ADMIN);
    await assertFails(
      setDoc(doc(db, "tenants", "forged"), {
        name: "Forged",
        sideA: { label: "A" },
        sideB: { label: "B" },
        createdBy: T1_COUPLE.uid,
      }),
    );
  });
});
