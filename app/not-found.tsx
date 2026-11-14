import Link from "next/link";

export default function NotFound() {
  return (
    <div className="measure py-12">
      <h1 className="font-serif text-[28px] leading-[1.2] text-ink">Not in PRIX’s data</h1>
      <p className="mt-3 text-[17px] text-slate">This page, or this token contract, isn’t in RHEA’s token list or pools.</p>
      <p className="mt-4">
        <Link href="/tokens" className="inline-flex min-h-11 items-center rounded-lg bg-ink px-5 text-[15px] font-medium text-paper">
          Browse tokens
        </Link>
      </p>
    </div>
  );
}
