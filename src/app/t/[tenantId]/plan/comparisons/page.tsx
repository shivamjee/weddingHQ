import { EmptyState } from "@/components/EmptyState";

// Placeholder until PHASE2 Step 5. The route exists now so the Plan tab's
// switcher and its default redirect are stable from the start — links shared
// today keep working once the real screen lands here.
export default function ComparisonsPage() {
  return (
    <EmptyState emoji="⚖️" title="Compare">
      Venues, caterers, photographers — side by side, with the criteria that actually matter, will
      live here.
    </EmptyState>
  );
}
