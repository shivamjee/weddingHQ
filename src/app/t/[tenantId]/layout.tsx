"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { TenantProvider, useTenant } from "@/lib/tenants/TenantProvider";
import { rememberLastTenant } from "@/lib/tenants/lastTenant";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NotInvited } from "@/components/NotInvited";
import { AppHeader } from "@/components/nav/AppHeader";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

// Guard + chrome for one wedding. Two gates, in order:
//   1. not signed in                             → bounced to "/"
//   2. signed in, but this wedding isn't theirs  → a clear no-access screen, NOT
//      a redirect (a redirect loop is how a hand-typed URL comes to look broken)
//
// Inside, the shell is the same fixed-height column as Phase 1 — header,
// scrollable content, bottom tab bar — centered and max-width constrained, so
// the desktop view is the same phone-width layout rather than a second design.

export default function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = use(params);
  return (
    <TenantProvider tenantId={decodeURIComponent(tenantId)}>
      <TenantShell>{children}</TenantShell>
    </TenantProvider>
  );
}

function TenantShell({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { tenant, tenantId, loading, denied } = useTenant();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  // Remember which wedding this device last opened, so the signed-out landing
  // screen can greet a returning family member by name.
  useEffect(() => {
    if (tenant) rememberLastTenant(tenantId, tenant.name);
  }, [tenant, tenantId]);

  if (loading || !user) return <LoadingScreen />;

  if (denied || !tenant) {
    return (
      <NotInvited
        title="You don't have access to this wedding"
        body="This link belongs to a wedding you haven't been invited to. If you were expecting to see it, ask the couple to add your email address."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col border-stone-200 sm:border-x">
      <AppHeader />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      <BottomTabBar />
    </div>
  );
}
