import { redirect } from "next/navigation";

// /plan itself holds nothing — it forwards to the first section.
//
// A server-side redirect rather than rendering Comparisons here directly:
// comparison detail lives at /plan/comparisons/{id}, so the list needs its own
// path segment. Sharing one with /plan would make a comparison id ambiguous
// with the "questions" and "contacts" segments.
export default async function PlanPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  redirect(`/t/${tenantId}/plan/comparisons`);
}
