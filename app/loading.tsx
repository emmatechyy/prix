export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading live on-chain data…</span>
      <div className="h-8 w-40 rounded-full bg-tint-strong" />
      <div className="mt-6 h-14 w-3/4 rounded-[16px] bg-tint-strong sm:h-20" />
      <div className="mt-3 h-5 w-1/2 rounded-full bg-tint" />
      <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-[16px] bg-surface" />)}
      </div>
      <div className="mt-4 h-80 rounded-[20px] bg-surface" />
    </div>
  );
}
