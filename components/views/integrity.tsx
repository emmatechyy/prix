import Link from "next/link";
import type { Snapshot } from "@/lib/snapshot/schema";
import { num, usd } from "@/lib/format";
import { flagText } from "@/lib/copy";
import { SourceIcon } from "@/components/source-icon";

/** Pools we didn't count, with the reason in plain words, and TVL with and without them (published snapshot). */
export function IntegrityView({ s }: { s: Snapshot }) {
  const r = s.rhea;
  const pools = [...r.rejected_pools].sort((a, b) => b.claimed_usd - a.claimed_usd);
  const top = pools.slice(0, 25);
  return (
    <div className="grid gap-4">
      <div className="scroll-x rounded-lg border border-rule bg-surface">
        <table className="data">
          <caption className="sr-only">RHEA TVL with and without the pools PRIX did not count</caption>
          <tbody>
            <tr>
              <th scope="row" className="!static !bg-transparent !text-[15px] !font-normal !text-ink">TVL (verified pools)</th>
              <td className="r num font-semibold">{usd(r.clean_tvl_usd)}</td>
            </tr>
            <tr>
              <th scope="row" className="!static !bg-transparent !text-[15px] !font-normal !text-ink">TVL if every pool were counted</th>
              <td className="r num">{usd(r.unfiltered_tvl_usd)}</td>
            </tr>
            <tr>
              <th scope="row" className="!static !bg-transparent !text-[15px] !font-normal !text-ink">Pools we didn’t count</th>
              <td className="r num">
                {num(r.rejected_count)} pools, {r.clean_tvl_usd != null && r.unfiltered_tvl_usd != null ? usd(r.unfiltered_tvl_usd - r.clean_tvl_usd) : "Not reported"} claimed
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="measure text-[15px] text-slate">
        Same reserves and prices; only the integrity rules differ. From snapshot{" "}
        <a href={`/api/v1/snapshots/${s.date}`} className="num text-ink underline underline-offset-4">
          {s.date}
        </a>
        . <Link href="/method#integrity" className="text-ink underline underline-offset-4">The rules</Link>.
      </p>
      <div className="scroll-x rounded-lg border border-rule bg-surface">
        <table className="data">
          <caption className="sr-only">Largest pools PRIX did not count, with the reason</caption>
          <thead>
            <tr>
              <th scope="col">Pool</th>
              <th scope="col" className="r">Claimed value</th>
              <th scope="col">Why we didn’t count it</th>
              <th scope="col"><span className="sr-only">Source</span></th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="text-ink">{p.pair}</span>
                  <span className="num block text-[13px] text-slate">pool {p.id.length > 14 ? `${p.id.slice(0, 12)}…` : p.id}</span>
                </td>
                <td className="r num">{usd(p.claimed_usd)}</td>
                <td>
                  <ul className="grid max-w-[44ch] gap-0.5 text-[15px] whitespace-normal">
                    {p.reasons.map((x) => (
                      <li key={x}>{flagText(x)}</li>
                    ))}
                  </ul>
                </td>
                <td>
                  <SourceIcon href="https://api.rhea.finance/list-top-pools" name={`pool ${p.pair}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pools.length > top.length && (
        <p className="text-[15px] text-slate">
          Showing the {top.length} largest of {num(pools.length)}. The full list is in the{" "}
          <a href="/api/v1/integrity" className="text-ink underline underline-offset-4">
            integrity API
          </a>
          .
        </p>
      )}
    </div>
  );
}
