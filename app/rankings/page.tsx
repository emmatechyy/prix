import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, Delta, Flags, PageHeader, ScoreBar, SourceError, Sources, TokenLink, Badge } from "@/components/ui";
import { DEPTH_TRADE_USD, getIndex, UNIVERSE_MAX, UNIVERSE_MIN_LIQUIDITY, WEIGHTS, type IndexRow } from "@/lib/model/index-model";
import { pct, price, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;
export const metadata: Metadata = { title: "PRIX Index" };

function Pill({ s }: { s: number | null }) {
  if (s == null) return <span className="text-[11px] text-faint">n/r</span>;
  const c = s >= 60 ? "text-accent" : s >= 35 ? "text-warn" : "text-danger";
  return <span className={`num text-xs ${c}`}>{s.toFixed(0)}</span>;
}

function Row({ r }: { r: IndexRow }) {
  return (
    <tr>
      <td className="num text-faint">{r.rank ?? "—"}</td>
      <td><TokenLink id={r.id} symbol={r.symbol} sub={r.name !== r.symbol ? r.name : r.id} /></td>
      <td><Badge>{r.sector}</Badge></td>
      <td><ScoreBar score={r.score} /></td>
      <td className="r"><Pill s={r.pillars.depth.score} /></td>
      <td className="r"><Pill s={r.pillars.activity.score} /></td>
      <td className="r"><Pill s={r.pillars.distribution.score} /></td>
      <td className="r"><Pill s={r.pillars.flow.score} /></td>
      <td className="r num text-muted">{Math.round(r.confidence * 100)}%</td>
      <td className="r num">{price(r.price)}</td>
      <td className="r"><Delta v={r.change24h} /></td>
      <td className="r num">{usd(r.liquidity)}</td>
      <td className="r num">{usd(r.volume24h)}</td>
      <td className="r num">{r.depth.impact == null ? <span className="text-faint">not reported</span> : pct(r.depth.impact)}</td>
      <td className="r num">{r.holders.top10Share == null ? <span className="text-faint">not reported</span> : pct(r.holders.top10Share, 1)}</td>
      <td className="r">{r.flow?.pressure == null ? <span className="text-faint">not reported</span> : <Delta v={r.flow.pressure} digits={0} />}</td>
      <td><Flags flags={r.flags} max={2} /></td>
    </tr>
  );
}

export default async function Rankings() {
  const idx = await safe(getIndex);
  return (
    <>
      <PageHeader eyebrow="PRIX Index" title="NEAR tokens ranked by evidence, not narrative">
        Universe: non-stablecoin tokens with at least {usd(UNIVERSE_MIN_LIQUIDITY)} of verified liquidity on RHEA, top {UNIVERSE_MAX} by liquidity. Each score is 0–100; pillar weights are depth {WEIGHTS.depth * 100}%, activity {WEIGHTS.activity * 100}%, distribution {WEIGHTS.distribution * 100}%, flow {WEIGHTS.flow * 100}%. Tokens with under half the weight available are listed but not ranked. <Link href="/methodology" className="text-info hover:underline">Methodology</Link>.
      </PageHeader>
      {!idx.ok ? (
        <SourceError what="The PRIX Index" error={idx.e} />
      ) : (
        <Card>
          <CardHeader title={`${idx.v.rows.filter((r) => r.rank != null).length} ranked · ${idx.v.rows.filter((r) => r.rank == null).length} insufficient evidence`} subtitle={`Snapshot ${utc(idx.v.asOf)}. Depth = price impact + fees selling $${DEPTH_TRADE_USD.toLocaleString()} into USDC. Top-10 = share of float held by the 10 largest non-custody accounts. Flow = net buy pressure in the last 50 swaps.`} right={<a href="/api/v1/index" className="text-info hover:underline">JSON ↗</a>} />
          <div className="scroll-x max-h-[75vh]">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th><th>Token</th><th>Sector</th><th>PRIX score</th>
                  <th className="r" title="Depth pillar">Dep</th><th className="r" title="Activity pillar">Act</th><th className="r" title="Distribution pillar">Dist</th><th className="r" title="Flow pillar">Flow</th>
                  <th className="r">Conf.</th><th className="r">Price</th><th className="r">24h</th><th className="r">Liquidity</th><th className="r">24h vol</th><th className="r">$10k impact</th><th className="r">Top-10</th><th className="r">Buy pressure</th><th>Flags</th>
                </tr>
              </thead>
              <tbody>{idx.v.rows.map((r) => <Row key={r.id} r={r} />)}</tbody>
            </table>
          </div>
          <Sources urls={["https://api.rhea.finance/list-top-pools", "https://smartrouter.rhea.finance/findPath", "https://api.fastnear.com/v1/ft/<token>/top", "https://api.rhea.finance/get-recent-transaction-swap"]} note="n/r = not reported" />
        </Card>
      )}
    </>
  );
}
