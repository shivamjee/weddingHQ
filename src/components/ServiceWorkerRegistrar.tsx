"use client";

import { useEffect } from "react";

// Registers the offline-shell service worker (PHASE1 Step 6). Production only —
// a service worker in `next dev` fights Turbopack HMR and caches stale chunks.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw] registration failed:", err);
      });
    };

    // Register after load so it doesn't compete with the initial render.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
