// Who is calling the AI route, and are they allowed to (PHASE2 Step 5b)?
//
// This gate protects the API QUOTA, not the data. The handler reads and writes
// nothing in Firestore — it takes text and returns a suggestion, and the client
// writes the confirmed result under the member-write rule that already exists
// on `comparisons`. But an unauthenticated endpoint is a stranger spending the
// wedding's Gemini quota, so it is closed.
//
// WHY NO firebase-admin: PHASE2 offered (a) the Admin SDK, which needs a
// service-account JSON in a Vercel env var — a genuine new secret to store,
// rotate and keep out of git — or (b) verifying the JWT against Google's public
// certs. (b) is used here, so the only secret this project has is the Gemini
// key itself.
//
// Membership is then checked through the Firestore REST API using the CALLER'S
// OWN token, so the existing security rules do the deciding. The server never
// holds a privileged credential, and the answer can never disagree with what
// the rules would say — which is the property that matters.

import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { membershipId } from "@/lib/tenantIds";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/** Google's public keys for Firebase ID tokens. createRemoteJWKSet caches them
 *  and refetches on key rotation, so this is one network round trip per cold
 *  start, not one per request. */
const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

export interface Caller {
  uid: string;
  email: string;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 500,
  ) {
    super(message);
  }
}

/**
 * Verify a Firebase ID token from an `Authorization: Bearer …` header.
 *
 * Checks signature, algorithm, issuer, audience and expiry. `issuer` and
 * `audience` are the load-bearing ones: without them a validly-signed token
 * from a DIFFERENT Firebase project would be accepted, since every project's
 * tokens are signed by the same Google keys.
 */
export async function verifyIdToken(authorization: string | null): Promise<Caller> {
  if (!PROJECT_ID) {
    throw new AuthError("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set", 500);
  }

  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
  if (!token) throw new AuthError("Missing bearer token", 401);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });

    const uid = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!uid || !email) throw new AuthError("Token has no subject or email", 401);

    return { uid, email };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(`Invalid ID token: ${String(err)}`, 401);
  }
}

/**
 * Confirm the caller is a member of `tenantId`, by asking Firestore for their
 * own membership document AS THEM.
 *
 * The rules allow anyone to read a membership naming their own email, and deny
 * everything else — so a 200 means "member", and a 403/404 means "not". The
 * check therefore cannot drift from the rules, because it IS the rules.
 *
 * READ COST: one document read per AI request. Negligible, and it only happens
 * on a deliberate button tap.
 */
export async function assertTenantMember(
  caller: Caller,
  tenantId: string,
  idToken: string,
): Promise<void> {
  const docId = encodeURIComponent(membershipId(tenantId, caller.email));
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/documents/memberships/${docId}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  } catch (err) {
    console.error("[ai] membership lookup failed:", err);
    throw new AuthError("Could not verify membership", 500);
  }

  if (response.status === 200) return;
  // 404 = no such membership; 403 = the rules refused. Both mean the same thing
  // to us, and neither is worth distinguishing to the caller.
  if (response.status === 403 || response.status === 404) {
    throw new AuthError(`${caller.email} is not a member of ${tenantId}`, 403);
  }

  console.error(`[ai] unexpected membership lookup status ${response.status}`);
  throw new AuthError("Could not verify membership", 500);
}

/** Pull the raw token back out of the header, for the membership call above. */
export function bearerToken(authorization: string | null): string {
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
