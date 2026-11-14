import Link from "next/link";
import { Delta, Flags, SourceError, TokenLink } from "@/components/ui";
import { SourceIcon } from "@/components/source-icon";
import { getIndex, UNIVERSE_MAX, UNIVERSE_MIN_LIQUIDITY, WEIGHTS, type IndexRow } from "@/lib/model/index-model";
import { pct, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

const SORTS = {
  score: { label: "Score", get: (r: IndexRow) => r.score, dir: -1 },
  liquidity: { label: "Liquidity", get: (r: IndexRow) => r.liquidity, dir: -1 },
  cost: { label: "Cost to trade $10k", get: (r: IndexRow) => r.rules.bestImpact10k, dir: 1 },
  change: { label: "24h change", get: (r: IndexRow) => r.change24h, dir: -1 },
} as const;
type SortKey = keyof typeof SORTS;

/** Full ring = high confidence (measured depth, liquidity above the floor); dashed ring = low. */
function ConfidenceMark({ high, why }: { high: boolean; why: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={high ? "High confidence" : `Low confidence: ${why}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray={high ? undefined : "2.4 2"} />
        {high && <circle cx="7" cy="7" r="2.4" fill="var(--ink)" />}
      </svg>
      <span className="sr-only">{high ? "high confidence" : `low confidence (${why})`}</span>
    </span>
  );
}

function SortHead({ k, sort, low, className = "" }: { k: SortKey; sort: SortKey; low: boolean; className?: string }) {
  const on = k === sort;
  const q = new URLSearchParams();
  if (k !== "score") q.set("sort", k);
  if (low) q.set("low", "1");
  const href = `/tokens${q.size ? `?${q}` : ""}`;
  return (
    <th scope="col" aria-sort={on ? (SORTS[k].dir === 1 ? "ascending" : "descending") : "none"} className={className}>
      <Link href={href} scroll={false} className={`inline-flex min-h-11 items-center gap-1 ${on ? "font-semibold text-ink" : ""}`}>
        {SORTS[k].label}
        <span aria-hidden>{on ? (SORTS[k].dir === 1 ? "↑" : "↓") : ""}</span>
      </Link>
    </th>
  );
}

export async function RankingView({ showLow = false, sort: sortParam }: { showLow?: boolean; sort?: string }) {
  const idx = await safe(getIndex);
  if (!idx.ok) return <SourceError what="the token ranking" error={idx.e} />;
  const sort: SortKey = sortParam && sortParam in SORTS ? (sortParam as SortKey) : "score";
  const S = SORTS[sort];
  const cmp = (a: IndexRow, b: IndexRow) => {
    const x = S.get(a), y = S.get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * S.dir;
  };
  // Low-confidence tokens are never ranked above measured ones, whatever the sort.
  const high = idx.v.rows.filter((r) => r.rules.confidence === "high").sort(cmp);
  const low = idx.v.rows.filter((r) => r.rules.confidence !== "high").sort(cmp);
  const rows = showLow ? [...high, ...low] : high;
  const toggle = new URLSearchParams();
  if (sort !== "score") toggle.set("sort", sort);
  if (!showLow) toggle.set("low", "1");
  return (
    <>
      <p className="measure mb-4 text-[15px] text-slate">
        Score 0–100: cost to trade {WEIGHTS.depth * 100}%, activity {WEIGHTS.activity * 100}%, holder spread {WEIGHTS.distribution * 100}%, flow {WEIGHTS.flow * 100}%. Universe: tokens with at least {usd(UNIVERSE_MIN_LIQUIDITY)} of verified liquidity, top {UNIVERSE_MAX}. Live {utc(idx.v.asOf)}.{" "}
        <Link href="/method#index" className="text-ink underline underline-offset-4">How the score works</Link>.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={`/tokens${toggle.size ? `?${toggle}` : ""}`} scroll={false} className="inline-flex min-h-11 items-center gap-2 rounded-[20px] bg-surface px-3 text-[15px] text-ink hover:bg-wash">
          <span className={`inline-block h-4 w-7 rounded-full border border-ink p-[1px] ${showLow ? "bg-ink" : ""}`} aria-hidden>
            <span className={`block h-full w-3 rounded-full ${showLow ? "translate-x-3 bg-paper" : "bg-ink"}`} />
          </span>
          {showLow ? "Hide" : "Show"} low-confidence tokens ({low.length})
        </Link>
        <span className="text-[13px] text-slate">
          {high.length} measured · low confidence = liquidity under {usd(idx.v.rules.min_liquidity_usd)}, cost to trade $10k over {(idx.v.rules.max_price_impact_10k * 100).toFixed(0)}%, or no measured depth
        </span>
      </div>
      <div tabIndex={0} className="scroll-x max-h-[75vh] rounded-[20px] bg-surface">
        <table className="data">
          <caption className="sr-only">Tokens ranked by PRIX score, sorted by {S.label.toLowerCase()}</caption>
          <thead>
            <tr>
              <th scope="col">Token</th>
              <SortHead k="score" sort={sort} low={showLow} />
              <SortHead k="liquidity" sort={sort} low={showLow} className="r" />
              <SortHead k="cost" sort={sort} low={showLow} className="r hidden md:table-cell" />
              <SortHead k="change" sort={sort} low={showLow} className="r hidden md:table-cell" />
              <th scope="col" className="hidden md:table-cell">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <TokenLink id={r.id} symbol={r.symbol} sub={r.sector} />
                </td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <ConfidenceMark high={r.rules.confidence === "high"} why={r.rules.reasons.join("; ") || "missing data"} />
                    <span className="num text-ink">{r.score == null ? <span className="text-slate">Not reported</span> : r.score.toFixed(1)}</span>
                  </span>
                </td>
                <td className="r num">{usd(r.liquidity)}</td>
                <td className="r num hidden md:table-cell" title={r.rules.bestRoute ?? undefined}>
                  {r.rules.bestImpact10k == null ? <span className="text-slate">Not reported</span> : pct(r.rules.bestImpact10k)}
                </td>
                <td className="r hidden md:table-cell">
                  <Delta v={r.change24h} />
                </td>
                <td className="hidden md:table-cell">
                  <Flags flags={r.flags} max={2} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[13px] text-slate">
        Sources: RHEA pools, RHEA Smart Router, NEAR Intents 1Click quotes, FastNEAR holders, RHEA swaps.
        <SourceIcon href="/api/v1/index" name="the whole ranking (JSON)" />
      </p>
    </>
  );
}
