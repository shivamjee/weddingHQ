"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

// One large, unmistakable "Sign in with Google" button — the only interactive
// element on the landing screen (PHASE1 Step 4). Tap target is comfortably over
// the 44px minimum. Shows an in-progress state so a slow popup doesn't look dead.

export function SignInButton() {
  const { signInWithGoogle, authError } = useAuth();
  const [pending, setPending] = useState(false);
  const [clickError, setClickError] = useState<string | null>(null);

  async function handleClick() {
    setClickError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message;
      setClickError(code ?? message ?? "Sign-in failed");
      setPending(false);
    }
    // On success the page redirects to Google, so we leave `pending` set.
  }

  // authError comes back from the redirect return leg; clickError from the tap.
  const shownError = clickError ?? authError;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex min-h-14 w-full max-w-xs items-center justify-center gap-3 rounded-full border border-stone-300 bg-white px-6 text-lg font-medium text-stone-700 shadow-sm transition active:scale-[0.98] disabled:opacity-70"
      >
        {pending ? (
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600"
            aria-hidden
          />
        ) : (
          <GoogleGlyph />
        )}
        <span>{pending ? "Signing in…" : "Sign in with Google"}</span>
      </button>
      {shownError ? (
        <p className="max-w-xs rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-700">
          Sign-in error: <span className="font-mono">{shownError}</span>
        </p>
      ) : null}
    </div>
  );
}

function GoogleGlyph() {
  // Google's four-colour "G" mark.
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
