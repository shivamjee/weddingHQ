"use client";

import { useAuth } from "@/lib/auth/AuthProvider";

// A DISTINCT screen for a signed-in Google account with no wedding membership.
// Deliberately not the landing screen, no app chrome, and no retry loop — just a
// clear message and a way to sign out or switch account.
//
// `title`/`body` are overridable so the same screen also covers "you're signed
// in, but this particular wedding isn't yours" (see NoTenantAccess usage).

export function NotInvited({
  title = "This app is private",
  body,
}: {
  title?: string;
  body?: string;
}) {
  const { user, signOutUser } = useAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-stone-50 px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-3xl">
        🔒
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-stone-800">{title}</h1>
        <p className="max-w-sm text-base text-stone-500">
          {body ? (
            body
          ) : user?.email ? (
            <>
              <span className="font-medium text-stone-600">{user.email}</span> hasn&apos;t been
              invited to a wedding here yet.
            </>
          ) : (
            <>This account hasn&apos;t been invited to a wedding here yet.</>
          )}
        </p>
        <p className="max-w-sm text-sm text-stone-400">
          If you think this is a mistake, ask the couple to add this email address.
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
