"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMemberships } from "@/lib/tenants/MembershipsProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";

// App header: which wedding you're in, who you are, and a way out.
//
// The wedding switcher appears ONLY for someone who has more than one wedding
// (or is a global admin). For the parents and in-laws this app is mostly for,
// the header looks exactly as it did before multi-tenancy — no extra control to
// wonder about. An initials avatar (no external image fetch) keeps it reliable.

export function AppHeader() {
  const { profile, signOutUser, isAdmin } = useAuth();
  const { memberships } = useMemberships();
  const { tenant, side, sideLabel } = useTenant();

  const canSwitch = memberships.length > 1 || isAdmin;

  // The wedding is the headline; who you are is the subtitle, alongside your
  // side. Both matter — "am I in the right wedding" and "am I signed in as me".
  const firstName = (profile?.displayName ?? "").trim().split(" ")[0];
  const subtitle = [firstName, side ? `${sideLabel(side)}'s side` : isAdmin ? "Admin" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
          {(tenant?.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-stone-800">
            {tenant?.name ?? "Wedding"}
          </p>
          {/* Side labels come from the tenant document — never hardcoded names. */}
          <p className="truncate text-xs text-stone-400">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        {canSwitch ? (
          <Link
            href="/tenants"
            className="flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
          >
            Switch
          </Link>
        ) : null}
        <button
          onClick={signOutUser}
          className="flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
