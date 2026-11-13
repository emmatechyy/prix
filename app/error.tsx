"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="appear mx-auto max-w-xl py-16 text-center">
      <p className="text-[17px] text-danger">A data source failed while building this page</p>
      <h1 className="display mt-4 text-[44px] text-text sm:text-[56px]">Nothing shown rather than a guess.</h1>
      <p className="mt-4 text-[16px] leading-[1.6] text-muted">PRIX does not show estimated numbers in place of missing ones. Try again in a moment.</p>
      {error.digest && <p className="num mt-3 text-[13px] text-faint">ref {error.digest}</p>}
      <button onClick={reset} className="mt-8 rounded-full bg-accent px-7 py-4 text-[16px] leading-5 font-medium text-on-accent transition-colors duration-300 hover:bg-accent-hover">
        Retry
      </button>
    </div>
  );
}
