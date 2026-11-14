import { Card, CardHeader, Empty, Flags, PageHeader, ScoreBar, SourceError, Sources, TokenLink, Badge } from "@/components/ui";
import { getLaunches, LAUNCH_WEIGHTS } from "@/lib/model/launches";
import { ago, explorer, num, pct, price, shortId, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";




function C({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[13px] text-slate">Not reported</span>;
  return <span className={`num text-xs ${v >= 60 ? " text-ink" : v >= 35 ? " text-ink" : " text-ink"}`}>{v.toFixed(0)}</span>;
}

export async function LaunchesView() {
  const l = await safe(getLaunches);
  return (
    <>
      <PageHeader eyebrow="Launch radar" title="New NEAR tokens, scored before you look at the chart">
        PRIX scans the newest RHEA pools (highest AMM pool ids and the most recently listed DCL pools), keeps those with at least $1k of verified liquidity, and scores each token on liquidity ({LAUNCH_WEIGHTS.liquidity * 100}%), holder distribution ({LAUNCH_WEIGHTS.distribution * 100}%), 24h activity ({LAUNCH_WEIGHTS.activity * 100}%) and maturity ({LAUNCH_WEIGHTS.maturity * 100}%). Creator = signer of the transaction that created the token account.
      </PageHeader>
      {!l.ok ? (
        <SourceError what="Launch radar" error={l.e} />
      ) : (
        <Card>
          <CardHeader title={`${l.v.launches.length} launches scored`} subtitle={`Snapshot ${utc(l.v.asOf)} · scanned ${l.v.scanned.amm} AMM + ${l.v.scanned.dcl} DCL pools · ${l.v.scanned.candidates} candidates with ≥$1k verified liquidity; deepest ${l.v.launches.length} scored. Newest first.`} right={<a href="/api/v1/launches" className="text-accent hover:underline">JSON ↗</a>} />
          {l.v.launches.length ? (
            <div tabIndex={0} className="scroll-x">
              <table className="data">
                <thead>
                  <tr><th>Token</th><th>Created</th><th>Creator</th><th>Score</th><th className="r">Liq</th><th className="r">Dist</th><th className="r">Act</th><th className="r">Age</th><th className="r">Pool TVL</th><th className="r">24h vol</th><th className="r">Holders</th><th className="r">Top-10</th><th className="r">Price</th><th>Flags</th></tr>
                </thead>
                <tbody>
                  {l.v.launches.map((x) => (
                    <tr key={x.token}>
                      <td><TokenLink id={x.token} symbol={x.symbol} sub={x.token} /></td>
                      <td className="num text-muted">{x.createdAt ? <span title={new Date(x.createdAt).toISOString()}>{ago(x.createdAt)}</span> : <span className="text-faint">Not reported</span>}</td>
                      <td>{x.creator ? <a href={explorer.account(x.creator)} target="_blank" rel="noreferrer" className="num hover:text-accent" title={x.creator}>{shortId(x.creator, 14)}</a> : <span className="text-faint">not resolved</span>}</td>
                      <td><ScoreBar score={x.score} size="sm" /></td>
                      <td className="r"><C v={x.components.liquidity} /></td>
                      <td className="r"><C v={x.components.distribution} /></td>
                      <td className="r"><C v={x.components.activity} /></td>
                      <td className="r"><C v={x.components.maturity} /></td>
                      <td className="r num">{usd(x.pool.tvl)} <Badge>{x.pool.kind}</Badge></td>
                      <td className="r num">{x.pool.volume24h == null ? <span className="text-faint">Not reported</span> : usd(x.pool.volume24h)}</td>
                      <td className="r num">{x.holdersCapped ? "100+" : x.holders == null ? <span className="text-faint">Not reported</span> : num(x.holders)}</td>
                      <td className="r num">{x.top10Share == null ? <span className="text-faint">Not reported</span> : pct(x.top10Share, 1)}</td>
                      <td className="r num">{price(x.price)}</td>
                      <td><Flags flags={x.flags} max={2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No new pools with verified liquidity">Recent pools all fell below $1k or failed integrity checks.</Empty>
          )}
          <Sources urls={l.v.sources} note="Score is re-weighted over available components." />
        </Card>
      )}
    </>
  );
}
