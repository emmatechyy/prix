import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader, Delta, Flags, KeyChip, PillLink, ScoreBar, SourceError, Sources, Stat, TokenLink, Badge, STAT_GRID } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { SERIES } from "@/lib/palette";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows, getNetwork, getProtocolHistory, getStats } from "@/lib/model/network";
import { getPublished } from "@/lib/server/published";
import { ThresholdsBadge } from "@/components/snapshot-ui";
import type { Verdict } from "@/lib/thesis/engine";
import { MIN_POOL_TVL } from "@/lib/model/market";
import { num, pct, price, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;



export default async function Overview() {
  const [idx, net, proto, custody, flows, stats] = await Promise.all([safe(getIndex), safe(getNetwork), safe(getProtocolHistory), safe(getIntentsCustody), safe(getIntentsFlows), safe(getStats)]);
  const pub = await getPublished();
  const v = new Map(pub.verdicts.map((x) => [x.id, x]));
  const rh = pub.snapshot?.rhea;

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
        <p className="mx-auto mt-6 max-w-[680px] text-[17px] leading-[1.6] text-muted sm:text-[19px]">
          <span className="text-text">The thesis:</span> NEAR is worth holding long term only if its usage stands apart from its price, its capital stays in NEAR Intents, and its markets can take size. PRIX tests each part with a pre-registered rule against published, hashed data. Live market data {utc(asOf)}.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PillLink href="/rankings">Open the PRIX Index</PillLink>
          <PillLink href="/thesis" variant="outline">Read the thesis</PillLink>
        </div>
        <div className="mt-5 flex justify-center"><ThresholdsBadge version={pub.thresholds.t.version} locked={pub.thresholds.locked} /></div>
        <nav aria-label="Signals" className="mt-8 flex flex-wrap justify-center gap-2.5">
          <KeyChip n={1} href="/flows">Liquidity flows</KeyChip>
          <KeyChip n={2} href="/depth">Depth matrix</KeyChip>
          <KeyChip n={3} href="/rankings">Volume integrity</KeyChip>
          <KeyChip n={4} href="/whales">Whale tracking</KeyChip>
          <KeyChip n={5} href="/thesis">Thesis tests</KeyChip>
        </nav>
      </section>

      <section aria-label="Three pillars of the thesis" className="mb-12 grid gap-3 sm:mb-16 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <div key={p.title} className={`appear appear-${i + 1} flex flex-col rounded-[20px] bg-surface px-6 py-6`}>
            <p className="text-[14px] text-muted">Pillar {i + 1}</p>
            <h2 className="mt-1 font-serif text-[30px] leading-[1.05] text-text">{p.title}</h2>
            <p className="mt-2 flex-1 text-[15px] leading-[1.5] text-muted">{p.text}</p>
            <ul className="mt-4 space-y-1.5">
              {p.claims.map((id) => {
                const x = v.get(id);
                return (
                  <li key={id}>
                    <Link href={`/thesis#${id}`} className="group flex items-center justify-between gap-3 rounded-[12px] border border-border-strong px-3 py-2 text-[14px] hover:bg-tint">
                      <span className="min-w-0 truncate"><span className="num mr-2 text-faint">{id}</span>{x ? SHORT[id] : "—"}</span>
                      {x ? <VerdictDot v={x.verdict} /> : <span className="text-faint">not reported</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
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
                  {idx.v.rows.filter((r) => r.rank != null && r.rules.confidence === "high").slice(0, 8).map((r) => (
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
            Six falsifiable claims about NEAR, each judged by a pre-registered rule on a hashed daily snapshot.
          </h2>
          <div className="mt-5">{pub.snapshot && <span className="text-[14px] text-periwinkle">Snapshot {pub.snapshot.date} · sha256 {pub.snapshot.sha256.slice(0, 12)}… · thresholds v{pub.thresholds.t.version}: {pub.thresholds.locked ? "locked" : "DRAFT, not locked"}</span>}</div>
          {pub.verdicts.length ? (
            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pub.verdicts.map((h, i) => (
                <li key={h.id} className={`appear appear-${Math.min(4, i + 1)} flex flex-col rounded-[16px] bg-[rgba(231,236,243,0.08)] px-6 py-5`}>
                  <p className="text-[14px] text-periwinkle">{h.id} · grade {h.evidence_grade}</p>
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
            <p className="mt-8 rounded-[16px] bg-[rgba(231,236,243,0.08)] px-6 py-5 text-[15px]">No published snapshot yet, so no verdicts. PRIX shows nothing rather than a guess.</p>
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
          <CardHeader title="Integrity: liquidity PRIX refused to count" subtitle="Pools whose reported value cannot be verified are excluded from every metric." right={<a href="/api/v1/integrity" className="text-accent hover:underline">JSON ↗</a>} />
          {rh && rh.clean_tvl_usd != null && rh.unfiltered_tvl_usd != null && (
            <div className="grid grid-cols-1 gap-2 px-5 pb-4 min-[460px]:grid-cols-3 sm:px-6">
              {[
                ["TVL, rejected pools excluded", usd(rh.clean_tvl_usd), "text-ink"],
                ["TVL if they were counted", usd(rh.unfiltered_tvl_usd), "text-warn"],
                [`Rejected (${rh.rejected_count} pools)`, usd(rh.unfiltered_tvl_usd - rh.clean_tvl_usd), "text-danger"],
              ].map(([l, val, c]) => (
                <div key={l} className="rounded-[14px] bg-tint px-4 py-3">
                  <p className="text-[13px] leading-snug text-muted">{l}</p>
                  <p className={`mt-1.5 font-serif text-[26px] leading-none ${c}`}>{val}</p>
                </div>
              ))}
              <p className="text-[12.5px] text-faint min-[460px]:col-span-3">From snapshot <a className="underline underline-offset-4 hover:text-text" href={`/api/v1/snapshots/${pub.snapshot!.date}`}>{pub.snapshot!.date}</a>. Same reserves and prices; only the integrity rules differ.</p>
            </div>
          )}
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

const PILLARS: { title: string; text: string; claims: Verdict["id"][] }[] = [
  { title: "Usage", text: "Activity that does not simply follow the NEAR price, and that survived the October incident.", claims: ["H1", "H6"] },
  { title: "Capital", text: "Where NEAR's capital sits and whether fresh capital is still arriving.", claims: ["H2", "H5"] },
  { title: "Markets", text: "Whether orders of institutional size clear, and whether the volume is real.", claims: ["H3", "H4"] },
];
const SHORT: Record<Verdict["id"], string> = { H1: "Usage independent of price", H2: "Capital sits in Intents", H3: "Markets absorb $100k", H4: "Volume mostly organic", H5: "Fresh capital entering", H6: "Recovered from exploit" };
function VerdictDot({ v }: { v: Verdict["verdict"] }) {
  const c = v === "Supported" ? "bg-up-fill text-up" : v === "Not supported" ? "bg-danger-fill text-danger" : v === "Mixed" ? "bg-warn-fill text-warn" : "bg-faint text-muted";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium ${c.split(" ")[1]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.split(" ")[0]}`} aria-hidden />
      {v}
    </span>
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
