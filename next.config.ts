import type { NextConfig } from "next";

// Firebase Auth syncs sign-in state (redirect result AND popup postMessage)
// through a hidden iframe/handler hosted at `authDomain`. When authDomain is a
// different site than this app (the default: <project>.firebaseapp.com vs our
// own domain), browsers that partition third-party storage (Chrome, Safari
// ITP — including on localhost) block that sync: the Google OAuth flow
// completes, but the app never learns it succeeded and falls back to
// signed-out. Proxying Firebase's auth handler through our own domain here,
// paired with pointing `authDomain` at window.location.host in
// src/lib/firebase.ts, makes the whole flow same-origin and avoids this
// entirely. Works in both `next dev` and on Vercel — no per-environment config.
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!firebaseAuthDomain) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseAuthDomain}/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
