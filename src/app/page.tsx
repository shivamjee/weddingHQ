"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMemberships } from "@/lib/tenants/MembershipsProvider";
import { tenantHref } from "@/lib/tenants/TenantProvider";
import { Landing } from "@/components/Landing";
import { NotInvited } from "@/components/NotInvited";
import { LoadingScreen } from "@/components/LoadingScreen";

// The entry gate and the router into a wedding.
//
//   signed out            → the weddingHQ landing screen
//   exactly one wedding   → straight into it, no picker
//   several, or an admin  → the picker at /tenants
//   none, and not an admin→ the "not invited" screen
//
// The one-wedding shortcut matters: most people here are parents and in-laws who
// belong to a single wedding and should never learn that tenants exist.

export default function Home() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { memberships, loading: membershipsLoading } = useMemberships();
  const router = useRouter();

  const loading = authLoading || (Boolean(user) && membershipsLoading);
  const only = memberships.length === 1 ? memberships[0] : null;

  useEffect(() => {
    if (loading || !user) return;
    if (only && !isAdmin) {
      router.replace(tenantHref(only.tenantId, "/home"));
    } else if (memberships.length > 0 || isAdmin) {
      router.replace("/tenants");
    }
  }, [loading, user, only, isAdmin, memberships.length, router]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Landing />;
  if (memberships.length === 0 && !isAdmin) return <NotInvited />;
  return <LoadingScreen message="Taking you in…" />;
}
