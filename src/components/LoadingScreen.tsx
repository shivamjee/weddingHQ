// A branded, non-blank loading state. The gap between tapping sign-in and
// reaching the app must NOT be a blank white screen — non-technical users read
// blank as broken.

export function LoadingScreen({ message = "Just a moment…" }: { message?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-b from-rose-50 to-white px-6 text-center">
      <p className="font-serif text-3xl tracking-tight text-stone-800">
        wedding<span className="text-rose-400">HQ</span>
      </p>
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500"
        role="status"
        aria-label="Loading"
      />
      <p className="text-base text-stone-500">{message}</p>
    </main>
  );
}
