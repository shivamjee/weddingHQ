"use client";

// One comparison table (PHASE2 Step 5, FEATURES.md §3.2).
//
// Two views of the same data — cards on a phone, table on a wider screen — plus
// "highlight best" and an optional weighted score that stays visually secondary
// to the raw numbers, exactly as the spec asks.
//
// LAYOUT NOTE: the app shell is a centered max-w-md column (CLAUDE.md UX), so
// even on a desktop the table lives in a phone-width column and scrolls
// sideways with a sticky first column. That keeps one layout for the whole app
// rather than a second desktop design; if the table ever needs the full window,
// that is a deliberate change to the shell, not something to special-case here.
//
// SECURITY: member-read and member-write, same as the rest of Plan.
// READ COST: one bounded read of this comparison's options, plus a bounded read
// of contacts to link an option to one.

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import {
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { comparisonDoc, contactsCol, optionsCol, questionsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormMessage, PrimaryButton, SecondaryButton } from "@/components/ui/form";
import { AiAssistSheet } from "@/components/comparison/AiAssistSheet";
import { CardsView, TableView } from "@/components/comparison/ComparisonViews";
import { CriteriaEditor } from "@/components/comparison/CriteriaEditor";
import { OptionForm } from "@/components/comparison/OptionForm";
import type { Comparison, ComparisonOptionWithId, Criterion } from "@/types";

const MAX_OPTIONS = 50;
const MAX_CONTACT_LINKS = 50;

type Mode = "view" | "criteria" | "option" | "ai";

export default function ComparisonDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string; comparisonId: string }>;
}) {
  const { comparisonId } = use(params);
  const { tenantId } = useTenant();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>("view");
  const [editingOption, setEditingOption] = useState<ComparisonOptionWithId | null>(null);
  const [highlightBest, setHighlightBest] = useState(true);
  const [showScores, setShowScores] = useState(false);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  // A table only earns its keep with room to show several columns at once.
  // Below that, cards. The user can always switch.
  const wide = useMediaQuery("(min-width: 768px)");
  const [viewOverride, setViewOverride] = useState<"cards" | "table" | null>(null);
  const view = viewOverride ?? (wide ? "table" : "cards");

  // Whether this deployment has a GEMINI_API_KEY at all. With no key the button
  // is hidden entirely and everything else works unchanged — local dev and
  // preview deploys often won't have one, and the app must never depend on it.
  const [aiAvailable, setAiAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/compare")
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d) => {
        if (!cancelled) setAiAvailable(Boolean(d?.configured));
      })
      .catch(() => {
        /* no key, no button — not worth surfacing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    const [comparisonSnap, optionsSnap, contactsSnap] = await Promise.all([
      getDoc(comparisonDoc(tenantId, comparisonId)),
      getDocs(query(optionsCol(tenantId, comparisonId), orderBy("createdAt"), limit(MAX_OPTIONS))),
      getDocs(query(contactsCol(tenantId), orderBy("name"), limit(MAX_CONTACT_LINKS))),
    ]);
    return {
      comparison: comparisonSnap.exists() ? (comparisonSnap.data() as Comparison) : null,
      options: optionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ComparisonOptionWithId),
      contacts: contactsSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? "",
        organisation: (d.data().organisation as string) ?? "",
      })),
    };
  }, [tenantId, comparisonId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load this comparison.");

  const comparison = data?.comparison ?? null;
  const criteria: Criterion[] = comparison?.criteria ?? [];
  const options = data?.options ?? [];
  const contacts = data?.contacts ?? [];

  async function saveCriteria(next: Criterion[]) {
    setSavingCriteria(true);
    setCriteriaError(null);
    try {
      await updateDoc(comparisonDoc(tenantId, comparisonId), {
        criteria: next,
        updatedAt: serverTimestamp(),
      });
      setMode("view");
      reload();
    } catch (err) {
      console.error("[comparison] criteria save failed:", err);
      setCriteriaError("Could not save those criteria.");
    } finally {
      setSavingCriteria(false);
    }
  }

  if (loading) return <p className="px-5 py-6 text-sm text-stone-400">Loading…</p>;

  if (!comparison) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 py-6">
        <PageHeader
          backHref={tenantHref(tenantId, "/plan/comparisons")}
          title="Not found"
          subtitle="This comparison has been deleted, or the link is wrong."
        />
      </div>
    );
  }

  if (mode === "criteria") {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <CriteriaEditor
          criteria={criteria}
          onSave={saveCriteria}
          onCancel={() => setMode("view")}
          busy={savingCriteria}
          error={criteriaError}
        />
      </div>
    );
  }

  /** The `unknowns[]` hand-off: what the AI couldn't determine becomes open
   *  questions, with `askWho` prefilled from the option's name. One batch, and
   *  the person still had to tap the button. */
  async function addUnknownsAsQuestions(questions: string[], askWho: string) {
    if (!user || questions.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const text of questions.slice(0, 12)) {
        batch.set(doc(questionsCol(tenantId)), {
          text,
          askWho,
          contactId: null,
          categoryId: comparison?.categoryId ?? null,
          eventId: null,
          status: "open",
          answer: "",
          askedBy: null,
          askedAt: null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      console.error("[comparison] adding unknowns as questions failed:", err);
    }
  }

  if (mode === "ai") {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <AiAssistSheet
          comparisonId={comparisonId}
          criteria={criteria}
          onAddQuestions={(questions, askWho) =>
            void addUnknownsAsQuestions(questions, askWho || comparison.name)
          }
          onDone={() => {
            setMode("view");
            reload();
          }}
          onCancel={() => setMode("view")}
        />
      </div>
    );
  }

  if (mode === "option") {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <OptionForm
          comparisonId={comparisonId}
          criteria={criteria}
          existing={editingOption ?? undefined}
          contacts={contacts}
          onDone={() => {
            setMode("view");
            setEditingOption(null);
            reload();
          }}
          onCancel={() => {
            setMode("view");
            setEditingOption(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <PageHeader
        backHref={tenantHref(tenantId, "/plan/comparisons")}
        title={comparison.name}
        subtitle={`${options.length} option${options.length === 1 ? "" : "s"} · ${criteria.length} criteri${criteria.length === 1 ? "on" : "a"}`}
        action={<SecondaryButton onClick={() => setMode("criteria")}>Criteria</SecondaryButton>}
      />

      <FormMessage error={error} />

      {options.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-stone-300 p-0.5">
            {(["cards", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewOverride(v)}
                aria-pressed={view === v}
                className={`min-h-[36px] rounded-full px-4 text-sm font-medium transition-colors ${
                  view === v ? "bg-rose-500 text-white" : "text-stone-600"
                }`}
              >
                {v === "cards" ? "Cards" : "Table"}
              </button>
            ))}
          </div>
          <Toggle label="Highlight best" on={highlightBest} onChange={setHighlightBest} />
          <Toggle label="Score" on={showScores} onChange={setShowScores} />
        </div>
      ) : null}

      {options.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-6">
          <p className="text-sm text-stone-500">
            Nothing to compare yet. Add the first venue, caterer or photographer you&rsquo;re
            considering.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={() => setMode("option")}>Add an option</PrimaryButton>
            {aiAvailable ? <AiButton onClick={() => setMode("ai")} /> : null}
          </div>
        </div>
      ) : view === "cards" ? (
        <CardsView
          criteria={criteria}
          options={options}
          highlightBest={highlightBest}
          showScores={showScores}
          onEdit={(option) => {
            setEditingOption(option);
            setMode("option");
          }}
        />
      ) : (
        <TableView
          criteria={criteria}
          options={options}
          highlightBest={highlightBest}
          showScores={showScores}
          onEdit={(option) => {
            setEditingOption(option);
            setMode("option");
          }}
        />
      )}

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => setMode("option")}>+ Add option</SecondaryButton>
          {aiAvailable ? <AiButton onClick={() => setMode("ai")} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Visually distinct from the plain actions — violet, matching the "AI" chip on
 *  values — so it never reads as just another way to add a row. */
function AiButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="min-h-[48px] rounded-full border border-violet-300 bg-violet-50 px-5 text-base font-medium text-violet-700 transition-colors hover:border-violet-400"
    >
      ✨ Add with AI
    </button>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`min-h-[36px] rounded-full border px-3 text-sm font-medium transition-colors ${
        on ? "border-rose-400 bg-rose-50 text-rose-700" : "border-stone-300 text-stone-500"
      }`}
    >
      {label}
    </button>
  );
}
