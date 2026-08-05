"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { TABS } from "@/components/nav/navItems";

// Phone-only bottom navigation (PHASE1 Step 7). Five tabs, each a ≥44px tap
// target with a legible label under the icon. `md:hidden` from here on —
// SidebarNav takes over at tablet/desktop (CLAUDE.md § Responsive layout).
//
// Every href is scoped to the active wedding, so switching weddings keeps you on
// the same tab rather than dumping you back at Home.
//
// The bar is `sticky bottom-0`, not static: the app column is a plain flex stack
// that grows past the viewport on a long page, so the *document* scrolls and a
// static bar scrolls away with it. Sticky pins it without clamping <body> to the
// viewport height — <body> is shared with "/" and "/tenants", which have no
// inner scroll container and would clip if it were clamped.

export function BottomTabBar() {
  const pathname = usePathname();
  const { tenantId } = useTenant();

  return (
    <nav
      className="sticky bottom-0 z-10 flex shrink-0 items-stretch border-t border-stone-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {TABS.map(({ path, label, Icon }) => {
        const href = tenantHref(tenantId, path);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors ${
              active ? "text-rose-600" : "text-stone-500"
            }`}
          >
            <Icon className="h-6 w-6" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
