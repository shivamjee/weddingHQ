import type { ReactNode } from "react";

// The "what's coming here" placeholder every Phase 1 tab renders (PHASE1 Step 7).
// Empty states are the correct output of this phase — not 404s or blank pages.
export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-3xl"
        aria-hidden
      >
        {emoji}
      </div>
      <h1 className="text-xl font-semibold text-stone-800">{title}</h1>
      <p className="max-w-xs text-base leading-relaxed text-stone-500">{children}</p>
      <p className="mt-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium tracking-wide text-stone-500 uppercase">
        Coming soon
      </p>
    </div>
  );
}
