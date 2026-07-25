"use client";

import { useSyncExternalStore } from "react";
import { SignInButton } from "./SignInButton";
import { readLastTenantName } from "@/lib/tenants/lastTenant";

// The signed-out landing screen. Not a marketing page — one job: make it
// unmistakable you're in the right place, then get you signed in in one tap.
//
// It cannot show a couple's names the way Phase 1 did: weddingHQ now holds more
// than one wedding, and signed out we don't know which one you're heading for
// (the tenant document isn't readable before sign-in — that is rather the point
// of it). The compromise is the returning-visitor line below: this device
// remembers the last wedding opened, so on a family member's own phone the
// screen still greets them by name.

/** localStorage never changes underneath this screen — there's no second tab
 *  writing it while you're signed out — so the subscription is a no-op. */
const subscribeToNothing = () => () => {};

export function Landing() {
  // useSyncExternalStore, not an effect: localStorage doesn't exist during
  // server rendering, and this is the supported way to read a client-only value
  // without a hydration mismatch. The server snapshot is simply "unknown".
  const lastWedding = useSyncExternalStore(subscribeToNothing, readLastTenantName, () => null);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 bg-gradient-to-b from-rose-50 via-white to-white px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium tracking-[0.2em] text-rose-400 uppercase">Welcome to</p>
        <h1 className="font-serif text-5xl leading-tight tracking-tight text-stone-800 sm:text-6xl">
          wedding<span className="text-rose-400">HQ</span>
        </h1>
        {lastWedding ? (
          <p className="text-lg text-stone-500">Sign back in to {lastWedding}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        <SignInButton />
        <p className="max-w-xs text-sm text-stone-400">
          A private space for planning a wedding together. Sign in with the Google account you were
          invited on.
        </p>
      </div>
    </main>
  );
}
