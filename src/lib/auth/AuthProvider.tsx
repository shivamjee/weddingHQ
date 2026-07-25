"use client";

// Auth + allowlist gate (PHASE1 Step 4 / FEATURES.md §1.1).
//
// Flow on sign-in:
//   Google sign-in → read allowlist/{email.toLowerCase()}
//     • exists  → create/update users/{uid} (side+role copied from the allowlist
//                 entry, never chosen by the user) → into the app.
//     • missing → sign out immediately and show the "not invited" screen.
//
// SECURITY: this is UX only. The real boundary is firestore.rules (Step 5).
// role/side are written from the allowlist entry here so the write satisfies the
// rule that a user may not self-assign their own role/side.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import type { AllowlistEntry, User } from "@/types";

interface AuthContextValue {
  /** The raw Firebase auth user, or null when signed out. */
  user: FirebaseUser | null;
  /** The app profile from users/{uid}, or null until confirmed allowlisted. */
  profile: User | null;
  /** True while auth state / allowlist check is still resolving. */
  loading: boolean;
  /** True when a signed-in Google account is NOT on the allowlist. */
  notInvited: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Errors where a popup can't work and we should fall back to full-page redirect
 *  (notably iOS Safari / installed PWAs, and popup blockers). */
const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notInvited, setNotInvited] = useState(false);

  // Guards against a stale async allowlist check resolving after a newer one.
  const checkSeq = useRef(0);

  useEffect(() => {
    // Complete any redirect-based sign-in and surface its errors. The user it
    // returns is also delivered via onAuthStateChanged below, so we ignore it here.
    getRedirectResult(auth).catch((err) => {
      console.error("[auth] redirect sign-in failed:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const seq = ++checkSeq.current;
      setUser(fbUser);

      if (!fbUser || !fbUser.email) {
        setProfile(null);
        setNotInvited(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const email = fbUser.email.toLowerCase();
        const allowSnap = await getDoc(doc(db, "allowlist", email));

        if (seq !== checkSeq.current) return; // superseded by a newer auth change

        if (!allowSnap.exists()) {
          // Not on the allowlist → sign out and show the distinct screen.
          await signOut(auth);
          if (seq !== checkSeq.current) return;
          setProfile(null);
          setNotInvited(true);
          setLoading(false);
          return;
        }

        const entry = allowSnap.data() as AllowlistEntry;
        const userRef = doc(db, "users", fbUser.uid);
        const existing = await getDoc(userRef);
        if (seq !== checkSeq.current) return;

        // side + role always come from the allowlist entry, never from the user.
        const base = {
          email,
          displayName: fbUser.displayName ?? email,
          photoURL: fbUser.photoURL ?? null,
          role: entry.role,
          side: entry.side,
          lastSeenAt: serverTimestamp(),
        };
        if (existing.exists()) {
          await setDoc(userRef, base, { merge: true });
        } else {
          await setDoc(userRef, { ...base, createdAt: serverTimestamp() });
        }
        if (seq !== checkSeq.current) return;

        const fresh = await getDoc(userRef);
        if (seq !== checkSeq.current) return;
        setProfile(fresh.data() as User);
        setNotInvited(false);
      } catch (err) {
        // Until Step 5 rules are deployed + the bootstrap allowlist doc exists,
        // these reads are permission-denied — treated as "not invited" for now.
        console.error("[auth] allowlist/profile check failed:", err);
        await signOut(auth).catch(() => {});
        if (seq !== checkSeq.current) return;
        setProfile(null);
        setNotInvited(true);
      } finally {
        if (seq === checkSeq.current) setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setNotInvited(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (POPUP_FALLBACK_CODES.has(code)) {
        // iOS Safari / PWA / blocked popup → full-page redirect instead.
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      console.error("[auth] Google sign-in failed:", err);
      throw err;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setNotInvited(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, notInvited, signInWithGoogle, signOutUser }),
    [user, profile, loading, notInvited, signInWithGoogle, signOutUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
