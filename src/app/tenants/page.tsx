"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDoc, getDocs, limit, query, serverTimestamp, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useMemberships } from "@/lib/tenants/MembershipsProvider";
import { tenantHref } from "@/lib/tenants/TenantProvider";
import { membershipDoc, slugifyTenantName, tenantDoc, tenantsCol } from "@/lib/paths";
import { LoadingScreen } from "@/components/LoadingScreen";
import { NotInvited } from "@/components/NotInvited";
import type { MembershipWithId, TenantWithId } from "@/types";

// The wedding picker — weddingHQ's own screen, outside any single wedding.
//
// Family members with two weddings see just their two. A global admin also sees
// every wedding in the system and can create a new one. Someone with exactly one
// wedding is normally routed straight past this screen by "/".

/** READ COST: bounded per CLAUDE.md §3. Admin-only listing; the collection grows
 *  by one document per wedding, so 50 is far beyond any real use. */
const MAX_TENANTS = 50;

/** Admin-only. firestore.rules splits `get` from `list` on tenants, so this call
 *  is denied for everyone else and is never made for them. */
async function fetchAllTenants(): Promise<TenantWithId[]> {
  const snap = await getDocs(query(tenantsCol(), limit(MAX_TENANTS)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TenantWithId);
}

/** A non-admin can't list tenants, so their cards are labelled from the tenant
 *  documents they *can* read — one bounded get each, at most a handful. */
async function fetchTenantNames(tenantIds: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    tenantIds.map(async (id) => {
      try {
        const snap = await getDoc(tenantDoc(id));
        return [id, (snap.data()?.name as string | undefined) ?? id] as const;
      } catch {
        return [id, id] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

export default function TenantsPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { memberships, loading: membershipsLoading, refresh } = useMemberships();
  const router = useRouter();

  const [allTenants, setAllTenants] = useState<TenantWithId[] | null>(null);
  const [tenantNames, setTenantNames] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  const myTenantIds = useMemo(() => memberships.map((m) => m.tenantId), [memberships]);
  const myTenantKey = myTenantIds.join(",");

  useEffect(() => {
    if (authLoading || membershipsLoading || !user) return;
    let cancelled = false;

    void (async () => {
      try {
        if (isAdmin) {
          const rows = await fetchAllTenants();
          if (cancelled) return;
          setAllTenants(rows);
          setTenantNames(Object.fromEntries(rows.map((t) => [t.id, t.name])));
        } else {
          const names = await fetchTenantNames(myTenantIds);
          if (cancelled) return;
          setTenantNames(names);
        }
      } catch (err) {
        console.error("[tenants] listing failed:", err);
        if (!cancelled) setAllTenants([]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // myTenantKey stands in for myTenantIds, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, membershipsLoading, user, isAdmin, myTenantKey, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
    refresh();
  }, [refresh]);

  const mine = useMemo(
    () =>
      memberships.map((m) => ({
        membership: m,
        name: tenantNames[m.tenantId] ?? m.tenantId,
      })),
    [memberships, tenantNames],
  );

  const othersForAdmin = useMemo(() => {
    if (!isAdmin || !allTenants) return [];
    const mineIds = new Set(memberships.map((m) => m.tenantId));
    return allTenants.filter((t) => !mineIds.has(t.id));
  }, [isAdmin, allTenants, memberships]);

  if (authLoading || membershipsLoading) return <LoadingScreen />;
  if (!user) return <LoadingScreen />;
  if (memberships.length === 0 && !isAdmin) return <NotInvited />;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl tracking-tight text-stone-800">
            wedding<span className="text-rose-400">HQ</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {mine.length > 0 ? "Choose a wedding to plan." : "You're signed in as an admin."}
          </p>
        </div>
        <SignOutLink />
      </header>

      {mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Your weddings</SectionLabel>
          {mine.map(({ membership, name }) => (
            <WeddingCard
              key={membership.tenantId}
              tenantId={membership.tenantId}
              name={name}
              membership={membership}
            />
          ))}
        </section>
      ) : null}

      {isAdmin ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>All weddings (admin)</SectionLabel>
          {allTenants === null ? (
            <p className="text-sm text-stone-400">Loading…</p>
          ) : othersForAdmin.length === 0 ? (
            <p className="text-sm text-stone-400">
              {mine.length > 0
                ? "No other weddings yet."
                : "No weddings yet — create the first one below."}
            </p>
          ) : (
            othersForAdmin.map((t) => (
              <WeddingCard key={t.id} tenantId={t.id} name={t.name} membership={null} />
            ))
          )}
          <NewWeddingForm onCreated={reload} />
        </section>
      ) : null}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wide text-stone-400 uppercase">{children}</h2>
  );
}

function SignOutLink() {
  const { signOutUser } = useAuth();
  return (
    <button
      onClick={signOutUser}
      className="min-h-[44px] shrink-0 px-2 text-sm font-medium text-stone-500 hover:text-stone-800"
    >
      Sign out
    </button>
  );
}

function WeddingCard({
  tenantId,
  name,
  membership,
}: {
  tenantId: string;
  name: string;
  membership: MembershipWithId | null;
}) {
  return (
    <Link
      href={tenantHref(tenantId, "/home")}
      className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 transition-colors active:bg-stone-50"
    >
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-stone-800">{name}</p>
        <p className="truncate text-xs text-stone-400">
          {membership
            ? membership.role === "couple"
              ? "You're the couple"
              : "Family"
            : "Admin access"}
        </p>
      </div>
      <span aria-hidden className="text-stone-300">
        ›
      </span>
    </Link>
  );
}

/** Admin-only. Creates the wedding and immediately makes the creator its couple,
 *  so a brand-new wedding is never a document nobody can reach. */
function NewWeddingForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = slugifyTenantName(name);
  const valid = name.trim() && sideA.trim() && sideB.trim() && id.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !user?.email || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The id is derived from the name, so two weddings with similar names can
      // collide. Refuse rather than silently overwriting an existing wedding.
      if ((await getDoc(tenantDoc(id))).exists()) {
        setError(`A wedding already uses the address /t/${id}. Try a more specific name.`);
        return;
      }
      await setDoc(tenantDoc(id), {
        name: name.trim(),
        sideA: { label: sideA.trim() },
        sideB: { label: sideB.trim() },
        weddingDate: null,
        archived: false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      // Two writes, not one transaction: Firestore rules evaluate each write
      // separately anyway, and the membership write depends on the admin flag
      // rather than on the tenant existing.
      await setDoc(membershipDoc(id, user.email), {
        tenantId: id,
        email: user.email.toLowerCase(),
        role: "couple",
        side: "a",
        displayName: user.displayName ?? null,
        invitedBy: user.uid,
        invitedAt: serverTimestamp(),
        uid: user.uid,
        lastSeenAt: serverTimestamp(),
      });
      setName("");
      setSideA("");
      setSideB("");
      setOpen(false);
      onCreated();
    } catch (err) {
      console.error("[tenants] create failed:", err);
      setError("Could not create the wedding. Check that you're still an admin.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="min-h-[52px] rounded-2xl border border-dashed border-stone-300 px-4 text-base font-medium text-stone-500 active:bg-stone-50"
      >
        + New wedding
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4"
    >
      <Field label="Wedding name" value={name} onChange={setName} placeholder="Shivam & Swara" />
      <Field label="First side" value={sideA} onChange={setSideA} placeholder="Shivam" />
      <Field label="Second side" value={sideB} onChange={setSideB} placeholder="Swara" />
      {id ? <p className="text-xs text-stone-400">Address: /t/{id}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid || busy}
          className="min-h-[48px] flex-1 rounded-full bg-rose-500 px-4 text-base font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create wedding"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[48px] rounded-full px-4 text-base font-medium text-stone-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[48px] rounded-xl border border-stone-300 px-3 text-base text-stone-800 outline-none focus:border-rose-400"
      />
    </label>
  );
}
