"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Landing } from "@/components/Landing";
import { NotInvited } from "@/components/NotInvited";
import { LoadingScreen } from "@/components/LoadingScreen";

// The entry gate. Route protection lives here and in the (app) layout: an
// unauthenticated or non-allowlisted visitor never reaches an app route, and an
// allowlisted returning visitor is sent straight into the app without seeing the
// landing screen again (PHASE1 Step 4).

export default function Home() {
  const { user, profile, loading, notInvited } = useAuth();
  const router = useRouter();

  const allowlisted = Boolean(user && profile);

  useEffect(() => {
    if (allowlisted) router.replace("/home");
  }, [allowlisted, router]);

  if (loading) return <LoadingScreen />;
  if (notInvited) return <NotInvited />;
  if (allowlisted) return <LoadingScreen message="Taking you in…" />;
  return <Landing />;
}
