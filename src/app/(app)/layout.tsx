"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LoadingScreen } from "@/components/LoadingScreen";

// Guard for every authenticated app route. A visitor who is not signed in or not
// allowlisted is bounced to "/" and never renders app content (PHASE1 Step 4
// route protection). The visible header + bottom tab bar are added here in Step 7.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const allowlisted = Boolean(user && profile);

  useEffect(() => {
    if (!loading && !allowlisted) router.replace("/");
  }, [loading, allowlisted, router]);

  if (loading || !allowlisted) return <LoadingScreen />;
  return <>{children}</>;
}
