import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge, Card, CardHeader, Flags, ScoreBar, SourceError, SourceLink, Stat, STAT_GRID } from "@/components/ui";
import { LineChart } from "@/components/svg-chart";
import { CostChart } from "@/components/cost-chart";
import { getPublished } from "@/lib/server/published";
import { getTokenDetail, WEIGHTS, type Pillar } from "@/lib/model/index-model";
import { explorer, num, pct, price, shortId, usd, utc } from "@/lib/format";

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = decodeURIComponent(id);
  return { title: `${t} · Tokens`, description: `PRIX evidence for ${t}: score, confidence, cost to trade from $1k to $1M on NEAR Intents and RHEA, liquidity, holders and flags.` };
}

const PILLAR_NAME: Record<Pillar, string> = { depth: "Depth", activity: "Activity", distribution: "Distribution", flow: "Flow" };

function fmtInput(label: string, v: string | number | null) {
  if (v == null) return <span className="text-faint">not reported</span>;
  if (typeof v === "string") return v;
  if (/\(USD\)/.test(label)) return usd(v);
  if (/share|impact|change|pressure|Turnover|vs prior|Round-trip/i.test(label)) return /Turnover/.test(label) ? `${v.toFixed(2)}×` : pct(v, 2);
  return num(v);
}

