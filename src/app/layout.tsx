import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
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
  applicationName: "WeddingHQ",
  title: "Shivam & Swara",
  description: "Private wedding planning for Shivam & Swara.",
  // iOS: allow standalone launch + set the home-screen name and touch icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WeddingHQ",
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
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
