"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="measure py-12">
      <h1 className="font-serif text-[28px] leading-[1.2] text-ink">Couldn’t load this page.</h1>
      <p className="mt-3 text-[17px] text-ink">A data source didn’t answer while the page was being built. PRIX shows nothing rather than a guess.</p>
      <p className="mt-2 text-[17px] text-slate">
        The verdicts and the method are unaffected: <Link href="/" className="text-ink underline underline-offset-4">Verdicts</Link> · <Link href="/method" className="text-ink underline underline-offset-4">Method</Link>.
      </p>
      <button onClick={reset} className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-ink px-5 text-[15px] font-medium text-paper">
        Try again
      </button>
    </div>
  );
}
