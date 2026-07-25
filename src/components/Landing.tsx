import { SignInButton } from "./SignInButton";

// The signed-out landing screen (PHASE1 Step 4). Not a marketing page — one job:
// make it unmistakable you're in the right place, then get you signed in in one tap.
// Shows both names, the wedding date only if set (omitted, never a placeholder),
// and a single sign-in button. Nothing else competes for attention.

export function Landing({ weddingDate }: { weddingDate?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 bg-gradient-to-b from-rose-50 via-white to-white px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-rose-400">
          The wedding of
        </p>
        <h1 className="font-serif text-5xl leading-tight tracking-tight text-stone-800 sm:text-6xl">
          Shivam <span className="text-rose-400">&amp;</span> Swara
        </h1>
        {/* Wedding date renders only when set — never a placeholder (PHASE1 Step 4). */}
        {weddingDate ? <p className="text-lg text-stone-500">{weddingDate}</p> : null}
      </div>

      <div className="flex w-full flex-col items-center gap-4">
        <SignInButton />
        <p className="max-w-xs text-sm text-stone-400">
          A private space for our family to plan together.
        </p>
      </div>
    </main>
  );
}
