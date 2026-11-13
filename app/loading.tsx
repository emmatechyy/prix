export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse space-y-4">
      <span className="sr-only">Loading live on-chain data…</span>
      <div className="h-3 w-28 rounded bg-surface-2" />
      <div className="h-7 w-2/3 rounded bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-lg border border-border bg-surface" />)}
      </div>
      <div className="h-80 rounded-lg border border-border bg-surface" />
    </div>
  );
}