export default async function TokenPage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  let d: Awaited<ReturnType<typeof getTokenDetail>>;
  try {
    d = await getTokenDetail(id);
  } catch (e) {
    return <SourceError what="Token data" error={e instanceof Error ? e.message : "error"} />;
  }
  if (!d) notFound();
  const { token: t, row: r } = d;
  const { snapshot: snap } = await getPublished();
  const high = r?.rules.confidence === "high";
  const ld = { "@context": "https://schema.org", "@type": "Dataset", name: `PRIX evidence for ${t.symbol}`, description: `Score, cost to trade, liquidity and holders for ${t.name} (${t.id}) on NEAR`, url: `https://prix-orcin.vercel.app/token/${encodeURIComponent(t.id)}`, dateModified: d.market.asOf };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-[15px]">
        <ol className="flex flex-wrap items-center gap-1.5 text-slate">
          <li>
            <Link href="/tokens" className="inline-flex min-h-11 items-center text-ink underline underline-offset-4">Tokens</Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-ink">{t.symbol}</li>
        </ol>
      </nav>
      <header className="mb-6">
        <h1 className="font-serif text-[28px] leading-[1.2] text-ink">
          {t.symbol} <span className="text-slate">{t.name !== t.symbol ? t.name : ""}</span>
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-slate">
          <span>{t.sector}{d.inUniverse ? " · in the ranking" : ""}</span>
          {r && (
            <span className="text-ink">
              Score <span className="num font-semibold">{r.score != null ? r.score.toFixed(1) : "Not reported"}</span> · {high ? "high confidence" : "low confidence"}
              {!high && r.rules.reasons.length ? <span className="text-slate"> ({r.rules.reasons.join("; ")})</span> : null}
            </span>
          )}
          <span className="num break-all text-[13px]">{t.id}</span>
          <a className="text-ink underline underline-offset-4" href={explorer.token(t.id)} target="_blank" rel="noreferrer">NearBlocks</a>
        </p>
      </header>

      <section aria-labelledby="cost-h" className="mb-6 rounded-lg border border-rule bg-surface p-4 sm:p-5">
        <h2 id="cost-h" className="font-serif text-[21px] text-ink">Cost to trade</h2>
        <p className="mt-1 mb-3 text-[15px] text-slate">Relative slippage at $1k to $1M, NEAR Intents (dry-run quotes) and RHEA (Smart Router), from snapshot {snap?.date ?? "not available"}.</p>
        {snap ? <CostChart rows={snap.depth} token={t.id} symbol={t.symbol} date={snap.date} /> : <p className="text-[15px] text-slate">Not reported: no published snapshot.</p>}
      </section>

      <div className={STAT_GRID}>
                <Stat label="Price (RHEA)" value={price(t.price)} sub={r?.change24h != null ? `${pct(r.change24h, 2, true)} 24h` : undefined} tone={r?.change24h != null ? (r.change24h >= 0 ? "up" : "down") : undefined} source="https://api.rhea.finance/list-token-price" />
        <Stat label="Price (NEAR Intents)" value={price(t.intentsPrice)} sub={t.priceDeviation != null ? `gap ${pct(t.priceDeviation, 2)}` : "not listed on 1Click"} tone={t.priceDeviation != null && t.priceDeviation > 0.05 ? "warn" : undefined} source="https://1click.chaindefuser.com/v0/tokens" />
        <Stat label="Verified liquidity" value={usd(r?.liquidity ?? null)} sub={`${d.poolCount} pools on RHEA`} />
        <Stat label="24h volume" value={usd(r?.volume24h ?? null)} />
      </div>

      {r ? (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(WEIGHTS) as Pillar[]).map((k) => (
              <Card key={k}>
                <CardHeader title={PILLAR_NAME[k]} subtitle={<span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span>Weight {WEIGHTS[k] * 100}%</span><ScoreBar score={r.pillars[k].score} size="sm" /></span>} />
                <dl className="divide-y divide-border">
                  {r.pillars[k].inputs.map((i) => (
                    <div key={i.label} className="flex items-start justify-between gap-3 px-5 py-2.5 text-[13.5px] sm:px-6">
                      <dt className="text-muted">{i.label}</dt>
                      <dd className="num shrink-0 text-right text-text">
                        {fmtInput(i.label, i.value)}
                        {i.source && <span className="ml-1.5"><SourceLink href={i.source} compact /></span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {r.pillars[k].note && <p className="border-t border-border px-5 py-3 text-[13px] sm:px-6 text-faint">{r.pillars[k].note}</p>}
              </Card>
            ))}
          </div>
          <section aria-labelledby="flags-h" className="mt-4"><h2 id="flags-h" className="font-serif text-[21px] text-ink">Flags</h2><div className="mt-2"><Flags flags={r.flags} max={10} /></div></section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title="Deepest pool — daily TVL and volume (90d)" subtitle={r.mainPoolId ? <span className="num">{shortId(r.mainPoolId, 30)}</span> : undefined} right={r.mainPoolId ? <a className="text-accent hover:underline" href={explorer.rheaPool(r.mainPoolId)} target="_blank" rel="noreferrer">RHEA ↗</a> : undefined} />
              <div className="px-5 pb-5 sm:px-6">
                {r.trend.tvlSeries.length > 1 ? (
                  <LineChart
                    title={`${t.symbol} main pool TVL and volume`}
                    lines={[
                      { name: "TVL", points: r.trend.tvlSeries.map((p) => ({ date: p.date, value: p.value })), format: (v) => usd(v) },
                      { name: "Volume", points: r.trend.volumeSeries.map((p) => ({ date: p.date, value: p.value })), format: (v) => usd(v) },
                    ]}
                    download={`/api/v1/token/${encodeURIComponent(t.id)}`}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-muted">Pool history not reported by RHEA for this pool.</p>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Top holders" subtitle={r.holders.top10Share != null ? `Top-10 non-custody accounts hold ${pct(r.holders.top10Share, 1)} of float. Custody contracts hold ${pct(r.holders.custodyShare, 1)} of supply.` : "Holder data not reported."} right={r.holders.source ? <SourceLink href={r.holders.source} compact /> : undefined} />
              {r.holders.top.length ? (
                <div className="scroll-x max-h-[340px]">
                  <table className="data">
                    <thead><tr><th>Account</th><th>Type</th><th className="r">Supply</th></tr></thead>
                    <tbody>
                      {r.holders.top.slice(0, 15).map((h) => (
                        <tr key={h.account}>
                          <td><a href={explorer.account(h.account)} target="_blank" rel="noreferrer" className="num hover:text-accent" title={h.account}>{shortId(h.account, 22)}</a></td>
                          <td>{h.custody ? <Badge tone="info">custody</Badge> : <Badge>holder</Badge>}</td>
                          <td className="r num">{pct(h.share, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Card>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-surface px-5 py-4 text-[15px] text-muted">This token has no pool that passes PRIX integrity checks with at least $1k of liquidity, so no score is computed.</p>
      )}

      <Card className="mt-4">
        <CardHeader title={`RHEA pools containing ${t.symbol}`} subtitle="Largest 20 by PRIX-computed value. Rejected pools are shown with the reason." />
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Pool</th><th>Type</th><th>Pair</th><th className="r">Value</th><th className="r">24h volume</th><th>Status</th></tr></thead>
            <tbody>
              {d.pools.map((p) => (
                <tr key={p.id}>
                  <td><a className="num text-muted hover:text-accent" href={explorer.rheaPool(p.id)} target="_blank" rel="noreferrer" title={p.id}>{shortId(p.id, 14)}</a></td>
                  <td><Badge>{p.kind}</Badge></td>
                  <td>{p.symbols.join(" / ")}</td>
                  <td className="r num">{usd(p.tvl)}</td>
                  <td className="r num">{p.volume24h == null ? <span className="text-faint">not reported</span> : usd(p.volume24h)}</td>
                  <td>{p.clean ? (p.flags.includes("dust") ? <Badge>dust &lt;$1k</Badge> : <Badge tone="up">verified</Badge>) : <Flags flags={p.flags} max={2} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-[14px] text-muted">Snapshot {utc(d.market.asOf)}. “not reported” means the input was missing upstream; PRIX never fills it in.</p>
    </>
  );
}
