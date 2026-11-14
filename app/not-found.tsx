import { PillLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className=" mx-auto max-w-xl py-16 text-center">
      <p className="text-[17px] text-muted">404</p>
      <h1 className="display mt-4 text-[48px] text-text sm:text-[72px]">Not in PRIX&apos;s data</h1>
      <p className="mt-4 text-[16px] leading-[1.6] text-muted">The page or token contract was not found in RHEA&apos;s token list or pools.</p>
      <div className="mt-8"><PillLink href="/tokens">Browse tokens</PillLink></div>
    </div>
  );
}
