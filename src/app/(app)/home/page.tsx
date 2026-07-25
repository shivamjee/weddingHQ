"use client";

import { useAuth } from "@/lib/auth/AuthProvider";

// Temporary placeholder so route protection has a landing target to test against.
// Step 7 replaces this with the real Home tab (empty state) inside the nav shell.

export default function HomePage() {
  const { profile, signOutUser } = useAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-semibold text-stone-800">
        You&apos;re in{profile?.displayName ? `, ${profile.displayName.split(" ")[0]}` : ""} 🎉
      </p>
      <p className="text-stone-500">
        Signed in as {profile?.side} · {profile?.role}
      </p>
      <button
        onClick={signOutUser}
        className="min-h-12 rounded-full border border-stone-300 px-6 text-base font-medium text-stone-700 active:scale-[0.98]"
      >
        Sign out
      </button>
    </main>
  );
}
