import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Flags, PageHeader, ScoreBar, SourceError, SourceLink, Stat } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { getTokenDetail, WEIGHTS, type Pillar } from "@/lib/model/index-model";
import { explorer, num, pct, price, shortId, usd, utc } from "@/lib/format";

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
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

  return (
    <>
      <PageHeader eyebrow={`${t.sector}${d.inUniverse ? " · in PRIX Index" : ""}`} title={`${t.symbol} — ${t.name}`}>
        <span className="num break-all text-xs">{t.id}</span> ·{" "}
        <a className="text-info hover:underline" href={explorer.token(t.id)} target="_blank" rel="noreferrer">NearBlocks ↗</a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="PRIX score" value={r?.score != null ? r.score.toFixed(1) : "not reported"} sub={r ? `rank ${r.rank ?? "—"} · confidence ${Math.round(r.confidence * 100)}%` : "no verified liquidity"} />
        <Stat label="Price (RHEA)" value={price(t.price)} sub={r?.change24h != null ? `${pct(r.change24h, 2, true)} 24h` : undefined} tone={r?.change24h != null ? (r.change24h >= 0 ? "up" : "down") : undefined} source="https://api.rhea.finance/list-token-price" />
        <Stat label="Price (NEAR Intents)" value={price(t.intentsPrice)} sub={t.priceDeviation != null ? `gap ${pct(t.priceDeviation, 2)}` : "not listed on 1Click"} tone={t.priceDeviation != null && t.priceDeviation > 0.05 ? "warn" : undefined} source="https://1click.chaindefuser.com/v0/tokens" />
        <Stat label="Verified liquidity" value={usd(r?.liquidity ?? null)} sub={`${d.poolCount} pools on RHEA`} />
        <Stat label="24h volume" value={usd(r?.volume24h ?? null)} />
      </div>

      {r ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(WEIGHTS) as Pillar[]).map((k) => (
              <Card key={k}>
                <CardHeader title={`${PILLAR_NAME[k]} · weight ${WEIGHTS[k] * 100}%`} right={<ScoreBar score={r.pillars[k].score} size="sm" />} />
                <dl className="divide-y divide-border">
                  {r.pillars[k].inputs.map((i) => (
                    <div key={i.label} className="flex items-start justify-between gap-3 px-4 py-2 text-xs">
                      <dt className="text-muted">{i.label}</dt>
                      <dd className="num shrink-0 text-right text-text">
                        {fmtInput(i.label, i.value)}
                        {i.source && <span className="ml-1.5"><SourceLink href={i.source} compact /></span>}
                      </dd>
                    </div>
                  ))}
                </dl>
                {r.pillars[k].note && <p className="border-t border-border px-4 py-2 text-xs text-faint">{r.pillars[k].note}</p>}
              </Card>
            ))}
          </div>
          <div className="mt-4"><Flags flags={r.flags} max={10} /></div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title="Deepest pool — daily TVL and volume (90d)" subtitle={r.mainPoolId ? <span className="num">{shortId(r.mainPoolId, 30)}</span> : undefined} right={r.mainPoolId ? <a className="text-info hover:underline" href={explorer.rheaPool(r.mainPoolId)} target="_blank" rel="noreferrer">RHEA ↗</a> : undefined} />
              <div className="p-4">
                {r.trend.tvlSeries.length > 1 ? (
                  <TimeChart
                    label={`${t.symbol} main pool TVL and volume`}
                    series={[
                      { name: "TVL (USD)", color: "#00e599", data: r.trend.tvlSeries.map((p) => ({ time: p.date, value: p.value })), format: "usd" },
                      { name: "Volume (USD)", color: "#6aa6ff", type: "histogram", scale: "left", data: r.trend.volumeSeries.map((p) => ({ time: p.date, value: p.value })), format: "usd" },
                    ]}
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
                          <td><a href={explorer.account(h.account)} target="_blank" rel="noreferrer" className="num hover:text-info" title={h.account}>{shortId(h.account, 22)}</a></td>
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
        <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-sm text-muted">This token has no pool that passes PRIX integrity checks with at least $1k of liquidity, so no score is computed.</p>
      )}

      <Card className="mt-6">
        <CardHeader title={`RHEA pools containing ${t.symbol}`} subtitle="Largest 20 by PRIX-computed value. Rejected pools are shown with the reason." />
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Pool</th><th>Type</th><th>Pair</th><th className="r">Value</th><th className="r">24h volume</th><th>Status</th></tr></thead>
            <tbody>
              {d.pools.map((p) => (
                <tr key={p.id}>
                  <td><a className="num text-muted hover:text-info" href={explorer.rheaPool(p.id)} target="_blank" rel="noreferrer" title={p.id}>{shortId(p.id, 14)}</a></td>
                  <td><Badge>{p.kind}</Badge></td>
                  <td>{p.symbols.join(" / ")}</td>
                  <td className="r num">{usd(p.tvl)}</td>
                  <td className="r num">{p.volume24h == null ? <span className="text-faint">not reported</span> : usd(p.volume24h)}</td>
                  <td>{p.clean ? (p.flags.includes("dust") ? <Badge>dust &lt;$1k</Badge> : <Badge tone="accent">verified</Badge>) : <Flags flags={p.flags} max={2} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-faint">Snapshot {utc(d.market.asOf)}. “not reported” means the input was missing upstream; PRIX never fills it in.</p>
    </>
  );
}
