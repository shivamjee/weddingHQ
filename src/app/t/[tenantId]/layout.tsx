"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { TenantProvider, useTenant } from "@/lib/tenants/TenantProvider";
import { ConfigProvider } from "@/lib/tenants/ConfigProvider";
import { rememberLastTenant } from "@/lib/tenants/lastTenant";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NotInvited } from "@/components/NotInvited";
import { AppHeader } from "@/components/nav/AppHeader";
import { BottomTabBar } from "@/components/nav/BottomTabBar";
import { SidebarNav } from "@/components/nav/SidebarNav";

// Guard + chrome for one wedding. Two gates, in order:
//   1. not signed in                             → bounced to "/"
//   2. signed in, but this wedding isn't theirs  → a clear no-access screen, NOT
//      a redirect (a redirect loop is how a hand-typed URL comes to look broken)
//
// Below `md` (768px) this is still Phase 1's fixed-height phone column: header,
// scrollable content, bottom tab bar, capped at max-w-md. At `md:` and up a
// persistent SidebarNav replaces the bottom bar and the content column is
// allowed to grow — see CLAUDE.md § Responsive layout for which screens use
// the extra width and which stay single-column on purpose.

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

  // Categories and events are loaded here, once, rather than by each tab — see
  // ConfigProvider. Mounted inside the access gate above so it never fires a
  // read the rules would reject.
  return (
    <ConfigProvider tenantId={tenantId}>
      <div className="mx-auto flex w-full max-w-md flex-1 border-stone-200 sm:border-x md:max-w-none md:border-x-0">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          {/* No mx-auto and no max-width cap: either one leaves dead space
              between the sidebar and the content (centering inside leftover
              room, or capping width and stranding the rest). Content just
              fills whatever's left beside the sidebar. */}
          <main className="flex w-full flex-1 flex-col overflow-y-auto">
            {children}
          </main>
          <BottomTabBar />
        </div>
      </div>
    </ConfigProvider>
  );
}
