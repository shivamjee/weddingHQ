// Firebase client SDK initialisation.
//
// SECURITY NOTE: the NEXT_PUBLIC_FIREBASE_* values below are *not* secrets.
// Firebase web config is public by design — it ships in the browser bundle of
// every Firebase web app. Access is NOT protected by hiding these values; it is
// protected by Firestore Security Rules (see firestore.rules, Phase 1 Step 5)
// and the Authentication allowlist. Never rely on these values being hidden.
//
// The only genuinely secret keys in this project (none yet) would be unprefixed
// server-side env vars — e.g. a future Resend or AI API key in Phase 6 — which
// must NOT carry the NEXT_PUBLIC_ prefix.

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Fail loudly in development if the config is missing, rather than throwing a
// cryptic error deep inside an auth call. In production the values are inlined
// at build time by Next.js from the Vercel dashboard env vars.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  const message =
    "Firebase config is missing. Copy .env.local.example to .env.local and fill in the " +
    "NEXT_PUBLIC_FIREBASE_* values from the Firebase console (Project settings → Your apps).";
  if (process.env.NODE_ENV !== "production") {
    console.error(`\n[firebase] ${message}\n`);
  }
}

// Guard against re-initialisation on Next.js hot reload / multiple imports.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Shared Google provider instance for sign-in (Phase 1 Step 4).
export const googleProvider = new GoogleAuthProvider();

export default app;
