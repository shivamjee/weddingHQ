"use client";

// Plan → Compare: the list of comparison tables (PHASE2 Step 5, FEATURES.md §3.2).
//
// Generic by design — the same screen serves venues, caterers and
// photographers. Building it venue-specific means building it three more times.
// The only venue-specific thing here is an optional set of seed criteria.
//
// SECURITY: member-read and member-write — comparing vendors is collaborative.
// READ COST: one bounded page of comparisons; each table's options are read
// only when that table is opened.

import Link from "next/link";
import { useCallback, useState } from "react";
import { addDoc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { comparisonsCol } from "@/lib/paths";
import { useAuth } from "@/lib/auth/AuthProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { VENUE_SEED_CRITERIA } from "@/lib/comparison";
import {
  ChipRow,
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import type { ComparisonWithId } from "@/types";

const MAX_COMPARISONS = 50;

export default function ComparisonsPage() {
  const { tenantId } = useTenant();
  const { categoryById } = useConfig();
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const snap = await getDocs(
      query(comparisonsCol(tenantId), orderBy("createdAt", "desc"), limit(MAX_COMPARISONS)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ComparisonWithId);
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load comparisons.");
  const comparisons = data ?? [];

  if (creating) {
    return (
      <div className="flex flex-1 flex-col px-5 py-6">
        <NewComparisonForm
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Compare</h1>
          <p className="mt-1 text-sm text-stone-500">
            Venues, caterers, photographers — side by side.
          </p>
        </div>
        <SecondaryButton onClick={() => setCreating(true)}>+ New</SecondaryButton>
      </div>

      <FormMessage error={error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : comparisons.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-stone-300 px-4 py-6">
          <p className="text-sm text-stone-500">
            No comparisons yet. Start one for venues — it comes with the criteria most people wish
            they&rsquo;d asked about, and you can change every one of them.
          </p>
          <PrimaryButton onClick={() => setCreating(true)}>Start a comparison</PrimaryButton>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {comparisons.map((comparison) => {
            const category = categoryById(comparison.categoryId);
            return (
              <li key={comparison.id}>
                <Link
                  href={tenantHref(tenantId, `/plan/comparisons/${comparison.id}`)}
                  className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-stone-800">
                      {comparison.name}
                    </p>
                    <p className="flex items-center gap-2 truncate text-xs text-stone-400">
                      {category ? (
                        <span className="flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: category.colour }}
                            aria-hidden
                          />
                          {category.name}
                        </span>
                      ) : null}
                      <span>
                        {comparison.criteria?.length ?? 0} criteri
                        {(comparison.criteria?.length ?? 0) === 1 ? "on" : "a"}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-stone-300" aria-hidden>
                    &rsaquo;
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewComparisonForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { categories } = useConfig();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [useVenueSeed, setUseVenueSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = name.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!clean || busy || !user) return;
    setBusy(true);
    setError(null);
    try {
      await addDoc(comparisonsCol(tenantId), {
        name: clean,
        // Seeded criteria are a starting point, not a template to live with —
        // every one can be renamed, reweighted or deleted on the next screen.
        criteria: useVenueSeed ? VENUE_SEED_CRITERIA : [],
        categoryId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onDone();
    } catch (err) {
      console.error("[comparisons] create failed:", err);
      setError("Could not create that comparison.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-stone-800">New comparison</h1>

      <Field label="What are you comparing?">
        <TextInput
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Wedding venues"
        />
      </Field>

      <ChipRow
        label="Category (optional)"
        options={categories.map((c) => ({ value: c.id, label: c.name, colour: c.colour }))}
        value={categoryId}
        onChange={setCategoryId}
        allowClear
        emptyLabel="No categories yet — add them in More → Setup."
      />

      <label className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          type="checkbox"
          checked={useVenueSeed}
          onChange={(e) => setUseVenueSeed(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-rose-500"
        />
        <span>
          <span className="text-base text-stone-800">Start with venue criteria</span>
          <span className="mt-0.5 block text-xs text-stone-400">
            Capacity, per-plate cost, rental, in-house catering, parking, AC, distance, available
            dates. All editable.
          </span>
        </span>
      </label>

      <FormMessage error={error} />

      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={!clean || busy}>
          {busy ? "Creating…" : "Create"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );
}
