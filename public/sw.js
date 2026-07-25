// weddingHQ service worker — offline SHELL cache only (PHASE1 Step 6).
// Deliberately minimal: no runtime caching of Firestore/app data this phase.
// Bump CACHE when the shell assets change to force an update.
const CACHE = "weddinghq-shell-v1";

// A tiny shell so the app opens (not a blank error) when offline. Hashed Next
// static assets are cached lazily on first use by the fetch handler below.
const PRECACHE = ["/", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin GETs. Firebase/Firestore/Google calls are cross-origin and
  // pass straight through untouched.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // NEVER intercept the Firebase auth handler proxy — OAuth must hit the network.
  if (url.pathname.startsWith("/__/")) return;

  // Page navigations: network-first (never serve a stale app online), fall back
  // to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Static assets (Next chunks, icons, fonts): cache-first, fill on first fetch.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    }),
  );
});
