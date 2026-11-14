import type { Metadata } from "next";
import Link from "next/link";
import { getPublished } from "@/lib/server/published";
import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getNetwork, getProtocolHistory, getStats } from "@/lib/model/network";
import { MIN_POOL_TVL } from "@/lib/model/market";
import { safe } from "@/lib/safe";
import { num, pct, price, usd } from "@/lib/format";
import { CLAIM_ORDER, COPY, plain } from "@/lib/copy";
import { railFor, verdictSummary, VERDICT_WORD } from "@/lib/thesis/rail";
import type { Verdict } from "@/lib/thesis/engine";
import { EvidenceGrade, EvidencePanel, ThresholdRail, VerdictBadge, VerdictIcon } from "@/components/verdict";
import { FreshnessLine } from "@/components/freshness";
import { HashOpener } from "@/components/hash-opener";
import { NoSnapshot } from "@/components/snapshot-ui";
import { SourceIcon } from "@/components/source-icon";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { verdicts } = await getPublished();
  const d = `${verdictSummary(verdicts)}. Six pre-registered claims about NEAR, re-tested daily against a hashed public snapshot.`;
  return { title: { absolute: "PRIX: the long-term case for NEAR, tested daily" }, description: d, openGraph: { title: "PRIX verdicts", description: d, images: ["/og"] } };
}

const SEG: Record<Verdict["verdict"], string> = {
  Supported: "var(--supported)",
  Mixed: "var(--mixed)",
  "Not supported": "var(--not-supported)",
  "Insufficient data": "var(--no-data)",
};

