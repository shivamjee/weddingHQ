"use client";

// CSV import (PHASE3 Step 6, FEATURES.md §4.6).
//
// The list already exists in somebody's spreadsheet, or will the moment names
// are requested from parents. Typing 200 households by hand is how the guest
// list dies, so this is part of the phase rather than a stretch goal.
//
// Three steps, each of which can be backed out of: pick a file → map the columns
// → read the DRY RUN and commit. Nothing is written until the last button, and
// the preview is computed by mapRows() in src/lib/guestCsv.ts, which has no
// access to Firestore at all — so "preview" is a guarantee, not a promise.
//
// Parsed entirely in the browser. No upload, no Firebase Storage, no server: a
// few hundred rows is nothing, and the file never leaves the phone.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  addDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  ChipMultiRow,
  ChipRow,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useConfig } from "@/lib/tenants/ConfigProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { db } from "@/lib/firebase";
import { guestLogCol, guestTotalsDoc, householdsCol } from "@/lib/paths";
import { CSV_FIELDS, guessMapping, mapRows, type CsvField } from "@/lib/guestCsv";
import { guestTotalsFrom, platesByEvent } from "@/lib/guests";
import { SIDES, type HouseholdWithId, type Side } from "@/types";

/** READ COST: the duplicate check needs the existing list. Same bound as the
 *  Guests screen itself. */
const MAX_HOUSEHOLDS = 500;
/** Firestore caps a batch at 500 writes; staying under it keeps the commit a
 *  single round trip for any realistic file. Bigger files are chunked. */
const BATCH_SIZE = 400;

