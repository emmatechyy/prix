import Link from "next/link";
import { Card, CardHeader, Delta, Flags, PageHeader, ScoreBar, SourceError, Sources, Stat, TokenLink, Badge } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows, getNetwork, getProtocolHistory, getStats } from "@/lib/model/network";
import { getThesis } from "@/lib/model/thesis";
import { MIN_POOL_TVL } from "@/lib/model/market";
import { num, pct, price, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;


const verdictTone = { Supported: "accent", "Not supported": "danger", Mixed: "warn", "Insufficient data": "neutral" } as const;

export default async function Overview() {
  const [idx, net, proto, custody, flows, stats, thesis] = await Promise.all([safe(getIndex), safe(getNetwork), safe(getProtocolHistory), safe(getIntentsCustody), safe(getIntentsFlows), safe(getStats), safe(getThesis)]);

  const m = idx.ok ? idx.v.market : null;
  const cleanTvl = m ? m.pools.filter((p) => p.clean && p.tvl >= MIN_POOL_TVL).reduce((a, p) => a + p.tvl, 0) : null;
  const asOf = idx.ok ? idx.v.asOf : new Date().toISOString();

  return (
    <>
      <PageHeader eyebrow="Market pulse" title="NEAR on-chain markets, graded by evidence">
        PRIX reads RHEA pools, NEAR Intents and NEAR network history, rejects liquidity it cannot verify, and ranks tokens on depth, real activity, holder distribution and flows. Every number links to its source. Snapshot {utc(asOf)}.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="NEAR price" value={stats.ok ? price(Number(stats.v.near_price)) : "not reported"} sub={stats.ok ? `${Number(stats.v.change_24h) >= 0 ? "+" : ""}${Number(stats.v.change_24h).toFixed(2)}% 24h` : undefined} tone={stats.ok ? (Number(stats.v.change_24h) >= 0 ? "up" : "down") : undefined} source="https://api.nearblocks.io/v3/stats" />
        <Stat label="RHEA clean TVL" value={usd(cleanTvl)} sub={m ? `${m.rejected.pools} pools rejected` : undefined} tone={m && m.rejected.pools ? "warn" : undefined} source="https://api.rhea.finance/list-top-pools" />
        <Stat label="RHEA 24h volume" value={proto.ok && proto.v.volume ? usd(proto.v.volume.last) : "not reported"} sub={proto.ok && proto.v.volume ? `${pct(proto.v.volume.variation, 2, true)} vs prior day` : undefined} tone={proto.ok && proto.v.volume ? (proto.v.volume.variation >= 0 ? "up" : "down") : undefined} source="https://api.data-service.ref.finance/api/24h_volume_variation" />
        <Stat label="Intents custody" value={custody.ok ? usd(custody.v.total) : "not reported"} sub={custody.ok ? `${custody.v.rows.length} priced assets` : undefined} source="https://api.fastnear.com/v1/account/intents.near/ft" />
        <Stat label="Active accounts / day" value={net.ok ? num(net.v.d30.active.current) : "not reported"} sub={net.ok ? `30d avg · ${pct(net.v.d30.active.change, 1, true)} vs prior 30d` : undefined} tone={net.ok ? ((net.v.d30.active.change ?? 0) >= 0 ? "up" : "down") : undefined} source="https://api.nearblocks.io/v3/address-stats" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="PRIX Index — top ranked" subtitle="Composite of depth (30%), activity (25%), distribution (20%), flow (25%). Missing pillars are re-weighted and lower confidence." right={<Link href="/rankings" className="text-info hover:underline">Full index →</Link>} />
          {idx.ok ? (
            <div className="scroll-x">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Token</th>
                    <th>Score</th>
                    <th className="r">Liquidity</th>
                    <th className="r">$10k impact</th>
                    <th className="r">24h</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {idx.v.rows.filter((r) => r.rank != null).slice(0, 8).map((r) => (
                    <tr key={r.id}>
                      <td className="num text-faint">{r.rank}</td>
                      <td><TokenLink id={r.id} symbol={r.symbol} sub={r.sector} /></td>
                      <td><ScoreBar score={r.score} size="sm" /></td>
                      <td className="r num">{usd(r.liquidity)}</td>
                      <td className="r num">{r.depth.impact == null ? <span className="text-faint">not reported</span> : pct(r.depth.impact)}</td>
                      <td className="r"><Delta v={r.change24h} /></td>
                      <td><Flags flags={r.flags} max={1} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4"><SourceError what="The PRIX Index" error={idx.e} /></div>
          )}
        </Card>

        <Card>
          <CardHeader title="Thesis scorecard" subtitle="Five falsifiable claims about NEAR, each judged by a fixed rule on today's data." right={<Link href="/thesis" className="text-info hover:underline">Evidence →</Link>} />
          {thesis.ok ? (
            <ul className="divide-y divide-border">
              {thesis.v.hypotheses.map((h) => (
                <li key={h.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="num mt-0.5 text-[11px] text-faint">{h.id}</span>
                  <p className="min-w-0 flex-1 text-[13px] leading-snug text-text">{h.claim}</p>
                  <Badge tone={verdictTone[h.verdict]}>{h.verdict}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4"><SourceError what="The thesis scorecard" error={thesis.e} /></div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="NEAR network activity" subtitle="Daily active accounts and transactions, last 180 days." right={net.ok ? `through ${net.v.lastDate}` : undefined} />
          <div className="p-4">
            {net.ok ? (
              <TimeChart
                label="NEAR daily active accounts and transactions"
                series={[
                  { name: "Active accounts", color: "#00e599", data: net.v.days.slice(-180).map((d) => ({ time: d.date, value: d.active })), format: "num" },
                  { name: "Transactions", color: "#6aa6ff", type: "line", scale: "left", data: net.v.days.slice(-180).map((d) => ({ time: d.date, value: d.txns })), format: "num" },
                ]}
              />
            ) : (
              <SourceError what="Network history" error={net.e} />
            )}
          </div>
          <Sources urls={net.ok ? net.v.sources.slice(0, 2) : []} />
        </Card>
        <Card>
          <CardHeader title="RHEA protocol TVL" subtitle="AMM TVL and lending TVL, daily, 90 days." right={proto.ok && proto.v.excluded.length ? <Badge tone="warn" title="Days whose value exceeded 3× the series median">{proto.v.excluded.length} outlier day(s) excluded</Badge> : undefined} />
          <div className="p-4">
            {proto.ok ? (
              <TimeChart
                label="RHEA AMM and lending TVL"
                series={[
                  { name: "AMM TVL", color: "#00e599", data: proto.v.points.map((p) => ({ time: p.date, value: p.amm })), format: "usd" },
                  { name: "Lending TVL", color: "#f2b84b", type: "line", data: proto.v.points.map((p) => ({ time: p.date, value: p.lending })), format: "usd" },
                ]}
              />
            ) : (
              <SourceError what="RHEA TVL history" error={proto.e} />
            )}
          </div>
          <Sources urls={proto.ok ? [proto.v.source] : []} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Integrity: liquidity PRIX refused to count" subtitle="Pools whose reported value cannot be verified are excluded from every metric." />
          {m ? (
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>Pool</th><th>Pair</th><th className="r">Claimed value</th><th>Reason</th></tr></thead>
                <tbody>
                  {m.pools.filter((p) => !p.clean && p.tvl >= MIN_POOL_TVL).sort((a, b) => b.tvl - a.tvl).slice(0, 6).map((p) => (
                    <tr key={p.id}>
                      <td className="num max-w-[140px] truncate text-muted" title={p.id}>{p.id.length > 14 ? p.id.slice(0, 12) + "…" : p.id}</td>
                      <td>{p.symbols.join(" / ")}</td>
                      <td className="r num">{usd(p.tvl)}</td>
                      <td><Flags flags={p.flags.filter((f) => f !== "dust")} max={2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <Sources urls={["https://api.rhea.finance/list-top-pools"]} note={<Link href="/methodology#integrity" className="hover:text-info">Rules →</Link>} />
        </Card>
        <Card>
          <CardHeader title="NEAR Intents — latest deposits vs withdrawals" subtitle={flows.ok ? `Last ${flows.v.events} intents.near events (${flows.v.windowMs != null ? Math.max(1, Math.round(flows.v.windowMs / 60000)) : "?"} min window). MINT = deposit, BURN = withdrawal.` : undefined} right={<Link href="/flows" className="text-info hover:underline">Flows →</Link>} />
          {flows.ok ? (
            <div className="grid grid-cols-3 gap-px bg-border">
              {[
                ["Deposits", usd(flows.v.inUsd), "text-accent"],
                ["Withdrawals", usd(flows.v.outUsd), "text-danger"],
                ["Net", usd(flows.v.inUsd - flows.v.outUsd), flows.v.inUsd >= flows.v.outUsd ? "text-accent" : "text-danger"],
              ].map(([l, v, c]) => (
                <div key={l} className="bg-surface px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-faint">{l}</p>
                  <p className={`num mt-1 text-lg ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4"><SourceError what="NEAR Intents events" error={flows.e} /></div>
          )}
          <Sources urls={flows.ok ? [flows.v.source] : []} />
        </Card>
      </div>
    </>
  );
}
