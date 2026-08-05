"use client";

// Balances — Phase 4 Step 5. Who owes whom, on its own screen, entirely
// separate from budget health (PHASE4.md: "never the same number or the
// same card"). Simplified transfers as plain sentences, with Settle up
// pre-filling a settlement.
//
// READ COST: bounded reads of expenses (needed for balances()), settlements
// and members — same caps as the Expenses screen, and for the same reason:
// balances() needs the full paid-expense list, not a page of it.

import { useCallback, useMemo, useState } from "react";
import { Timestamp, addDoc, getDocs, limit, query, serverTimestamp, where } from "firebase/firestore";
import {
  Field,
  FormMessage,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui/form";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { tenantHref, useTenant } from "@/lib/tenants/TenantProvider";
import { useLoader } from "@/lib/hooks/useLoader";
import { writeExpenseAggregates } from "@/lib/aggregateWriter";
import { balances, simplifyDebts, type Transfer } from "@/lib/expenses";
import { dateInputValue, toTimestamp } from "@/lib/dates";
import { expensesCol, membershipsCol, settlementsCol } from "@/lib/paths";
import { formatINR, toPaise } from "@/lib/money";
import type { ExpenseWithId, MembershipWithId, SettlementWithId, Side } from "@/types";

const MAX_EXPENSES = 500;
const MAX_SETTLEMENTS = 500;
const MAX_MEMBERS = 50;

interface Loaded {
  expenses: ExpenseWithId[];
  settlements: SettlementWithId[];
  members: MembershipWithId[];
}

export default function BalancesPage() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [settling, setSettling] = useState<Transfer | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const [expenseSnap, settlementSnap, memberSnap] = await Promise.all([
      getDocs(query(expensesCol(tenantId), limit(MAX_EXPENSES))),
      getDocs(query(settlementsCol(tenantId), limit(MAX_SETTLEMENTS))),
      getDocs(query(membershipsCol(), where("tenantId", "==", tenantId), limit(MAX_MEMBERS))),
    ]);
    return {
      expenses: expenseSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExpenseWithId),
      settlements: settlementSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as SettlementWithId),
      members: memberSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId),
    };
  }, [tenantId]);

  const { data, loading, error, reload } = useLoader(load, "Could not load balances.");

  const expenses = useMemo(() => data?.expenses ?? [], [data]);
  const settlements = useMemo(() => data?.settlements ?? [], [data]);
  const memberList = useMemo(() => data?.members ?? [], [data]);

  const nameFor = useCallback(
    (uid: string) => {
      const m = memberList.find((x) => x.uid === uid);
      return m?.displayName || m?.email || uid;
    },
    [memberList],
  );
  const sideByUid = useMemo(() => {
    const map: Record<string, Side> = {};
    for (const m of memberList) if (m.uid) map[m.uid] = m.side;
    return map;
  }, [memberList]);

  const net = useMemo(() => balances(expenses, settlements), [expenses, settlements]);
  const transfers = useMemo(() => simplifyDebts(net), [net]);

  const recordSettlement = useCallback(
    async (t: Transfer, dateText: string, method: string, note: string) => {
      if (!user) throw new Error("not signed in");
      const date = toTimestamp(dateText) ?? Timestamp.now();
      const fields = {
        fromUid: t.fromUid,
        toUid: t.toUid,
        amountPaise: t.amountPaise,
        date,
        method: method.trim(),
        note: note.trim(),
        createdBy: user.uid,
      };
      const ref = await addDoc(settlementsCol(tenantId), { ...fields, createdAt: serverTimestamp() });
      const next = [...settlements, { id: ref.id, ...fields, createdAt: Timestamp.now() } as SettlementWithId];
      await writeExpenseAggregates(tenantId, expenses, next, sideByUid);
      setSettling(null);
      reload();
    },
    [tenantId, user, expenses, settlements, sideByUid, reload],
  );

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6">
      <PageHeader
        backHref={tenantHref(tenantId, "/budget")}
        title="Balances"
        subtitle="Who owes whom — never the same number as budget health."
      />

      <FormMessage error={error} />

      {loading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : transfers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
          <p className="text-sm text-stone-500">
            Nobody owes anybody anything right now. This only moves once an expense is marked
            paid.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {transfers.map((t, i) => (
            <li
              key={`${t.fromUid}-${t.toUid}-${i}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4"
            >
              <p className="min-w-0 text-sm text-stone-700">
                <span className="font-medium text-stone-800">{nameFor(t.fromUid)}</span>
                {" → "}
                <span className="font-medium text-stone-800">{nameFor(t.toUid)}</span>:{" "}
                <span className="font-semibold">{formatINR(toPaise(t.amountPaise))}</span>
              </p>
              <SecondaryButton onClick={() => setSettling(t)}>Settle up</SecondaryButton>
            </li>
          ))}
        </ul>
      )}

      {settling ? (
        <SettleForm
          transfer={settling}
          nameFor={nameFor}
          onCancel={() => setSettling(null)}
          onConfirm={recordSettlement}
        />
      ) : null}
    </div>
  );
}

function SettleForm({
  transfer,
  nameFor,
  onCancel,
  onConfirm,
}: {
  transfer: Transfer;
  nameFor: (uid: string) => string;
  onCancel: () => void;
  onConfirm: (transfer: Transfer, dateText: string, method: string, note: string) => Promise<void>;
}) {
  const [dateText, setDateText] = useState(dateInputValue(Timestamp.now()));
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(transfer, dateText, method, note);
    } catch (err) {
      console.error("[balances] settlement save failed:", err);
      setError("Could not record that settlement.");
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm font-medium text-stone-800">
        Settle {nameFor(transfer.fromUid)} → {nameFor(transfer.toUid)}:{" "}
        {formatINR(toPaise(transfer.amountPaise))}
      </p>
      <Field label="Date">
        <TextInput type="date" value={dateText} onChange={(e) => setDateText(e.target.value)} />
      </Field>
      <Field label="Method" hint="UPI, cash, bank transfer…">
        <TextInput value={method} onChange={(e) => setMethod(e.target.value)} placeholder="UPI" autoFocus />
      </Field>
      <Field label="Note">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Saving…" : "Confirm"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </SecondaryButton>
      </div>
    </form>
  );
}