export default function ImportGuestsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { tenantId, sideLabel } = useTenant();
  const { events } = useConfig();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(CsvField | null)[]>([]);
  const [existing, setExisting] = useState<HouseholdWithId[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [defaultSide, setDefaultSide] = useState<Side>("a");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const plates = useMemo(() => platesByEvent(events), [events]);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setDone(null);
      setFileName(file.name);
      try {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
        const [head, ...body] = parsed.data;
        if (!head || body.length === 0) {
          setError("That file has a header but no rows.");
          return;
        }
        setHeaders(head);
        setRows(body);
        setMapping(guessMapping(head));

        // Loaded now, not at commit time: the dry run's duplicate warnings are
        // most of its value, and they need the current list.
        const snap = await getDocs(query(householdsCol(tenantId), limit(MAX_HOUSEHOLDS)));
        setExisting(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HouseholdWithId));
      } catch (err) {
        console.error("[guests] CSV read failed:", err);
        setError("Could not read that file. A .csv exported from Excel or Sheets works best.");
      }
    },
    [tenantId],
  );

  const preview = useMemo(
    () =>
      rows.length > 0
        ? mapRows(rows, mapping, {
            existing,
            sideLabels: { a: sideLabel("a"), b: sideLabel("b") },
            eventIds,
            defaultSide,
            invitedBy: user?.uid ?? "",
          })
        : null,
    [rows, mapping, existing, sideLabel, eventIds, defaultSide, user],
  );

  async function commit() {
    if (!preview || !user) return;
    setBusy(true);
    setError(null);
    try {
      const ready = preview.rows.filter((r) => r.problems.length === 0).map((r) => r.draft);
      const added: HouseholdWithId[] = [];

      for (let i = 0; i < ready.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        for (const draft of ready.slice(i, i + BATCH_SIZE)) {
          // doc() on a collection mints the id client-side, so the batch can
          // stay a single atomic write instead of an addDoc per row.
          const ref = doc(householdsCol(tenantId));
          batch.set(ref, {
            ...draft,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          added.push({ id: ref.id, ...draft } as HouseholdWithId);
        }
        await batch.commit();
      }

      // One aggregate rewrite for the whole import, from the combined list —
      // same recompute-and-overwrite as a single household edit.
      await setDoc(guestTotalsDoc(tenantId), {
        ...guestTotalsFrom([...existing, ...added], plates),
        updatedAt: serverTimestamp(),
      }).catch((err) => console.warn("[guests] totals rewrite failed:", err));

      await addDoc(guestLogCol(tenantId), {
        action: "imported",
        householdName: `${added.length} households from ${fileName || "a spreadsheet"}`,
        householdId: null,
        people: added.reduce((t, h) => t + h.adultCount + h.childCount, 0),
        by: user.uid,
        byName: user.displayName ?? user.email ?? "Someone",
        at: serverTimestamp(),
      }).catch((err) => console.warn("[guests] change log entry failed:", err));

      setDone(added.length);
    } catch (err) {
      console.error("[guests] import failed:", err);
      setError("Could not import that list. Nothing partial was left behind for the failed batch.");
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <div className="flex flex-1 flex-col gap-4 px-5 py-6">
        <PageHeader backHref={tenantHref(tenantId, "/guests")} title="Imported" />
        <p className="text-sm text-stone-600">
          {done} {done === 1 ? "household" : "households"} added, all as{" "}
          <strong>proposed</strong> — they count towards every projection but are visibly not
          agreed yet.
        </p>
        <PrimaryButton onClick={() => router.push(tenantHref(tenantId, "/guests"))}>
          Back to the guest list
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6">
      <PageHeader
        backHref={tenantHref(tenantId, "/guests")}
        title="Import a spreadsheet"
        subtitle="Nothing is saved until you press Import at the bottom."
      />

      <label className="flex flex-col gap-2">
        <span className="text-xs font-medium text-stone-500">CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
          className="min-h-[48px] w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:min-h-[36px] file:rounded-full file:border-0 file:bg-rose-500 file:px-4 file:text-sm file:font-semibold file:text-white"
        />
        <span className="text-xs text-stone-400">
          Export as CSV from Excel, Numbers or Google Sheets. The first row must be the column
          headings.
        </span>
      </label>

      <FormMessage error={error} />

      {headers.length > 0 ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-stone-800">Which column is which?</h2>
            <p className="text-sm text-stone-500">
              Guessed from the headings — change anything that&rsquo;s wrong. A column set to
              &ldquo;Ignore&rdquo; is skipped.
            </p>
            {headers.map((header, index) => (
              <div key={`${header}-${index}`} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-stone-500">
                  {header || `Column ${index + 1}`}
                  <span className="ml-2 font-normal text-stone-400">
                    e.g. {rows[0]?.[index] || "—"}
                  </span>
                </span>
                <ChipRow<CsvField>
                  options={CSV_FIELDS.map((f) => ({ value: f.field, label: f.label }))}
                  value={mapping[index] ?? null}
                  onChange={(field) =>
                    setMapping((m) => {
                      const next = [...m];
                      // A field can only come from one column; taking it here
                      // releases it wherever it was.
                      if (field) {
                        for (let i = 0; i < next.length; i += 1) {
                          if (next[i] === field) next[i] = null;
                        }
                      }
                      next[index] = field;
                      return next;
                    })
                  }
                  allowClear
                />
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-stone-800">Applies to everyone imported</h2>
            <ChipMultiRow
              label="Invited to"
              options={events.map((e) => ({
                value: e.id,
                label: e.name,
                colour: e.colour,
                icon: e.icon,
              }))}
              values={eventIds}
              onChange={setEventIds}
              emptyLabel="No events yet — add them under More → Setup."
            />
            <p className="text-xs text-stone-400">
              Households invited to nothing are counted as people but project no cost, so pick the
              events now if you can.
            </p>
            <ChipRow<Side>
              label="Side, when the file doesn't say"
              options={SIDES.map((s) => ({ value: s, label: sideLabel(s) }))}
              value={defaultSide}
              onChange={(v) => v && setDefaultSide(v)}
            />
          </section>
        </>
      ) : null}

      {preview ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-stone-800">Preview</h2>
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-2xl font-semibold text-stone-800">
              {preview.readyCount} {preview.readyCount === 1 ? "household" : "households"}
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {preview.totalPeople} people
              {preview.skippedCount > 0 ? ` · ${preview.skippedCount} skipped` : ""}
              {preview.duplicateCount > 0
                ? ` · ${preview.duplicateCount} possible ${
                    preview.duplicateCount === 1 ? "duplicate" : "duplicates"
                  }`
                : ""}
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {preview.rows.slice(0, 100).map((row) => (
              <li
                key={row.line}
                className={`rounded-2xl border p-3 text-sm ${
                  row.problems.length > 0
                    ? "border-stone-200 bg-stone-50 text-stone-400"
                    : row.duplicateOf.length > 0 || row.duplicateInFile
                      ? "border-amber-300 bg-amber-50"
                      : "border-stone-200 bg-white"
                }`}
              >
                <p className="font-medium text-stone-800">
                  {row.draft.name || <span className="text-stone-400">(no name)</span>}
                  <span className="ml-2 text-xs font-normal text-stone-400">line {row.line}</span>
                </p>
                <p className="text-stone-500">
                  {sideLabel(row.draft.side)} · {row.draft.tier} · {row.draft.adultCount} adults,{" "}
                  {row.draft.childCount} children
                </p>
                {row.problems.map((p) => (
                  <p key={p} className="text-rose-600">
                    Skipped: {p}
                  </p>
                ))}
                {row.warnings.map((w) => (
                  <p key={w} className="text-amber-700">
                    {w}
                  </p>
                ))}
                {row.duplicateOf.length > 0 ? (
                  <p className="text-amber-800">
                    Looks like {row.duplicateOf.slice(0, 3).join(", ")} — already on the list.
                  </p>
                ) : null}
                {row.duplicateInFile ? (
                  <p className="text-amber-800">Appears earlier in this same file.</p>
                ) : null}
              </li>
            ))}
          </ul>
          {preview.rows.length > 100 ? (
            <p className="text-sm text-stone-400">
              …and {preview.rows.length - 100} more rows, all included in the totals above.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={() => void commit()} disabled={busy || preview.readyCount === 0}>
              {busy ? "Importing…" : `Import ${preview.readyCount} as proposed`}
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                setHeaders([]);
                setRows([]);
                setMapping([]);
                setFileName("");
              }}
              disabled={busy}
            >
              Start over
            </SecondaryButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