export default async function Verdicts() {
  const pub = await getPublished();
  const s = pub.snapshot;
  if (!s) return <NoSnapshot />;
  const byId = new Map(pub.verdicts.map((v) => [v.id, v]));
  const ordered = CLAIM_ORDER.map((id) => byId.get(id)).filter((v): v is Verdict => !!v);
  const [idx, net, proto, custody, stats] = await Promise.all([safe(getIndex), safe(getNetwork), safe(getProtocolHistory), safe(getIntentsCustody), safe(getStats)]);
  const m = idx.ok ? idx.v.market : null;
  const cleanTvl = m ? m.pools.filter((p) => p.clean && p.tvl >= MIN_POOL_TVL).reduce((a, p) => a + p.tvl, 0) : null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "PRIX verdicts",
    description: verdictSummary(pub.verdicts),
    dateModified: s.as_of,
    url: "https://prix-orcin.vercel.app/",
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://prix-orcin.vercel.app/api/v1/thesis" }],
  };

  const keyRows: { label: string; value: string; change: string | null; source: string }[] = [
    { label: "NEAR price", value: stats.ok ? price(Number(stats.v.near_price)) : COPY.notReported, change: stats.ok ? `${pct(Number(stats.v.change_24h) / 100, 2, true)} 24h` : null, source: "https://api.nearblocks.io/v3/stats" },
    { label: "RHEA TVL (verified pools)", value: usd(cleanTvl), change: null, source: "https://api.rhea.finance/list-top-pools" },
    { label: "RHEA 24h volume", value: proto.ok && proto.v.volume ? usd(proto.v.volume.last) : COPY.notReported, change: proto.ok && proto.v.volume ? `${pct(proto.v.volume.variation, 1, true)} vs prior day` : null, source: "https://api.data-service.ref.finance/api/24h_volume_variation" },
    { label: "Assets held by NEAR Intents", value: custody.ok ? usd(custody.v.total) : COPY.notReported, change: null, source: "https://api.fastnear.com/v1/account/intents.near/ft" },
    { label: "Active accounts per day (30-day average)", value: net.ok ? num(net.v.d30.active.current) : COPY.notReported, change: net.ok ? `${pct(net.v.d30.active.change, 1, true)} vs prior 30 days` : null, source: "https://api.nearblocks.io/v3/address-stats" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <HashOpener />
      <section aria-labelledby="title" className="pb-8">
        <h1 id="title" className="font-serif text-[28px] leading-[1.2] text-ink min-[600px]:text-[40px]">{COPY.siteTitle}</h1>
        <p className="measure mt-3 text-[17px] text-ink">
          <span className="font-semibold">{verdictSummary(pub.verdicts)}.</span> <span className="text-slate">Six claims, each tested against a threshold written down before the data was read.</span>
        </p>
        <ol aria-label="All six verdicts" className="mt-4 flex h-11 w-full overflow-hidden rounded-lg border border-rule">
          {ordered.map((v) => (
            <li key={v.id} className="min-w-0 flex-1 border-r border-surface last:border-r-0">
              <a
                href={`#${v.id.toLowerCase()}`}
                className={`flex h-full items-center justify-center gap-1 text-[13px] font-semibold ${v.verdict === "Insufficient data" ? "hatch" : ""}`}
                style={{ background: v.verdict === "Insufficient data" ? undefined : `color-mix(in srgb, ${SEG[v.verdict]} 18%, var(--surface))`, color: SEG[v.verdict] }}
                aria-label={`${v.id}: ${VERDICT_WORD[v.verdict]}`}
              >
                <VerdictIcon v={v.verdict} size={15} />
                <span className="text-ink">{v.id}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <FreshnessLine asOf={s.as_of} date={s.date} version={pub.thresholds.t.version} locked={pub.thresholds.locked} />
        </div>
      </section>

      <section aria-labelledby="claims-h">
        <h2 id="claims-h" className="sr-only">Claims</h2>
        <ul className="grid gap-3">
          {ordered.map((v) => {
            const m = railFor(v, pub.thresholds.rules);
            return (
              <li key={v.id}>
                <details id={v.id.toLowerCase()} name="claim" className="group scroll-mt-20 rounded-lg border border-rule bg-surface">
                  <summary className="block cursor-pointer list-none px-4 py-4 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-col gap-3 min-[600px]:flex-row min-[600px]:items-start min-[600px]:justify-between">
                      <h3 className="measure font-serif text-[21px] leading-[1.3] text-ink">
                        <span className="sr-only">{v.id}. </span>
                        {plain(v.claim)}
                      </h3>
                      <VerdictBadge v={v.verdict} />
                    </div>
                    <div className="mt-4">
                      <ThresholdRail m={m} verdict={v.verdict} />
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-slate">
                      <span>
                        Measured <span className="num font-semibold text-ink">{m.valueText}</span>
                      </span>
                      <span aria-hidden>·</span>
                      <span className="num">{m.needsText}</span>
                      <span aria-hidden>·</span>
                      <EvidenceGrade g={v.evidence_grade} />
                      <span aria-hidden>·</span>
                      <span className="num">{v.window.days} {v.window.days === 1 ? "day" : "days"}</span>
                    </p>
                    <span className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-ink">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-180" aria-hidden>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      <span className="group-open:hidden">Show evidence</span>
                      <span className="hidden group-open:inline">Hide evidence</span>
                    </span>
                  </summary>
                  <div className="px-4 pb-5 sm:px-6">
                    <EvidencePanel v={v} m={m} date={s.date} extra={v.id === "H6" ? <IncidentSources s={s} /> : null} />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="key-h" className="mt-12">
        <h2 id="key-h" className="font-serif text-[21px] text-ink">Key numbers</h2>
        <div tabIndex={0} className="scroll-x mt-3 rounded-lg border border-rule bg-surface">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="r">Value</th>
                <th scope="col" className="r">Change</th>
                <th scope="col"><span className="sr-only">Source</span></th>
              </tr>
            </thead>
            <tbody>
              {keyRows.map((r) => (
                <tr key={r.label}>
                  <td className="text-ink">{r.label}</td>
                  <td className="r num font-semibold">{r.value}</td>
                  <td className="r num text-slate">{r.change ?? "—"}</td>
                  <td>
                    <SourceIcon href={r.source} name={r.label} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="measure mt-4 text-[15px] text-ink">
          {COPY.refused}:{" "}
          {m ? (
            <>
              <span className="num font-semibold">{num(m.rejected.pools)} pools, {usd(m.rejected.tvl)} claimed.</span>{" "}
              <Link href="/capital#integrity" className="underline underline-offset-4">
                See details
              </Link>
            </>
          ) : (
            <span className="text-slate">not reported right now.</span>
          )}
        </p>
      </section>
    </>
  );
}

function IncidentSources({ s }: { s: NonNullable<Awaited<ReturnType<typeof getPublished>>["snapshot"]> }) {
  const i = s.incident;
  return (
    <section>
      <h4 className="text-[13px] font-semibold text-slate">Incident sources</h4>
      <p className="measure mt-1">
        Incident date {i.date} (as reported). Reported loss {usd(i.amount_usd_range.low)} to {usd(i.amount_usd_range.high)}; exploit activity {i.timing_range.from} to {i.timing_range.to}.
      </p>
      <ul className="mt-2 grid gap-1">
        {i.sources.map((x) => (
          <li key={x.url} className="text-[15px]">
            <a href={x.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
              {x.publisher}
            </a>{" "}
            <span className="text-slate">
              ({x.kind === "official" ? "official" : "press"}, {x.published.slice(0, 10)})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
