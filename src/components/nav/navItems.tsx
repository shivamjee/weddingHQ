// Shared tab data + icon set for BottomTabBar (phone) and SidebarNav
// (tablet/desktop) — one definition so the two never drift.

import type { ComponentType } from "react";

type TabIcon = ComponentType<{ className?: string }>;

export const TABS: { path: string; label: string; Icon: TabIcon }[] = [
  { path: "/home", label: "Home", Icon: HomeIcon },
  { path: "/budget", label: "Budget", Icon: BudgetIcon },
  { path: "/guests", label: "Guests", Icon: GuestsIcon },
  { path: "/plan", label: "Plan", Icon: PlanIcon },
  { path: "/more", label: "More", Icon: MoreIcon },
];

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
