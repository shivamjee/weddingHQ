"use client";

// Global identity. Deliberately knows nothing about weddings.
//
// Sign-in here proves *who you are*, not *what you may see*. Which weddings you
// belong to comes from MembershipsProvider, and what you may do inside one comes
// from TenantProvider. Splitting them is what lets one account belong to several
// weddings with a different role in each.
//
// SECURITY: this is UX only. The real boundary is firestore.rules. In particular
// `isAdmin` is never written from here — the rules freeze it and it is set by
// hand in the Firestore console (see CLAUDE.md).

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
import { getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, googleProvider } from "@/lib/firebase";
import { userDoc } from "@/lib/paths";
import type { User } from "@/types";

interface AuthContextValue {
  /** The raw Firebase auth user, or null when signed out. */
  user: FirebaseUser | null;
  /** The global profile from users/{uid}, or null when signed out. */
  profile: User | null;
  /** True while auth state / profile upsert is still resolving. */
  loading: boolean;
  /** Global admin — reaches every tenant. Comes from users/{uid}.isAdmin. */
  isAdmin: boolean;
  /** Last sign-in error code/message (e.g. from the redirect return leg), for display. */
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Errors where a popup can't work and we should fall back to full-page redirect
 *  (iOS Safari, installed PWAs, popup blockers). */
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
  const [authError, setAuthError] = useState<string | null>(null);

  // Guards against a stale async profile upsert resolving after a newer one.
  const seqRef = useRef(0);

  useEffect(() => {
    // Complete any redirect-based sign-in and surface its errors. The user it
    // returns is also delivered via onAuthStateChanged below, so we ignore it here.
    getRedirectResult(auth).catch((err: unknown) => {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message;
      console.error("[auth] redirect sign-in failed:", err);
      setAuthError(code ?? message ?? "redirect-failed");
    });

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      const seq = ++seqRef.current;
      setUser(fbUser);

      if (!fbUser || !fbUser.email) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const email = fbUser.email.toLowerCase();
        const ref = userDoc(fbUser.uid);
        const existing = await getDoc(ref);
        if (seq !== seqRef.current) return; // superseded by a newer auth change

        const common = {
          email,
          displayName: fbUser.displayName ?? email,
          photoURL: fbUser.photoURL ?? null,
          lastSeenAt: serverTimestamp(),
        };

        // READ COST: one read + one write per sign-in. We build the profile from
        // what we already hold rather than reading the document back a third time.
        if (existing.exists()) {
          // `isAdmin` is intentionally absent from the payload — the rules require
          // it to be unchanged, and a merge write leaves the stored value alone.
          await setDoc(ref, common, { merge: true });
        } else {
          await setDoc(ref, { ...common, isAdmin: false, createdAt: serverTimestamp() });
        }
        if (seq !== seqRef.current) return;

        const prior = existing.data() as Partial<User> | undefined;
        setProfile({
          ...common,
          isAdmin: prior?.isAdmin === true,
          createdAt: prior?.createdAt,
        } as User);
      } catch (err) {
        // A failure here is a config/rules problem, not an access decision —
        // access is decided by memberships. Surface it rather than silently
        // presenting the user as signed out.
        console.error("[auth] profile upsert failed:", err);
        if (seq !== seqRef.current) return;
        setProfile(null);
        setAuthError((err as { code?: string }).code ?? "profile-upsert-failed");
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      // Popup first — a same-origin authDomain (see firebase.ts + next.config.ts)
      // means the popup's postMessage handshake works. Fall back to full-page
      // redirect for iOS Safari / installed PWAs / blocked popups.
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (POPUP_FALLBACK_CODES.has(code)) {
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.isAdmin === true,
      authError,
      signInWithGoogle,
      signOutUser,
    }),
    [user, profile, loading, authError, signInWithGoogle, signOutUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
