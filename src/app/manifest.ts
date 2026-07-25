import type { MetadataRoute } from "next";

// PWA web manifest (PHASE1 Step 6). Next serves this at /manifest.webmanifest
// and auto-links it in <head>. `display: standalone` + a start_url is what makes
// the app launch full-screen from the home screen with no browser address bar.
// Icons are placeholders — replace via scripts/generate-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeddingHQ — Shivam & Swara",
    short_name: "WeddingHQ",
    description: "Private wedding planning for Shivam & Swara.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e11d48",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
