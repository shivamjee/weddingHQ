"use client";

import { useAuth } from "@/lib/auth/AuthProvider";

// App header (PHASE1 Step 7): shows the signed-in user and a sign-out control.
// An initials avatar (no external image fetch) keeps it reliable and dependency-free.
export function AppHeader() {
  const { profile, signOutUser } = useAuth();
  const name = profile?.displayName?.trim() ?? "";
  const initial = name.charAt(0).toUpperCase() || "?";
  const firstName = name.split(" ")[0] || "there";

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 py-3"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-700">
          {initial}
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-stone-800">{firstName}</p>
          {profile?.side ? (
            <p className="text-xs text-stone-400 capitalize">{profile.side}&rsquo;s side</p>
          ) : null}
        </div>
      </div>
      <button
        onClick={signOutUser}
        className="flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium text-stone-500 transition-colors hover:text-stone-800"
      >
        Sign out
      </button>
    </header>
  );
}
