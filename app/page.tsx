import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader, Delta, Flags, KeyChip, PillLink, ScoreBar, SourceError, Sources, Stat, TokenLink, Badge, STAT_GRID } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { SERIES } from "@/lib/palette";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows, getNetwork, getProtocolHistory, getStats } from "@/lib/model/network";
import { getThesis } from "@/lib/model/thesis";
import { MIN_POOL_TVL } from "@/lib/model/market";
import { num, pct, price, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;



export default async function Overview() {
  const [idx, net, proto, custody, flows, stats, thesis] = await Promise.all([safe(getIndex), safe(getNetwork), safe(getProtocolHistory), safe(getIntentsCustody), safe(getIntentsFlows), safe(getStats), safe(getThesis)]);

  const m = idx.ok ? idx.v.market : null;
  const cleanTvl = m ? m.pools.filter((p) => p.clean && p.tvl >= MIN_POOL_TVL).reduce((a, p) => a + p.tvl, 0) : null;
  const asOf = idx.ok ? idx.v.asOf : new Date().toISOString();

  return (
    <>
      <section className="appear mx-auto max-w-[920px] pb-12 text-center sm:pb-16">
        <p className="text-[17px] font-medium tracking-[-0.01em] text-text sm:text-[20px]">An evidence-graded index of NEAR on-chain markets.</p>
        <h1 className="display mt-5 text-[56px] leading-[0.92] tracking-[-0.025em] text-text sm:text-[96px] lg:text-[120px]">
          Graded by evidence, <span className="italic">not</span> conviction
        </h1>
        <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-[1.6] text-muted sm:text-[19px]">
          PRIX reads RHEA pools, NEAR Intents and NEAR network history, rejects liquidity it cannot verify, and ranks tokens on depth, real activity, holder distribution and flows. Snapshot {utc(asOf)}.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/rankings">Open the PRIX Index</PillLink>
          <PillLink href="/thesis" variant="outline">Read the thesis</PillLink>
        </div>
        <nav aria-label="Signals" className="mt-10 flex flex-wrap justify-center gap-2.5">
          <KeyChip n={1} href="/flows">Liquidity flows</KeyChip>
          <KeyChip n={2} href="/whales">Whale tracking</KeyChip>
          <KeyChip n={3} href="/rankings">Volume integrity</KeyChip>
          <KeyChip n={4} href="/launches">Launch radar</KeyChip>
          <KeyChip n={5} href="/thesis">Thesis tests</KeyChip>
        </nav>
      </section>

      <div className={STAT_GRID}>
        <Stat label="NEAR price" value={stats.ok ? price(Number(stats.v.near_price)) : "not reported"} sub={stats.ok ? `${Number(stats.v.change_24h) >= 0 ? "+" : ""}${Number(stats.v.change_24h).toFixed(2)}% 24h` : undefined} tone={stats.ok ? (Number(stats.v.change_24h) >= 0 ? "up" : "down") : undefined} source="https://api.nearblocks.io/v3/stats" />
        <Stat label="RHEA clean TVL" value={usd(cleanTvl)} sub={m ? `${m.rejected.pools} pools rejected` : undefined} tone={m && m.rejected.pools ? "warn" : undefined} source="https://api.rhea.finance/list-top-pools" />
        <Stat label="RHEA 24h volume" value={proto.ok && proto.v.volume ? usd(proto.v.volume.last) : "not reported"} sub={proto.ok && proto.v.volume ? `${pct(proto.v.volume.variation, 2, true)} vs prior day` : undefined} tone={proto.ok && proto.v.volume ? (proto.v.volume.variation >= 0 ? "up" : "down") : undefined} source="https://api.data-service.ref.finance/api/24h_volume_variation" />
        <Stat label="Intents custody" value={custody.ok ? usd(custody.v.total) : "not reported"} sub={custody.ok ? `${custody.v.rows.length} priced assets` : undefined} source="https://api.fastnear.com/v1/account/intents.near/ft" />
        <Stat label="Active accounts / day" value={net.ok ? num(net.v.d30.active.current) : "not reported"} sub={net.ok ? `30d avg · ${pct(net.v.d30.active.change, 1, true)} vs prior 30d` : undefined} tone={net.ok ? ((net.v.d30.active.change ?? 0) >= 0 ? "up" : "down") : undefined} source="https://api.nearblocks.io/v3/address-stats" />
      </div>

      <div className="mt-16 sm:mt-24">
        <SectionHead title="The index, today" link={{ href: "/rankings", label: "Full index" }}>Tokens ranked on depth (30%), activity (25%), distribution (20%) and flow (25%). Missing pillars are re-weighted and lower confidence.</SectionHead>
        <Card>
          {idx.ok ? (
            <div className="scroll-x pt-2">
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
            <div className="px-5 pb-5 sm:px-6"><SourceError what="The PRIX Index" error={idx.e} /></div>
          )}
        </Card>

      </div>

      <section aria-labelledby="scorecard" className="relative left-1/2 mt-16 w-screen -translate-x-1/2 bg-accent text-on-accent sm:mt-24">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-8 sm:py-24 lg:px-10">
          <div className="appear flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(201,208,240,0.7)] px-3.5 py-1.5 text-[14px] leading-none font-medium">
              <span className="h-2 w-2 rounded-full bg-danger-fill" aria-hidden />
              Live verdicts
            </span>
            <span className="font-serif text-[22px] text-periwinkle">Thesis scorecard</span>
          </div>
          <h2 id="scorecard" className="display appear appear-1 mt-6 max-w-[18ch] text-[40px] leading-[1.08] sm:text-[56px]">
            Five falsifiable claims about NEAR, each judged by a fixed rule on today&apos;s data.
          </h2>
          {thesis.ok ? (
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {thesis.v.hypotheses.map((h, i) => (
                <li key={h.id} className={`appear appear-${Math.min(4, i + 1)} flex flex-col rounded-[16px] bg-[rgba(231,236,243,0.08)] px-6 py-5`}>
                  <p className="text-[14px] text-periwinkle">{h.id}</p>
                  <p className="mt-1.5 flex-1 text-[16px] leading-[1.45]">{h.claim}</p>
                  <p className="mt-4">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium ${h.verdict === "Supported" ? "bg-on-accent text-accent" : "border border-[rgba(201,208,240,0.7)] text-on-accent"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${h.verdict === "Supported" ? "bg-up-fill" : h.verdict === "Not supported" ? "bg-danger-fill" : h.verdict === "Mixed" ? "bg-warn-fill" : "bg-periwinkle"}`} aria-hidden />
                      {h.verdict}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-8 rounded-[16px] bg-[rgba(231,236,243,0.08)] px-6 py-5 text-[15px]">The thesis scorecard is unavailable right now: {thesis.e}. PRIX shows nothing rather than a guess.</p>
          )}
          <div className="mt-10">
            <Link href="/thesis" className="inline-flex rounded-full bg-on-accent px-7 py-4 text-[16px] leading-5 font-medium text-accent transition-colors duration-300 hover:bg-white">
              See the evidence
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-16 sm:mt-24">
        <SectionHead title="Network & protocol">Daily NEAR network usage and RHEA protocol TVL, straight from the upstream daily series.</SectionHead>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="NEAR network activity" subtitle="Daily active accounts and transactions, last 180 days." right={net.ok ? `through ${net.v.lastDate}` : undefined} />
          <div className="px-5 pb-5 sm:px-6">
            {net.ok ? (
              <TimeChart
                label="NEAR daily active accounts and transactions"
                series={[
                  { name: "Active accounts", color: SERIES.primary, data: net.v.days.slice(-180).map((d) => ({ time: d.date, value: d.active })), format: "num" },
                  { name: "Transactions", color: SERIES.secondary, type: "line", scale: "left", data: net.v.days.slice(-180).map((d) => ({ time: d.date, value: d.txns })), format: "num" },
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
          <div className="px-5 pb-5 sm:px-6">
            {proto.ok ? (
              <TimeChart
                label="RHEA AMM and lending TVL"
                series={[
                  { name: "AMM TVL", color: SERIES.primary, data: proto.v.points.map((p) => ({ time: p.date, value: p.amm })), format: "usd" },
                  { name: "Lending TVL", color: SERIES.secondary, type: "line", data: proto.v.points.map((p) => ({ time: p.date, value: p.lending })), format: "usd" },
                ]}
              />
            ) : (
              <SourceError what="RHEA TVL history" error={proto.e} />
            )}
          </div>
          <Sources urls={proto.ok ? [proto.v.source] : []} />
        </Card>
      </div>

      <div className="mt-16 sm:mt-24">
        <SectionHead title="Integrity & flows" link={{ href: "/flows", label: "All flows" }}>What PRIX refused to count, and where capital moved through NEAR Intents most recently.</SectionHead>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
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
          <Sources urls={["https://api.rhea.finance/list-top-pools"]} note={<Link href="/methodology#integrity" className="hover:text-accent">Rules →</Link>} />
        </Card>
        <Card>
          <CardHeader title="NEAR Intents — latest deposits vs withdrawals" subtitle={flows.ok ? `Last ${flows.v.events} intents.near events (${flows.v.windowMs != null ? Math.max(1, Math.round(flows.v.windowMs / 60000)) : "?"} min window). MINT = deposit, BURN = withdrawal.` : undefined} right={<Link href="/flows" className="text-accent hover:underline">Flows →</Link>} />
          {flows.ok ? (
            <div className="grid grid-cols-1 gap-2 px-5 pb-5 min-[460px]:grid-cols-3 sm:px-6">
              {[
                ["Deposits", usd(flows.v.inUsd), "text-up"],
                ["Withdrawals", usd(flows.v.outUsd), "text-danger"],
                ["Net", usd(flows.v.inUsd - flows.v.outUsd), flows.v.inUsd >= flows.v.outUsd ? "text-up" : "text-danger"],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-[14px] bg-tint px-4 py-4">
                  <p className="text-[14px] text-muted">{l}</p>
                  <p className={`mt-2 font-serif text-[30px] leading-none ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-6"><SourceError what="NEAR Intents events" error={flows.e} /></div>
          )}
          <Sources urls={flows.ok ? [flows.v.source] : []} />
        </Card>
      </div>
    </>
  );
}

function SectionHead({ title, link, children }: { title: string; link?: { href: string; label: string }; children?: ReactNode }) {
  return (
    <div className="appear mb-6 grid gap-x-12 gap-y-3 sm:mb-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
      <h2 className="display text-[44px] text-text sm:text-[64px] lg:text-[72px]">{title}</h2>
      <div className="flex flex-col gap-3 lg:items-start lg:pb-2">
        {children && <p className="max-w-[46ch] text-[16px] leading-[1.6] text-muted sm:text-[17px]">{children}</p>}
        {link && (
          <Link href={link.href} className="text-[16px] font-medium text-text underline underline-offset-4 transition-colors hover:text-accent-hover">
            {link.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
