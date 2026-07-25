"use client";

// "Which weddings do I belong to?" — answered with exactly one query.
//
// memberships/{tenantId}__{email} is keyed by email, so this works for someone
// who was invited five minutes ago and has never signed in. The result drives
// the entry routing at "/" (one wedding → straight in; several → the picker)
// and the wedding switcher in the header.
//
// SECURITY: firestore.rules allows this query only because it filters on the
// caller's own email. An unfiltered read of the collection is denied.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getDocs, limit, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import { membershipsCol } from "@/lib/paths";
import type { MembershipWithId } from "@/types";

/** READ COST: bounded, per CLAUDE.md §3. Nobody in this app is in 20 weddings;
 *  the limit exists so a bug can never turn this into an unbounded scan. */
const MAX_MEMBERSHIPS = 20;

/** Pure loader — no React state, so the effect below can simply await it. */
async function fetchMemberships(
  email: string | null,
  uid: string | null,
): Promise<MembershipWithId[]> {
  if (!email || !uid) return [];

  const snap = await getDocs(
    query(membershipsCol(), where("email", "==", email), limit(MAX_MEMBERSHIPS)),
  );

  // Stamp uid + last-seen so the couple's member list can show who has actually
  // signed in. Only writes when the stamp is missing or stale, so this is not a
  // write per page load. Failures are cosmetic: the rules let a member change
  // only these two fields on their own document.
  await Promise.all(
    snap.docs
      .filter((d) => d.data().uid !== uid)
      .map((d) =>
        updateDoc(d.ref, { uid, lastSeenAt: serverTimestamp() }).catch((err) =>
          console.warn("[memberships] could not stamp uid:", err),
        ),
      ),
  );

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId);
}

interface MembershipsContextValue {
  memberships: MembershipWithId[];
  loading: boolean;
  error: string | null;
  /** Re-run the query — used after an admin creates a new wedding. */
  refresh: () => void;
}

const MembershipsContext = createContext<MembershipsContextValue | null>(null);

export function MembershipsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [memberships, setMemberships] = useState<MembershipWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const email = user?.email?.toLowerCase() ?? null;
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    void (async () => {
      try {
        const rows = await fetchMemberships(email, uid);
        if (cancelled) return;
        setMemberships(rows);
        setError(null);
      } catch (err) {
        console.error("[memberships] query failed:", err);
        if (cancelled) return;
        setMemberships([]);
        setError((err as { code?: string }).code ?? "memberships-query-failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, email, uid, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo<MembershipsContextValue>(
    () => ({ memberships, loading: authLoading || loading, error, refresh }),
    [memberships, authLoading, loading, error, refresh],
  );

  return <MembershipsContext.Provider value={value}>{children}</MembershipsContext.Provider>;
}

export function useMemberships(): MembershipsContextValue {
  const ctx = useContext(MembershipsContext);
  if (!ctx) throw new Error("useMemberships must be used within <MembershipsProvider>");
  return ctx;
}
