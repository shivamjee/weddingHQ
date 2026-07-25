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

        const common = {
          email,
          displayName: fbUser.displayName ?? email,
          photoURL: fbUser.photoURL ?? null,
          lastSeenAt: serverTimestamp(),
        };
        if (existing.exists()) {
          // role/side are set once at creation and locked by firestore.rules —
          // never rewrite them, or a returning user's update would be denied.
          await setDoc(userRef, common, { merge: true });
        } else {
          // On first sign-in, side + role come from the allowlist entry, never
          // from the user. The rules verify these match the allowlist on create.
          await setDoc(userRef, {
            ...common,
            role: entry.role,
            side: entry.side,
            createdAt: serverTimestamp(),
          });
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
    // Full-page redirect, NOT a popup. Popups fail on our production setup because
    // the app (…vercel.app) and Firebase's auth handler (…firebaseapp.com) are
    // different origins, so the browser blocks the popup from returning the result
    // — the popup just flashes and closes. Redirect also works in installed PWAs,
    // where popups don't work at all. Completion is handled by getRedirectResult +
    // onAuthStateChanged after the page navigates back.
    await signInWithRedirect(auth, googleProvider);
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
