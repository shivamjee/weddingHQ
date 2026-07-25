import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { MembershipsProvider } from "@/lib/tenants/MembershipsProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "weddingHQ",
  // Generic on purpose: one install of this app can hold several weddings, and
  // the signed-out shell doesn't know which one you're heading for.
  title: "weddingHQ",
  description: "Private wedding planning, for invited family only.",
  // iOS: allow standalone launch + set the home-screen name and touch icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "weddingHQ",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Next 16 emits the modern `mobile-web-app-capable`; add the legacy
  // `apple-mobile-web-app-capable` too so standalone launch works on older iOS.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // Address-bar / status-bar tint on Android Chrome; matches the manifest.
  themeColor: "#e11d48",
  width: "device-width",
  initialScale: 1,
  // Draw under the iOS notch/home-indicator when launched standalone.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Identity, then wedding membership. Both sit above every route so the
            entry router at "/" and the wedding switcher share one query. */}
        <AuthProvider>
          <MembershipsProvider>{children}</MembershipsProvider>
        </AuthProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
