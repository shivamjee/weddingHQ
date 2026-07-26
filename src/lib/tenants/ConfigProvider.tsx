"use client";

// The active wedding's shared dimensions: its categories and its events
// (FEATURES.md §1.2). Almost every Phase 2 screen needs both — budget
// allocations, contacts, questions and comparisons all tag records with them —
// so they are loaded ONCE per wedding here rather than re-fetched per screen.
//
// READ COST (CLAUDE.md §3): two bounded reads per wedding opened, not per tab
// switch. Both collections are small and change rarely; Setup calls reload()
// after a write instead of us holding a live listener open all session.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getDocs, limit, query } from "firebase/firestore";
import { categoriesCol, eventsCol } from "@/lib/paths";
import type { CategoryWithId, EventWithId } from "@/types";

/** Bounded per CLAUDE.md §3. A wedding with more than this many categories or
 *  events has a different problem than a missing row. */
export const MAX_CATEGORIES = 50;
export const MAX_EVENTS = 50;

interface ConfigContextValue {
  categories: CategoryWithId[];
  events: EventWithId[];
  /** True only when there is nothing to show yet — first load, or a switch to a
   *  different wedding. */
  loading: boolean;
  /** A reload() is in flight but the previous rows are still on screen. */
  refreshing: boolean;
  /** Set when the load failed; screens should still render, just without chips. */
  error: string | null;
  /** Re-read after a Setup write. */
  reload: () => void;
  categoryById: (id: string | null | undefined) => CategoryWithId | null;
  eventById: (id: string | null | undefined) => EventWithId | null;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

/** Sort by `order`, then name. Deliberately client-side rather than an
 *  `orderBy("order")` query: a Firestore range/order query silently OMITS
 *  documents missing that field, and the first tenant's config can be
 *  hand-typed in the console. A missing `order` should push a row to the end,
 *  not make it invisible. Both collections are limit()-bounded and tiny, so
 *  sorting here costs nothing. */
function byOrder<T extends { order?: number; name: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
  );
}

/** One completed load, tagged with the request it answered. Following
 *  TenantProvider: `loading` is DERIVED from whether the newest result matches
 *  the current request, rather than being its own state set inside the effect.
 *  That keeps a wedding switch (or a reload after a Setup write) from rendering
 *  the previous wedding's categories for a frame. */
interface LoadedConfig {
  tenantId: string;
  key: string;
  categories: CategoryWithId[];
  events: EventWithId[];
  error: string | null;
}

export function ConfigProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedConfig | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const key = `${tenantId}#${reloadKey}`;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [catSnap, evtSnap] = await Promise.all([
          getDocs(query(categoriesCol(tenantId), limit(MAX_CATEGORIES))),
          getDocs(query(eventsCol(tenantId), limit(MAX_EVENTS))),
        ]);
        if (cancelled) return;
        setLoaded({
          tenantId,
          key,
          categories: byOrder(
            catSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as CategoryWithId),
          ),
          events: byOrder(evtSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventWithId)),
          error: null,
        });
      } catch (err) {
        console.error("[config] load failed:", err);
        if (cancelled) return;
        setLoaded({
          tenantId,
          key,
          categories: [],
          events: [],
          error: "Could not load this wedding's categories and events.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, key]);

  const value = useMemo<ConfigContextValue>(() => {
    const fresh = loaded?.key === key;
    // A reload() after a Setup write keeps showing the previous rows while the
    // re-read is in flight — the list must not blink back to "Loading…" every
    // time someone renames a category. Data from a DIFFERENT wedding is never
    // shown, which is why tenantId is checked and not just the reload counter.
    const usable = loaded?.tenantId === tenantId ? loaded : null;
    const categories = usable?.categories ?? [];
    const events = usable?.events ?? [];

    return {
      categories,
      events,
      loading: usable === null,
      refreshing: usable !== null && !fresh,
      error: usable?.error ?? null,
      reload,
      categoryById: (id) => (id ? (categories.find((c) => c.id === id) ?? null) : null),
      eventById: (id) => (id ? (events.find((e) => e.id === id) ?? null) : null),
    };
  }, [loaded, key, tenantId, reload]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within <ConfigProvider>");
  return ctx;
}
