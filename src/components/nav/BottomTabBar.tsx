"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

// Mobile-first bottom navigation (PHASE1 Step 7). Five tabs, each a ≥44px tap
// target with a legible label under the icon. The same bar is used on desktop
// inside the centered, max-width app column — no separate desktop navigation.

type TabIcon = ComponentType<{ className?: string }>;

const TABS: { href: string; label: string; Icon: TabIcon }[] = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/budget", label: "Budget", Icon: BudgetIcon },
  { href: "/guests", label: "Guests", Icon: GuestsIcon },
  { href: "/plan", label: "Plan", Icon: PlanIcon },
  { href: "/more", label: "More", Icon: MoreIcon },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="flex shrink-0 items-stretch border-t border-stone-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {TABS.map(({ href, label, Icon }) => {
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

// --- icons (simple stroke set, inherit currentColor) ------------------------

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...strokeProps} aria-hidden>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

function BudgetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...strokeProps} aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M16 14h2" />
    </svg>
  );
}

function GuestsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...strokeProps} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 19a5 5 0 0110 0" />
      <path d="M16 6.5a3 3 0 010 5.5" />
      <path d="M17 14.5a5 5 0 013 4.5" />
    </svg>
  );
}

function PlanIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...strokeProps} aria-hidden>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5h6V6a1 1 0 01-1 1h-4a1 1 0 01-1-1V4.5z" />
      <path d="M8.5 13l2 2 4-4" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...strokeProps} aria-hidden>
      <circle cx="6" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18" cy="12" r="1" />
    </svg>
  );
}
