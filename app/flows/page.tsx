import type { Metadata } from "next";
import { Badge, Card, CardHeader, Delta, PageHeader, SourceError, Sources, TokenLink } from "@/components/ui";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows } from "@/lib/model/network";
import { sectorBreakdown } from "@/lib/model/sectors";
import { intentsChain } from "@/lib/chain";
import { num, pct, usd } from "@/lib/format";
import { safe } from "@/lib/safe";
import Link from "next/link";
import { getPublished } from "@/lib/server/published";
import { Provenance } from "@/components/snapshot-ui";
import type { Snapshot } from "@/lib/snapshot/schema";

export const metadata: Metadata = { title: "Liquidity flows" };

function mins(ms: number | null | undefined) {
  if (ms == null) return "not reported";
  const m = ms / 60000;
  return m < 90 ? `${Math.max(1, Math.round(m))} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`;
}

const WINDOWS = { "24h": 1, "7d": 7, "30d": 30 } as const;
type W = keyof typeof WINDOWS;

export default async function Flows({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const q = (await searchParams).w;
  const w: W = q === "24h" || q === "30d" ? q : "7d";
  const pub = getPublished();
  const [idx, flows, custody] = await Promise.all([safe(getIndex), safe(getIntentsFlows), safe(getIntentsCustody)]);
  const sectors = idx.ok ? sectorBreakdown(idx.v.market) : null;
  const tokenFlows = idx.ok ? idx.v.rows.filter((r) => r.flow && r.flow.count > 0).sort((a, b) => Math.abs(b.flow!.netUsd) - Math.abs(a.flow!.netUsd)) : [];

  return (
    <>
      <PageHeader eyebrow="Flows" title="Where capital is moving on NEAR">
        Three lenses: liquidity by sector on RHEA, net buy/sell pressure per token from the latest swaps, and deposits/withdrawals through NEAR Intents — the chain-abstraction layer that moves assets in and out of NEAR. Every window is stated; short samples are labelled as such.
      </PageHeader>

      <div className="grid gap-4">
        {pub.snapshot && <SampledFlows s={pub.snapshot} w={w} version={pub.thresholds.t.version} locked={pub.thresholds.locked} />}
        <Card>
          <CardHeader title="Liquidity by sector (RHEA, clean pools)" subtitle="Value of each side of every verified pool, attributed to its token's sector. Pool volume is split 50/50 between its two sides." />
          {sectors ? (
            <div className="scroll-x">
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
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>Token</th><th className="r">Bought</th><th className="r">Sold</th><th className="r">Net</th><th className="r">Pressure</th><th className="r">Window</th><th className="r">Pool TVL 7d</th></tr></thead>
                <tbody>
                  {tokenFlows.map((r) => (
                    <tr key={r.id}>
                      <td><TokenLink id={r.id} symbol={r.symbol} /></td>
                      <td className="r num text-up">{usd(r.flow!.buyUsd)}</td>
                      <td className="r num text-danger">{usd(r.flow!.sellUsd)}</td>
                      <td className={`r num ${r.flow!.netUsd >= 0 ? "text-up" : "text-danger"}`}>{usd(r.flow!.netUsd)}</td>
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
      </div>

      <div className="mt-4 grid gap-4">
        <Card>
          <CardHeader
            title="NEAR Intents — deposits vs withdrawals by asset"
            subtitle={flows.ok ? `Latest ${flows.v.events} intents.near token events spanning ${mins(flows.v.windowMs)}. MINT = deposit into Intents, BURN = withdrawal. USD at the price NearBlocks recorded on each event.` : undefined}
            right={flows.ok ? <Badge tone={flows.v.inUsd >= flows.v.outUsd ? "up" : "danger"}>net {usd(flows.v.inUsd - flows.v.outUsd)}</Badge> : undefined}
          />
          {flows.ok ? (
            flows.v.rows.length ? (
              <div className="scroll-x">
                <table className="data">
                  <thead><tr><th>Asset</th><th>Origin</th><th className="r">Deposits</th><th className="r">Withdrawals</th><th className="r">Net</th><th className="r">Events</th></tr></thead>
                  <tbody>
                    {flows.v.rows.slice(0, 14).map((r) => (
                      <tr key={r.asset}>
                        <td className="font-medium" title={r.asset}>{r.symbol}</td>
                        <td><Badge>{intentsChain(r.asset)}</Badge></td>
                        <td className="r num text-up">{usd(r.inUsd)}</td>
                        <td className="r num text-danger">{usd(r.outUsd)}</td>
                        <td className={`r num ${r.netUsd >= 0 ? "text-up" : "text-danger"}`}>{usd(r.netUsd)}</td>
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
            <div className="scroll-x">
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
              {custody.v.flagged.length > 0 && <p className="border-t border-border px-5 py-3 text-[13px] sm:px-6 text-warn">Excluded as likely mispriced (value &gt;10× the next asset): {custody.v.flagged.map((f) => `${f.symbol} (${usd(f.usd)})`).join(", ")}</p>}
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-6"><SourceError what="Intents balances" error={custody.e} /></div>
          )}
          <Sources urls={custody.ok ? [custody.v.source, "https://api.rhea.finance/list-token-price"] : []} />
        </Card>
      </div>
    </>
  );
}

/** §8.7: sampled NEAR Intents flows over a selectable window, from the published snapshot. */
function SampledFlows({ s, w, version, locked }: { s: Snapshot; w: W; version: number; locked: boolean }) {
  const end = Date.parse(s.as_of);
  const stats = (days: number) => {
    const bs = s.series.flow_buckets.filter((b) => Date.parse(b.end) <= end && Date.parse(b.start) >= end - days * 86400000);
    const dep = bs.reduce((a, b) => a + b.deposits_usd, 0);
    const wd = bs.reduce((a, b) => a + b.withdrawals_usd, 0);
    return {
      n: bs.length,
      events: bs.reduce((a, b) => a + b.events, 0),
      mints: bs.reduce((a, b) => a + b.mints, 0),
      burns: bs.reduce((a, b) => a + b.burns, 0),
      unpriced: bs.reduce((a, b) => a + b.unpriced, 0),
      minutes: bs.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / 60000, 0),
      dep,
      wd,
      first: bs[0]?.start ?? null,
    };
  };
  const cur = stats(WINDOWS[w]);
  return (
    <Card>
      <CardHeader
        title="NEAR Intents: sampled deposits vs withdrawals"
        subtitle={
          <>
            One page of up to 100 intents.near events is read every 30 minutes (and every 3 hours for the backfill). MINT = deposit, BURN = withdrawal, each valued at the price NearBlocks reports for the event. These are <strong className="text-text">samples, not totals</strong>: PRIX sums what was sampled and never scales it up.
            <Provenance date={s.date} sha={s.sha256} asOf={s.as_of} version={version} locked={locked} />
          </>
        }
      />
      <nav aria-label="Window" className="flex gap-1.5 px-5 pb-4 sm:px-6">
        {(Object.keys(WINDOWS) as W[]).map((k) => (
          <Link key={k} href={`/flows?w=${k}`} scroll={false} aria-current={k === w ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors ${k === w ? "bg-accent text-on-accent" : "border border-border-strong text-text hover:bg-tint"}`}>
            {k}
          </Link>
        ))}
      </nav>
      {cur.n === 0 ? (
        <p className="px-5 pb-5 text-[14.5px] text-muted sm:px-6">No sampled windows in the last {w} of this snapshot: not reported.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4 sm:px-6">
          {[
            ["Sampled deposits", usd(cur.dep), "text-up"],
            ["Sampled withdrawals", usd(cur.wd), "text-danger"],
            ["Sampled net", usd(cur.dep - cur.wd), cur.dep >= cur.wd ? "text-up" : "text-danger"],
            ["Events read", num(cur.events), "text-ink"],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-[14px] bg-tint px-4 py-4">
              <p className="text-[13.5px] text-muted">{l}</p>
              <p className={`mt-2 font-serif text-[26px] leading-none sm:text-[30px] ${c}`}>{v}</p>
            </div>
          ))}
          <p className="col-span-2 text-[13px] text-muted sm:col-span-4">
            {num(cur.n)} sampled windows covering {cur.minutes < 120 ? `${cur.minutes.toFixed(1)} min` : `${(cur.minutes / 60).toFixed(1)} h`} of activity since {cur.first?.slice(0, 16).replace("T", " ")} UTC · {num(cur.mints)} mints, {num(cur.burns)} burns, {num(cur.unpriced)} unpriced (excluded) ·{" "}
            <a href={`/api/v1/snapshots/${s.date}`} className="underline underline-offset-4 hover:text-text">snapshot</a> ·{" "}
            <a href="https://api.nearblocks.io/v3/intents/txns?limit=100" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-text">NearBlocks /v3/intents/txns ↗</a>
          </p>
        </div>
      )}
    </Card>
  );
}
