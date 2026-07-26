"use client";

// The Plan tab holds three distinct tools — Comparisons, Questions, Contacts
// (PHASE2 Steps 3-5) — so it gets its own switcher rather than stacking all
// three onto one scrolling screen.
//
// Each section is a real route, not client state: a link to a specific
// comparison survives being sent in WhatsApp, and the browser back button does
// what people expect. The bottom tab bar keeps "Plan" highlighted throughout,
// because it matches on the /plan prefix.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";

const SECTIONS = [
  { path: "/plan/comparisons", label: "Compare" },
  { path: "/plan/questions", label: "Questions" },
  { path: "/plan/contacts", label: "Contacts" },
];

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tenantId } = useTenant();

  return (
    <div className="flex flex-1 flex-col">
      <nav
        className="flex shrink-0 gap-1 border-b border-stone-200 px-3 pt-3"
        aria-label="Planning sections"
      >
        {SECTIONS.map(({ path, label }) => {
          const href = tenantHref(tenantId, path);
          const active = pathname.startsWith(href);
          return (
            <Link
              key={path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] flex-1 items-center justify-center rounded-t-xl border-b-2 px-2 text-sm font-medium transition-colors ${
                active
                  ? "border-rose-500 text-rose-600"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
