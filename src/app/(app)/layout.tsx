"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
import { AppHeader } from "@/components/nav/AppHeader";
import { BottomTabBar } from "@/components/nav/BottomTabBar";

// Guard + chrome for every authenticated app route. A visitor who is not signed
// in or not allowlisted is bounced to "/" and never renders app content (PHASE1
// Step 4 route protection). Inside, the shell is a fixed-height column — header,
// scrollable content, bottom tab bar — centered and max-width constrained so the
// desktop view is the same phone-width layout, not a separate navigation.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const allowlisted = Boolean(user && profile);

  useEffect(() => {
    if (!loading && !allowlisted) router.replace("/");
  }, [loading, allowlisted, router]);

  if (loading || !allowlisted) return <LoadingScreen />;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col border-stone-200 sm:border-x">
      <AppHeader />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
      <BottomTabBar />
    </div>
  );
}
