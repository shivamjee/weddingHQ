// Remembers the last wedding opened ON THIS DEVICE, purely so the signed-out
// landing screen can greet a returning family member by name instead of showing
// them a generic product page.
//
// This is a display convenience, not an access decision — nothing here is
// trusted. A tampered value can at most put the wrong name on the landing
// screen; every actual read is still gated by firestore.rules.

const KEY = "weddinghq:lastTenant";

interface LastTenant {
  id: string;
  name: string;
}

export function rememberLastTenant(id: string, name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ id, name } satisfies LastTenant));
  } catch {
    // Private browsing / storage disabled — the greeting is optional.
  }
}

export function readLastTenant(): LastTenant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastTenant>;
    return typeof parsed.id === "string" && typeof parsed.name === "string"
      ? { id: parsed.id, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

export function readLastTenantName(): string | null {
  return readLastTenant()?.name ?? null;
}

export function forgetLastTenant(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
