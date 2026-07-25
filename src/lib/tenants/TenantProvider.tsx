"use client";

// The active wedding. Mounted by src/app/t/[tenantId]/layout.tsx, so every screen
// under /t/{tenantId}/… can ask "which wedding, which side labels, may I write?"
// without re-deriving any of it.
//
// Phase 2 screens should read `canWrite` and `sideLabel()` from here rather than
// looking at a role or hardcoding "Shivam"/"Swara" — that is what keeps the app
// correct once there is a second wedding.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMemberships } from "@/lib/tenants/MembershipsProvider";
import { tenantDoc } from "@/lib/paths";
import type { MembershipWithId, Role, Side, Tenant } from "@/types";

interface TenantContextValue {
  tenantId: string;
  tenant: Tenant | null;
  /** The caller's membership in THIS wedding. Null for a global admin who is
   *  looking at a wedding they aren't a member of. */
  membership: MembershipWithId | null;
  /** The caller's side in this wedding, or null for a non-member admin. */
  side: Side | null;
  role: Role | null;
  /** May write shared config (categories, events, settings, invitations). */
  canWrite: boolean;
  /** Display label for a side — "Shivam", "Swara". Never render the raw id. */
  sideLabel: (side: Side) => string;
  loading: boolean;
  /** Set when the wedding is missing or the caller has no access to it. */
  denied: boolean;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/** Result of one load attempt, tagged with the id it belongs to so a wedding
 *  switch never renders the previous wedding's data for a frame. */
interface LoadedTenant {
  id: string;
  tenant: Tenant | null;
}

export function TenantProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const { isAdmin, loading: authLoading } = useAuth();
  const { memberships, loading: membershipsLoading } = useMemberships();
  const [loaded, setLoaded] = useState<LoadedTenant | null>(null);

  const membership = useMemo(
    () => memberships.find((m) => m.tenantId === tenantId) ?? null,
    [memberships, tenantId],
  );

  // No membership and no admin flag means the rules would reject the read
  // anyway; skip the request and show the no-access screen instead of burning a
  // read to be told what we already know.
  const mayRead = Boolean(membership) || isAdmin;
  const ready = !authLoading && !membershipsLoading;

  useEffect(() => {
    if (!ready || !mayRead) return;
    let cancelled = false;

    // READ COST: one document read per wedding opened.
    void (async () => {
      try {
        const snap = await getDoc(tenantDoc(tenantId));
        if (!cancelled) setLoaded({ id: tenantId, tenant: snap.exists() ? (snap.data() as Tenant) : null });
      } catch (err) {
        console.error("[tenant] load failed:", err);
        if (!cancelled) setLoaded({ id: tenantId, tenant: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, mayRead, ready]);

  const value = useMemo<TenantContextValue>(() => {
    const current = loaded?.id === tenantId ? loaded : null;
    const tenant = current?.tenant ?? null;

    return {
      tenantId,
      tenant,
      membership,
      side: membership?.side ?? null,
      role: membership?.role ?? null,
      // A global admin has full write access to every wedding, matching the rules.
      canWrite: membership?.role === "couple" || isAdmin,
      sideLabel: (side: Side) =>
        side === "a" ? (tenant?.sideA.label ?? "Side A") : (tenant?.sideB.label ?? "Side B"),
      loading: !ready || (mayRead && current === null),
      // Either the rules would refuse us, or the wedding doesn't exist (a stale
      // link, or a hand-typed URL).
      denied: ready && (!mayRead || (current !== null && tenant === null)),
    };
  }, [tenantId, loaded, membership, isAdmin, ready, mayRead]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within <TenantProvider>");
  return ctx;
}

/** Build an in-app href for a wedding: tenantHref(id, "/budget"). */
export function tenantHref(tenantId: string, path: string): string {
  return `/t/${encodeURIComponent(tenantId)}${path}`;
}
