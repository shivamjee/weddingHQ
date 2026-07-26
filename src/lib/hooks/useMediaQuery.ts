"use client";

// Viewport queries via useSyncExternalStore rather than useState + useEffect.
//
// The naive version calls setState synchronously inside the effect to seed the
// first value, which causes a cascading render (and trips the
// react-hooks/set-state-in-effect rule). useSyncExternalStore reads the current
// value during render and subscribes separately, which is exactly the shape
// this needs — including a server snapshot, so SSR doesn't touch `window`.

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server render: assume the phone case. It is the primary target, and
    // hydrating from narrow to wide is less jarring than the reverse.
    () => false,
  );
}
