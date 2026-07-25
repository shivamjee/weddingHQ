"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useTenant } from "@/lib/tenants/TenantProvider";
import { membershipDoc, membershipsCol } from "@/lib/paths";
import type { MembershipWithId, Role, Side } from "@/types";

// "More" — for now, the people in this wedding. Phase 2 adds Setup (categories,
// events) and currency settings alongside it.
//
// Inviting someone is a single write of memberships/{tenantId}__{email}: they
// can be invited before they have ever opened the app, and the moment they sign
// in with that Google account they are in. Nobody grants themselves anything.

/** READ COST: bounded per CLAUDE.md §3. This app tops out around 15 people. */
const MAX_MEMBERS = 50;

/** Pure loader — no React state, so the effect below can simply await it. */
async function fetchMembers(tenantId: string): Promise<MembershipWithId[]> {
  const snap = await getDocs(
    query(membershipsCol(), where("tenantId", "==", tenantId), limit(MAX_MEMBERS)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MembershipWithId);
}

export default function MorePage() {
  const { user } = useAuth();
  const { tenantId, tenant, canWrite, sideLabel } = useTenant();
  const [members, setMembers] = useState<MembershipWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMembers(tenantId);
        if (cancelled) return;
        setMembers(rows);
        setError(null);
      } catch (err) {
        console.error("[more] member list failed:", err);
        if (cancelled) return;
        setMembers([]);
        setError("Could not load the people in this wedding.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-5 py-6">
      <section className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">People</h1>
          <p className="mt-1 text-sm text-stone-500">
            Everyone who can see {tenant?.name ?? "this wedding"}.
          </p>
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        {members === null ? (
          <p className="text-sm text-stone-400">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-stone-800">
                    {m.displayName?.trim() || m.email}
                  </p>
                  <p className="truncate text-xs text-stone-400">
                    {sideLabel(m.side)}&rsquo;s side
                    {m.role === "couple" ? " · couple" : ""}
                    {m.uid ? "" : " · not signed in yet"}
                  </p>
                </div>
                {canWrite && m.email !== user?.email?.toLowerCase() ? (
                  <RemoveButton
                    email={m.email}
                    tenantId={tenantId}
                    onRemoved={reload}
                    onError={setError}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canWrite ? <InviteForm onInvited={reload} /> : null}
      </section>

      <section className="rounded-2xl bg-stone-100 px-4 py-4">
        <h2 className="text-sm font-semibold text-stone-700">Coming next</h2>
        <p className="mt-1 text-sm text-stone-500">
          Categories and events setup, and currency display settings, will live here in Phase 2.
        </p>
      </section>
    </div>
  );
}

function RemoveButton({
  email,
  tenantId,
  onRemoved,
  onError,
}: {
  email: string;
  tenantId: string;
  onRemoved: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        // Removing access is disruptive and easy to fumble on a phone — confirm.
        if (!window.confirm(`Remove ${email} from this wedding?`)) return;
        setBusy(true);
        try {
          await deleteDoc(membershipDoc(tenantId, email));
          onRemoved();
        } catch (err) {
          console.error("[more] remove failed:", err);
          onError(`Could not remove ${email}.`);
        } finally {
          setBusy(false);
        }
      }}
      className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-400 hover:text-rose-600"
    >
      Remove
    </button>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const { user } = useAuth();
  const { tenantId, sideLabel } = useTenant();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side>("a");
  const [role, setRole] = useState<Role>("family");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const clean = email.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy || !user) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      // Deterministic id, so inviting the same person twice updates rather than
      // creating a duplicate.
      await setDoc(membershipDoc(tenantId, clean), {
        tenantId,
        email: clean,
        role,
        side,
        displayName: name.trim() || null,
        invitedBy: user.uid,
        invitedAt: serverTimestamp(),
        uid: null,
        lastSeenAt: null,
      });
      setDone(`${clean} can now sign in.`);
      setEmail("");
      setName("");
      onInvited();
    } catch (err) {
      console.error("[more] invite failed:", err);
      setError("Could not send that invitation. Only the couple can invite people.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-stone-700">Invite someone</h2>
      <p className="-mt-2 text-xs text-stone-400">
        They sign in with this Google address — no password to share.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-stone-500">Email</span>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="mum@gmail.com"
          className="min-h-[48px] rounded-xl border border-stone-300 px-3 text-base text-stone-800 outline-none focus:border-rose-400"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-stone-500">Name (optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mum"
          className="min-h-[48px] rounded-xl border border-stone-300 px-3 text-base text-stone-800 outline-none focus:border-rose-400"
        />
      </label>

      {/* Chip rows, not dropdowns — easier to hit and to read at a glance. */}
      <ChipRow
        label="Side"
        options={[
          { value: "a", label: sideLabel("a") },
          { value: "b", label: sideLabel("b") },
        ]}
        value={side}
        onChange={(v) => setSide(v as Side)}
      />
      <ChipRow
        label="Role"
        options={[
          { value: "family", label: "Family" },
          { value: "couple", label: "Couple (can edit)" },
        ]}
        value={role}
        onChange={(v) => setRole(v as Role)}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {done ? <p className="text-sm text-emerald-700">{done}</p> : null}

      <button
        type="submit"
        disabled={!valid || busy}
        className="min-h-[48px] rounded-full bg-rose-500 px-4 text-base font-semibold text-white disabled:opacity-40"
      >
        {busy ? "Inviting…" : "Invite"}
      </button>
    </form>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors ${
              value === o.value
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-stone-300 text-stone-600"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
