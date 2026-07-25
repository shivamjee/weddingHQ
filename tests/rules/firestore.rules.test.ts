import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// Emulator-backed proof that firestore.rules keeps non-invited accounts out.
// Run via `npm run test:rules` (starts the Firestore emulator around Vitest).
//
// This is Definition-of-Done #6: a non-allowlisted account cannot read any data
// even via direct SDK calls — verified against the rules, not the UI.

const PROJECT_ID = "weddinghq-rules-test";

// Identities used across tests.
const COUPLE = { uid: "uid_couple", email: "shivamjee@rocketmail.com" };
const FAMILY = { uid: "uid_family", email: "mom@example.com" };
const NEWFAMILY = { uid: "uid_newfam", email: "dad@example.com" }; // allowlisted, no user doc yet
const STRANGER = { uid: "uid_stranger", email: "stranger@example.com" }; // not invited

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
    await setDoc(doc(db, "allowlist", COUPLE.email), { side: "shivam", role: "couple" });
    await setDoc(doc(db, "allowlist", FAMILY.email), { side: "shivam", role: "family" });
    await setDoc(doc(db, "allowlist", NEWFAMILY.email), { side: "swara", role: "family" });
    await setDoc(doc(db, "users", COUPLE.uid), {
      email: COUPLE.email,
      role: "couple",
      side: "shivam",
    });
    await setDoc(doc(db, "users", FAMILY.uid), {
      email: FAMILY.email,
      role: "family",
      side: "shivam",
    });
    await setDoc(doc(db, "categories", "decor"), { name: "Decor", colour: "#f00", order: 1 });
    await setDoc(doc(db, "events", "sangeet"), { name: "Sangeet", order: 1, colour: "#0f0" });
    await setDoc(doc(db, "settings", "currency"), { rates: { USD: 0.012 } });
  });
});

function authed(user: { uid: string; email: string }) {
  return testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
}

describe("non-invited / unauthenticated — the security boundary (DoD #6)", () => {
  it("unauthenticated cannot read any collection", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "users", COUPLE.uid)));
    await assertFails(getDoc(doc(db, "categories", "decor")));
    await assertFails(getDoc(doc(db, "events", "sangeet")));
    await assertFails(getDoc(doc(db, "settings", "currency")));
    await assertFails(getDoc(doc(db, "allowlist", COUPLE.email)));
  });

  it("a signed-in non-allowlisted stranger cannot read real data", async () => {
    const db = authed(STRANGER);
    await assertFails(getDoc(doc(db, "categories", "decor")));
    await assertFails(getDoc(doc(db, "events", "sangeet")));
    await assertFails(getDoc(doc(db, "settings", "currency")));
    await assertFails(getDoc(doc(db, "users", COUPLE.uid)));
  });

  it("a stranger cannot fabricate their own membership (users doc without an allowlist entry)", async () => {
    const db = authed(STRANGER);
    await assertFails(
      setDoc(doc(db, "users", STRANGER.uid), {
        email: STRANGER.email,
        role: "family",
        side: "shivam",
      }),
    );
  });
});

describe("sign-in bootstrap", () => {
  it("a signed-in user may read only their OWN allowlist entry before membership", async () => {
    const db = authed(NEWFAMILY);
    await assertSucceeds(getDoc(doc(db, "allowlist", NEWFAMILY.email))); // own entry
    await assertFails(getDoc(doc(db, "allowlist", COUPLE.email))); // someone else's
  });

  it("an allowlisted user may create their user doc with role/side matching the allowlist", async () => {
    const db = authed(NEWFAMILY);
    await assertSucceeds(
      setDoc(doc(db, "users", NEWFAMILY.uid), {
        email: NEWFAMILY.email,
        role: "family",
        side: "swara",
      }),
    );
  });

  it("cannot self-elevate: creating a user doc with a role that differs from the allowlist fails", async () => {
    const db = authed(NEWFAMILY);
    await assertFails(
      setDoc(doc(db, "users", NEWFAMILY.uid), {
        email: NEWFAMILY.email,
        role: "couple", // allowlist says "family"
        side: "swara",
      }),
    );
  });
});

describe("members can read shared data", () => {
  it("a family member reads users, categories, events, settings, allowlist", async () => {
    const db = authed(FAMILY);
    await assertSucceeds(getDoc(doc(db, "users", COUPLE.uid)));
    await assertSucceeds(getDoc(doc(db, "categories", "decor")));
    await assertSucceeds(getDoc(doc(db, "events", "sangeet")));
    await assertSucceeds(getDoc(doc(db, "settings", "currency")));
    await assertSucceeds(getDoc(doc(db, "allowlist", COUPLE.email)));
  });
});

describe("couple-only writes to shared config", () => {
  it("a family member cannot write allowlist / categories / events / settings", async () => {
    const db = authed(FAMILY);
    await assertFails(setDoc(doc(db, "allowlist", "new@example.com"), { side: "shivam", role: "family" }));
    await assertFails(setDoc(doc(db, "categories", "food"), { name: "Food", colour: "#00f", order: 2 }));
    await assertFails(setDoc(doc(db, "events", "mehendi"), { name: "Mehendi", order: 2, colour: "#ff0" }));
    await assertFails(setDoc(doc(db, "settings", "currency"), { rates: { USD: 0.9 } }));
  });

  it("the couple can write allowlist / categories / events / settings", async () => {
    const db = authed(COUPLE);
    await assertSucceeds(setDoc(doc(db, "allowlist", "new@example.com"), { side: "shivam", role: "family" }));
    await assertSucceeds(setDoc(doc(db, "categories", "food"), { name: "Food", colour: "#00f", order: 2 }));
    await assertSucceeds(setDoc(doc(db, "events", "mehendi"), { name: "Mehendi", order: 2, colour: "#ff0" }));
    await assertSucceeds(setDoc(doc(db, "settings", "currency"), { rates: { USD: 0.9 } }));
  });
});

describe("role/side are not self-editable", () => {
  it("a member cannot change their own role or side", async () => {
    const db = authed(FAMILY);
    await assertFails(updateDoc(doc(db, "users", FAMILY.uid), { role: "couple" }));
    await assertFails(updateDoc(doc(db, "users", FAMILY.uid), { side: "swara" }));
  });

  it("a member can update their own non-privileged fields", async () => {
    const db = authed(FAMILY);
    await assertSucceeds(updateDoc(doc(db, "users", FAMILY.uid), { displayName: "Mom" }));
  });

  it("a member cannot write another user's doc", async () => {
    const db = authed(FAMILY);
    await assertFails(updateDoc(doc(db, "users", COUPLE.uid), { displayName: "hacked" }));
  });
});
