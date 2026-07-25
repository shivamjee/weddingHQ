"use client";

import { useAuth } from "@/lib/auth/AuthProvider";

// A DISTINCT screen for a signed-in Google account that isn't on the allowlist
// (PHASE1 Step 4). Deliberately not the landing screen and with no app chrome —
// and no retry loop. Just a clear message and a way to sign out / switch account.

export function NotInvited() {
  const { user, signOutUser } = useAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-stone-50 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-3xl">
        🔒
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-stone-800">This app is private</h1>
        <p className="max-w-sm text-base text-stone-500">
          {user?.email ? (
            <>
              <span className="font-medium text-stone-600">{user.email}</span> isn&apos;t on the
              guest list for this planning app.
            </>
          ) : (
            <>This account isn&apos;t on the guest list for this planning app.</>
          )}
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          If you think this is a mistake, ask Shivam or Swara to add you.
        </p>
      </div>
      <button
        onClick={signOutUser}
        className="min-h-12 rounded-full border border-stone-300 bg-white px-6 text-base font-medium text-stone-700 active:scale-[0.98]"
      >
        Sign out
      </button>
    </main>
  );
}
