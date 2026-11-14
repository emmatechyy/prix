import { Badge, Card, CardHeader, Delta, SourceError, Sources, TokenLink } from "@/components/ui";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows } from "@/lib/model/network";
import { sectorBreakdown } from "@/lib/model/sectors";
import { intentsChain } from "@/lib/chain";
import { num, pct, usd } from "@/lib/format";
import { safe } from "@/lib/safe";
import Link from "next/link";
import { getPublished } from "@/lib/server/published";
import { SegmentedControl } from "@/components/segmented";
import { nonOverlapping, observedCoverage } from "@/lib/history/coverage";
import type { Snapshot } from "@/lib/snapshot/schema";
import { getLending, LENDING_SOURCE } from "@/lib/rhea/lending";



function mins(ms: number | null | undefined) {
  if (ms == null) return "Not reported";
  const m = ms / 60000;
  return m < 90 ? `${Math.max(1, Math.round(m))} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`;
}

const WINDOWS = { "24h": 1, "7d": 7, "30d": 30 } as const;
type W = keyof typeof WINDOWS;

export async function FlowsView({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const q = (await searchParams).w;
  const w: W = q === "24h" || q === "30d" ? q : "7d";
  const pub = await getPublished();
  const lending = await safe(getLending);
  const [idx, flows, custody] = await Promise.all([safe(getIndex), safe(getIntentsFlows), safe(getIntentsCustody)]);
  const sectors = idx.ok ? sectorBreakdown(idx.v.market) : null;
  const tokenFlows = idx.ok ? idx.v.rows.filter((r) => r.flow && r.flow.count > 0).sort((a, b) => Math.abs(b.flow!.netUsd) - Math.abs(a.flow!.netUsd)) : [];

  return (
    <>
      <h2 className="font-serif text-[28px] leading-[1.25] text-ink">Flows</h2>
      <p className="measure mt-2 mb-4 text-[15px] text-slate">Deposits into and withdrawals out of NEAR Intents, the layer that moves assets in and out of NEAR. Every window states how much of it was actually observed.</p>
      <div className="grid gap-4">
        {pub.snapshot && <SampledFlows s={pub.snapshot} w={w} />}
      </div>
      <details className="mt-4 rounded-lg border border-rule bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-[15px] font-medium text-ink">More flow detail: liquidity by sector, swap pressure, assets held by NEAR Intents, RHEA Lending</summary>
      <div className="grid gap-4 p-2 sm:p-4">
        <Card>
          <CardHeader title="Liquidity by sector (RHEA, clean pools)" subtitle="Value of each side of every verified pool, attributed to its token's sector. Pool volume is split 50/50 between its two sides." />
          {sectors ? (
            <div tabIndex={0} className="scroll-x">
              <table className="data">
                <thead><tr><th>Sector</th><th className="r">Liquidity</th><th className="r">Share</th><th className="r">24h volume</th><th className="r">Tokens</th></tr></thead>
                <tbody>
                  {sectors.rows.map((r) => (
                    <tr key={r.sector}>
                      <td>{r.sector}</td>
                      <td className="r num">{usd(r.liquidity)}</td>
                      <td className="r">
                        <span className="inline-flex items-center gap-2">
                          <span className="num text-muted">{pct(r.liquidity / sectors.total, 1)}</span>
                          <span className="relative h-1 w-14 overflow-hidden rounded-full bg-tint-strong" aria-hidden><span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(r.liquidity / sectors.total) * 100}%` }} /></span>
                        </span>
                      </td>
                      <td className="r num">{usd(r.volume24h)}</td>
                      <td className="r num text-muted">{num(r.tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-6">{!idx.ok && <SourceError what="RHEA pools" error={idx.e} />}</div>
          )}
          <Sources urls={["https://api.rhea.finance/list-top-pools", "https://api.rhea.finance/get-24h-volume-list"]} note="24h volume covers all DCL pools and the 40 largest AMM pools." />
        </Card>

        <Card>
          <CardHeader title="Token buy/sell pressure — latest 50 swaps in each token's deepest pool" subtitle="Net = USD bought − USD sold. Pressure = net ÷ total. The window is how long those 50 swaps took." />
          {tokenFlows.length ? (
            <div tabIndex={0} className="scroll-x">
              <table className="data">
                <thead><tr><th>Token</th><th className="r">Bought</th><th className="r">Sold</th><th className="r">Net</th><th className="r">Pressure</th><th className="r">Window</th><th className="r">Pool TVL 7d</th></tr></thead>
                <tbody>
                  {tokenFlows.map((r) => (
                    <tr key={r.id}>
                      <td><TokenLink id={r.id} symbol={r.symbol} /></td>
                      <td className="r num text-ink">{usd(r.flow!.buyUsd)}</td>
                      <td className="r num text-ink">{usd(r.flow!.sellUsd)}</td>
                      <td className={`r num ${r.flow!.netUsd >= 0 ? " text-ink" : " text-ink"}`}>{usd(r.flow!.netUsd)}</td>
                      <td className="r"><Delta v={r.flow!.pressure} digits={0} /></td>
                      <td className="r num text-muted">{mins(r.flow!.windowMs)}</td>
                      <td className="r"><Delta v={r.trend.tvl7d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-5 text-[14.5px] text-muted sm:px-6">{idx.ok ? "No priced swaps in the sampled pools." : <SourceError what="Swap samples" error={idx.e} />}</div>
          )}
          <Sources urls={["https://api.rhea.finance/get-recent-transaction-swap", "https://api.rhea.finance/get-recent-transaction-dcl-swap"]} note="Pool TVL change is in USD and includes price moves." />
        </Card>

        <Card>
          <CardHeader
            title="NEAR Intents — deposits vs withdrawals by asset"
            subtitle={flows.ok ? `Latest ${flows.v.events} intents.near token events spanning ${mins(flows.v.windowMs)}. MINT = deposit into Intents, BURN = withdrawal. USD at the price NearBlocks recorded on each event.` : undefined}
            right={flows.ok ? <Badge tone={flows.v.inUsd >= flows.v.outUsd ? "up" : "danger"}>net {usd(flows.v.inUsd - flows.v.outUsd)}</Badge> : undefined}
          />
          {flows.ok ? (
            flows.v.rows.length ? (
              <div tabIndex={0} className="scroll-x">
                <table className="data">
                  <thead><tr><th>Asset</th><th>Origin</th><th className="r">Deposits</th><th className="r">Withdrawals</th><th className="r">Net</th><th className="r">Events</th></tr></thead>
                  <tbody>
                    {flows.v.rows.slice(0, 14).map((r) => (
                      <tr key={r.asset}>
                        <td className="font-medium" title={r.asset}>{r.symbol}</td>
                        <td><Badge>{intentsChain(r.asset)}</Badge></td>
                        <td className="r num text-ink">{usd(r.inUsd)}</td>
                        <td className="r num text-ink">{usd(r.outUsd)}</td>
                        <td className={`r num ${r.netUsd >= 0 ? " text-ink" : " text-ink"}`}>{usd(r.netUsd)}</td>
                        <td className="r num text-muted">{r.events}{r.unpriced ? <span className="text-faint"> ({r.unpriced} unpriced)</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 pb-5 text-[14.5px] text-muted sm:px-6">No deposits or withdrawals in the sampled events.</p>
            )
          ) : (
            <div className="px-5 pb-5 sm:px-6"><SourceError what="NEAR Intents events" error={flows.e} /></div>
          )}
          <Sources urls={flows.ok ? [flows.v.source] : []} note="Free-tier sample; a NEARBLOCKS_API_KEY widens the window." />
        </Card>

        <Card>
          <CardHeader title="Assets held by NEAR Intents (intents.near)" subtitle={custody.ok ? `${custody.v.rows.length} priced of ${custody.v.tokenCount} token contracts; ${custody.v.unpriced} non-zero balances have no RHEA price and are excluded.` : undefined} right={custody.ok ? <span className="num text-text">{usd(custody.v.total)}</span> : undefined} />
          {custody.ok ? (
            <div tabIndex={0} className="scroll-x">
              <table className="data">
                <thead><tr><th>Asset</th><th>Sector</th><th className="r">Amount</th><th className="r">Value</th><th className="r">Share</th></tr></thead>
                <tbody>
                  {custody.v.rows.slice(0, 12).map((r) => (
                    <tr key={r.id}>
                      <td><TokenLink id={r.id} symbol={r.symbol} /></td>
                      <td><Badge>{r.sector}</Badge></td>
                      <td className="r num text-muted">{num(r.amount, 2)}</td>
                      <td className="r num">{usd(r.usd)}</td>
                      <td className="r num text-muted">{pct(r.usd / custody.v.total, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {custody.v.flagged.length > 0 && <p className="border-t border-border px-5 py-3 text-[13px] sm:px-6 text-ink">Excluded as likely mispriced (value &gt;10× the next asset): {custody.v.flagged.map((f) => `${f.symbol} (${usd(f.usd)})`).join(", ")}</p>}
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-6"><SourceError what="Intents balances" error={custody.e} /></div>
          )}
          <Sources urls={custody.ok ? [custody.v.source, "https://api.rhea.finance/list-token-price"] : []} />
        </Card>
        <Card>
          <CardHeader title="Fundamentals: RHEA Lending" subtitle="Supplied and borrowed balances per asset on RHEA Lending (Burrow), read with the RHEA cross-chain SDK's read-only batchViews(). Utilization = borrowed ÷ supplied. APRs are as reported by the contract. USD at RHEA prices; unpriced assets show not reported." right={lending.ok ? `${usd(lending.v.supplied_usd)} supplied · ${usd(lending.v.borrowed_usd)} borrowed` : undefined} />
          {lending.ok ? (
            <div tabIndex={0} className="scroll-x">
              <table className="data">
                <thead><tr><th>Asset</th><th className="r">Supplied</th><th className="r">Borrowed</th><th className="r">Utilization</th><th className="r">Supply APR</th><th className="r">Borrow APR</th></tr></thead>
                <tbody>
                  {lending.v.rows.filter((r) => (r.supplied_usd ?? 0) >= 1000 || r.supplied_usd == null).slice(0, 14).map((r) => (
                    <tr key={r.token_id}>
                      <td><TokenLink id={r.token_id} symbol={r.symbol} /></td>
                      <td className="r num">{r.supplied_usd == null ? <span className="text-faint">Not reported</span> : usd(r.supplied_usd)}</td>
                      <td className="r num">{r.borrowed_usd == null ? <span className="text-faint">Not reported</span> : usd(r.borrowed_usd)}</td>
                      <td className="r num">{r.utilization == null ? <span className="text-faint">Not reported</span> : pct(r.utilization, 1)}</td>
                      <td className="r num">{r.supply_apr == null ? <span className="text-faint">Not reported</span> : pct(r.supply_apr, 2)}</td>
                      <td className="r num">{r.borrow_apr == null || !r.can_borrow ? <span className="text-faint">{r.can_borrow ? "Not reported" : "not borrowable"}</span> : pct(r.borrow_apr, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-6"><SourceError what="RHEA Lending" error={lending.e} /></div>
          )}
          <Sources urls={["https://nearblocks.io/address/contract.main.burrow.near", "https://www.npmjs.com/package/@rhea-finance/cross-chain-sdk"]} note={LENDING_SOURCE} />
        </Card>
      </div>
      </details>
    </>
  );
}

/** Sampled NEAR Intents flows over a selectable window, from the published snapshot, with coverage. */
function SampledFlows({ s, w }: { s: Snapshot; w: W }) {
  const end = Date.parse(s.as_of);
  const days = WINDOWS[w];
  const bs = nonOverlapping(s.series.flow_buckets.filter((b) => Date.parse(b.end) <= end && Date.parse(b.start) >= end - days * 86400000));
  const dep = bs.reduce((a, b) => a + (b.deposits_usd ?? 0), 0);
  const wd = bs.reduce((a, b) => a + (b.withdrawals_usd ?? 0), 0);
  const events = bs.reduce((a, b) => a + b.events, 0);
  const unpriced = bs.reduce((a, b) => a + b.unpriced, 0);
  const cov = observedCoverage(bs, end, days);
  const hours = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)}h`);
  return (
    <section aria-label="Sampled NEAR Intents flows" className="min-w-0 rounded-lg border border-rule bg-surface p-4 sm:p-5">
      <SegmentedControl label="Flow window" current={w} items={(Object.keys(WINDOWS) as W[]).map((k) => ({ key: k, label: k, href: `/capital?w=${k}#flows` }))} />
      {cov.share < 1 && (
        <p className="mt-3 text-[15px] text-ink">
          <span className="font-semibold">{hours(cov.hours)} of {w === "24h" ? "24h" : `${days * 24}h`} observed</span> ({(cov.share * 100).toFixed(cov.share < 0.1 ? 1 : 0)}%). Totals below are sums of what was read, never scaled up.
        </p>
      )}
      {bs.length === 0 ? (
        <p className="mt-3 text-[15px] text-slate">Flow history fills in as data is collected: nothing observed in the last {w} of snapshot {s.date} yet.</p>
      ) : (
        <div tabIndex={0} className="scroll-x mt-3">
          <table className="data">
            <caption className="sr-only">Observed deposits, withdrawals and net flow, last {w}</caption>
            <tbody>
              {[
                ["Deposits (observed)", usd(dep)],
                ["Withdrawals (observed)", usd(wd)],
                ["Net (observed)", usd(dep - wd)],
                ["Events read", `${num(events)}${unpriced ? ` (${num(unpriced)} unpriced, left out)` : ""}`],
              ].map(([l, v]) => (
                <tr key={l}>
                  <th scope="row" className="!static !bg-transparent !text-[15px] !font-normal !text-ink">{l}</th>
                  <td className="r num font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[13px] text-slate">
        MINT = deposit, BURN = withdrawal, valued at the price NearBlocks records on each event. H5 uses a day-weighted version of these numbers; see{" "}
        <Link href="/#h5" className="text-ink underline underline-offset-4">H5</Link>. Sources:{" "}
        <a href={`/api/v1/snapshots/${s.date}`} className="text-ink underline underline-offset-4">snapshot {s.date}</a>,{" "}
        <a href="https://api.nearblocks.io/v3/intents/txns?limit=100" target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">NearBlocks intents events</a>.
      </p>
    </section>
  );
}
