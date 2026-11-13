"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-danger/30 bg-danger/5 p-6">
      <h1 className="font-semibold text-danger">A data source failed while building this page</h1>
      <p className="mt-2 text-sm text-muted">PRIX does not show estimated numbers in place of missing ones. Try again in a moment.</p>
      {error.digest && <p className="num mt-2 text-xs text-faint">ref {error.digest}</p>}
      <button onClick={reset} className="mt-4 rounded-md border border-border-strong px-3 py-1.5 text-sm hover:border-accent hover:text-accent">Retry</button>
    </div>
  );
}
