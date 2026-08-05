"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { TABS } from "@/components/nav/navItems";

// Tablet/desktop nav (`md:` and up, CLAUDE.md § Responsive layout). Same five
// tabs as BottomTabBar, same active-route logic — a persistent left column
// instead of a bar that eats vertical space nobody's short on at this width.

export function SidebarNav() {
  const pathname = usePathname();
  const { tenantId } = useTenant();

  return (
    <nav
      className="hidden w-56 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-3 md:flex"
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
            className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
              active ? "bg-rose-50 text-rose-600" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
