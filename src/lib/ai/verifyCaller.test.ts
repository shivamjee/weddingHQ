import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SignJWT, generateKeyPair } from "jose";

// PHASE2 Step 5b requires the AI route's own gate to be tested SEPARATELY from
// the Firestore rules suite: "an unauthenticated POST and a POST from a
// non-member of the named tenant both get a 401/403".
//
// That gate protects the Gemini QUOTA, not the data — the handler reads and
// writes nothing in Firestore. But an open endpoint is a stranger spending the
// wedding's free-tier allowance, so it is worth proving closed.
//
// The module reads NEXT_PUBLIC_FIREBASE_PROJECT_ID at import time, so it is set
// before the dynamic import below.

const PROJECT_ID = "weddinghq-test";

type VerifyCaller = typeof import("./verifyCaller");
let mod: VerifyCaller;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
  mod = await import("./verifyCaller");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyIdToken — an unauthenticated caller never reaches the model", () => {
  it("rejects a missing Authorization header", async () => {
    await expect(mod.verifyIdToken(null)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a header that isn't a bearer token", async () => {
    await expect(mod.verifyIdToken("Basic abc123")).rejects.toMatchObject({ status: 401 });
    await expect(mod.verifyIdToken("Bearer ")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a syntactically invalid token", async () => {
    await expect(mod.verifyIdToken("Bearer not.a.jwt")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a well-formed token signed by someone other than Google", async () => {
    // The attack this closes: a JWT with all the right claims is trivial to
    // mint. Only the signature, checked against Google's published keys, makes
    // it meaningful — so a self-signed one must fail even though it looks
    // perfect.
    const { privateKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({ email: "attacker@example.com" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
      .setAudience(PROJECT_ID)
      .setSubject("uid_attacker")
      .setExpirationTime("1h")
      .sign(privateKey);

    await expect(mod.verifyIdToken(`Bearer ${forged}`)).rejects.toMatchObject({ status: 401 });
  });
});

describe("assertTenantMember — a non-member is refused", () => {
  const caller = { uid: "uid_1", email: "someone@example.com" };

  it("404 (no such membership) is a 403 to the caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    await expect(mod.assertTenantMember(caller, "other-wedding", "token")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("403 (the rules refused the read) is also a 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 403 })),
    );
    await expect(mod.assertTenantMember(caller, "other-wedding", "token")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("a member passes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    await expect(mod.assertTenantMember(caller, "shivam-swara", "token")).resolves.toBeUndefined();
  });

  it("looks the membership up by the caller's OWN verified email", async () => {
    // The email comes from the signed token, never from the request body —
    // otherwise anyone could claim to be anyone by typing a different address.
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await mod.assertTenantMember(caller, "shivam-swara", "token");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(encodeURIComponent("shivam-swara__someone@example.com"));
    // And it asks AS the caller, so the security rules do the deciding.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("an unexpected status is a 500, not a silent pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await expect(mod.assertTenantMember(caller, "shivam-swara", "token")).rejects.toMatchObject({
      status: 500,
    });
  });
});
