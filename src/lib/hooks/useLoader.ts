"use client";

// One bounded Firestore read, with the loading/stale/error states every Phase 2
// list screen needs, in one place.
//
// Two behaviours worth knowing:
//   • `loading` is DERIVED from whether the newest result answers the current
//     request, rather than being state set inside the effect. Setting state
//     synchronously in an effect causes cascading renders (and trips the
//     react-hooks/set-state-in-effect lint rule).
//   • A reload() keeps the previous rows on screen while the re-read is in
//     flight, so a list doesn't blink back to "Loading…" after every edit.
//
// `load` MUST be memoised with useCallback by the caller — its identity is what
// tells this hook that the query changed.

import { useCallback, useEffect, useMemo, useState } from "react";

export interface LoaderState<T> {
  data: T | null;
  /** Nothing to show yet — the first read for this query is still in flight. */
  loading: boolean;
  /** A re-read is in flight but the previous data is still displayed. */
  refreshing: boolean;
  error: string | null;
  reload: () => void;
}

export function useLoader<T>(load: () => Promise<T>, errorMessage: string): LoaderState<T> {
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<{
    token: object;
    data: T | null;
    error: string | null;
  } | null>(null);

  // A fresh object per (query, reload) pair — identity comparison then tells us
  // whether `result` answers the request we are currently making.
  const token = useMemo(() => ({ load, reloadKey }), [load, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await token.load();
        if (!cancelled) setResult({ token, data, error: null });
      } catch (err) {
        console.error("[loader] read failed:", err);
        if (!cancelled) setResult({ token, data: null, error: errorMessage });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, errorMessage]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    data: result?.data ?? null,
    loading: result === null,
    refreshing: result !== null && result.token !== token,
    error: result?.error ?? null,
    reload,
  };
}
