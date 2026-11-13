import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="num text-xs text-faint">404</p>
      <h1 className="mt-2 text-xl font-semibold">Not in PRIX&apos;s data</h1>
      <p className="mt-2 text-sm text-muted">The page or token contract was not found in RHEA&apos;s token list or pools.</p>
      <Link href="/rankings" className="mt-6 inline-block text-sm text-info hover:underline">Browse the PRIX Index →</Link>
    </div>
  );
}
