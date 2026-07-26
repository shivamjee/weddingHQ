"use client";

// Title bar for a screen nested below a tab (More → Setup, Plan → Contacts…).
//
// The back link is a real <Link> to the parent, not history.back(): a family
// member who lands on a deep link from WhatsApp has no history to go back to,
// and a dead-looking back arrow is worse than none.

import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  backHref,
  title,
  subtitle,
  action,
}: {
  backHref?: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-2 flex min-h-[44px] w-fit items-center gap-1 px-2 text-sm font-medium text-stone-500 hover:text-stone-800"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-stone-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
