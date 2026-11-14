import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader, VERDICT_TONE } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";
import { EvidenceSource, NoSnapshot, Provenance, snapshotApi } from "@/components/snapshot-ui";
import { TimeChart } from "@/components/chart";
import { SERIES } from "@/lib/palette";
import { getPublished } from "@/lib/server/published";
import type { Snapshot } from "@/lib/snapshot/schema";
import { h4Breakdown, type Verdict } from "@/lib/thesis/engine";
import type { Rules } from "@/lib/thresholds/rules";
import { median } from "@/lib/thesis/stats";
import { num, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Investment thesis" };

const VERDICT_TEXT = { Supported: "text-up", "Not supported": "text-danger", Mixed: "text-warn", "Insufficient data": "text-muted" } as const;
const dirCls = { for: "text-up", against: "text-danger", neutral: "text-muted" } as const;
const dirLabel = { for: "for", against: "against", neutral: "context" } as const;

/** The series each claim is computed from, for the history sparkline. */
function history(id: Verdict["id"], s: Snapshot, rules: Rules): { values: number[]; label: string } | null {
  const S = s.series;
  switch (id) {
    case "H1":
      return { values: S.network.slice(-180).map((d) => d.active ?? NaN), label: "daily active accounts, 180d" };
    case "H2":
      return S.h2_daily.length > 1 ? { values: S.h2_daily.map((d) => d.ratio), label: `custody ÷ clean TVL, ${S.h2_daily.length} snapshots` } : null;
    case "H4":
    {
      const b = h4Breakdown(S.pool_volume_all, s.rhea.clean_tvl_usd, rules.H4);
      return b ? { values: b.daily.map((d) => (d.total > 0 ? d.organic / d.total : NaN)), label: `daily share of all-pool volume from verified pools, ${b.daily.length}d` } : null;
    }
    case "H5": {
      const by = new Map<string, number[]>();
      for (const b of S.flow_buckets) by.set(b.end.slice(0, 10), [...(by.get(b.end.slice(0, 10)) ?? []), b.deposits_usd - b.withdrawals_usd]);
      const v = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, xs]) => xs.reduce((a, x) => a + x, 0) / xs.length);
      return v.length > 1 ? { values: v, label: `observed net flow per day, ${v.length} days (partial coverage)` } : null;
    }
    case "H6":
      return { values: S.custody_constant.map((d) => d.usd), label: "custody at constant prices since Sep" };
    default:
      return null;
  }
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted">{k}</dt>
      <dd className="mt-0.5 text-[15px] leading-[1.45] break-words text-text">{children}</dd>
    </div>
  );
}

export default async function Thesis() {
  const { snapshot: s, verdicts, thresholds } = await getPublished();
  return (
    <>
      <PageHeader eyebrow="Investment thesis" title="Is NEAR a long-term investment? Six claims, pre-registered.">
        Each claim has a numeric rule fixed in <code className="num rounded-md bg-surface px-1.5 py-0.5 text-[0.9em] text-ink">thresholds/v1.yaml</code> before the verdicts are run. A pure engine computes every verdict from one published, hashed snapshot. Evidence that cuts against the case is shown beside the evidence for it. Re-run it offline with <code className="num rounded-md bg-surface px-1.5 py-0.5 text-[0.9em] text-ink">pnpm verdicts</code>.
        {s && <Provenance date={s.date} sha={s.sha256} asOf={s.as_of} version={thresholds.t.version} locked={thresholds.locked} />}
      </PageHeader>
      {!s ? (
        <NoSnapshot />
      ) : (
        <div className="space-y-16 sm:space-y-24">
          <nav aria-label="Claims" className="appear -mt-4 flex flex-wrap gap-2">
            {verdicts.map((v) => (
              <a key={v.id} href={`#${v.id}`} className="inline-flex items-center gap-2 rounded-full border border-border-strong py-1.5 pr-3.5 pl-1.5 text-[14px] hover:bg-tint">
                <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-[12.5px] text-on-accent">{v.id}</span>
                <span className={VERDICT_TEXT[v.verdict]}>{v.verdict}</span>
              </a>
            ))}
          </nav>
          {verdicts.map((v) => {
            const h = history(v.id, s, thresholds.rules);
            return (
              <article key={v.id} aria-labelledby={v.id} className="grid scroll-mt-28 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
                <div className="appear lg:sticky lg:top-28 lg:self-start">
                  <p className="text-[15px] font-medium text-muted">Hypothesis {v.id.slice(1)} · verdict</p>
                  <p className={`display mt-2 text-[44px] sm:text-[52px] ${VERDICT_TEXT[v.verdict]}`}>{v.verdict}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone={VERDICT_TONE[v.verdict]}>{v.id} · {v.verdict}</Badge>
                    <Badge title="A: direct on-chain · B: indexer/API · C: derived or modelled">evidence grade {v.evidence_grade}</Badge>
                  </div>
                  {v.coverage && (
                    <div className="mt-5 max-w-[240px]" aria-label={`Coverage ${(v.coverage.share * 100).toFixed(2)} percent; needs ${(v.coverage.min * 100).toFixed(0)} percent`}>
                      <p className="flex items-baseline justify-between text-[13px] text-muted">
                        <span>Coverage (lower of 7d, 30d)</span>
                        <span className={`num ${v.coverage.share >= v.coverage.min ? "text-up" : "text-danger"}`}>{(v.coverage.share * 100).toFixed(2)}%</span>
                      </p>
                      <div className="relative mt-1.5 h-2 rounded-full bg-surface">
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(0.5, Math.min(100, v.coverage.share * 100))}%` }} />
                        <div className="absolute top-[-3px] h-[14px] w-[2px] bg-ink" style={{ left: `${v.coverage.min * 100}%` }} title="minimum coverage" />
                      </div>
                      <p className="mt-1 text-[12.5px] text-faint">{v.coverage.hours.toFixed(1)} of {v.coverage.window_hours} h observed (30d); a verdict needs ≥ {(v.coverage.min * 100).toFixed(0)}% of the 7d and 30d windows. Nothing is extrapolated.</p>
                    </div>
                  )}
                  {h && (
                    <div className="mt-5">
                      <Sparkline values={h.values} width={220} height={40} />
                      <p className="mt-1 text-[12.5px] text-faint">{h.label}</p>
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="appear max-w-[680px] rounded-[20px_20px_20px_6px] bg-surface px-5 py-4">
                    <p className="text-[14px] text-muted">Claim</p>
                    <h2 id={v.id} className="mt-1 font-serif text-[26px] leading-[1.15] text-text sm:text-[30px]">{v.claim}</h2>
                  </div>
                  <Card>
                    <dl className="grid gap-x-8 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
                      <Field k="Metric">{v.metric}</Field>
                      <Field k={`Measured (${v.metric_label})`}>
                        <span className="num text-ink">{v.metric_value == null ? "not reported" : Math.abs(v.metric_value) >= 1000 ? usd(v.metric_value) : /share/.test(v.metric_label) ? `${(v.metric_value * 100).toFixed(1)}%` : num(v.metric_value, 3)}</span>
                      </Field>
                      <Field k="Supported if">{v.threshold_supported}</Field>
                      <Field k="Not supported if">{v.threshold_not_supported}</Field>
                      <Field k={v.verdict === "Insufficient data" ? "Why insufficient" : "Margin to the next verdict"}>{v.margin_to_next}</Field>
                      <Field k="Window · sample">
                        <span className="num">{v.window.from} → {v.window.to}</span> · {v.window.days} day{v.window.days === 1 ? "" : "s"} · n = {v.sample_size.toLocaleString("en-US")}
                      </Field>
                      <div className="sm:col-span-2">
                        <Field k="Flip condition">{v.flip_condition}</Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field k="Snapshot hashes">
                          <span className="flex flex-wrap gap-x-3 gap-y-1">
                            {v.snapshot_hashes.slice(0, 6).map((x) => (
                              <a key={x} href={snapshotApi(s.date)} className="num text-[12.5px] text-faint hover:text-text" title={x}>{x === "this-snapshot" ? "this snapshot" : `${x.slice(0, 12)}…`}</a>
                            ))}
                            {v.snapshot_hashes.length > 6 && <span className="text-[12.5px] text-faint">+{v.snapshot_hashes.length - 6} more</span>}
                          </span>
                        </Field>
                      </div>
                    </dl>
                  </Card>
                  {v.evidence.length > 0 && (
                    <Card>
                      <div className="scroll-x">
                        <table className="data">
                          <thead><tr><th>Evidence</th><th className="r">Value</th><th>Reads as</th><th>Source</th></tr></thead>
                          <tbody>
                            {v.evidence.map((e) => (
                              <tr key={e.label}>
                                <td className="min-w-[220px] whitespace-normal text-muted"><div className="max-w-[420px] whitespace-normal">{e.label}</div></td>
                                <td className="r num text-ink"><div className="ml-auto w-max max-w-[220px] whitespace-normal break-words">{e.value}</div></td>
                                <td className={`text-[13px] font-medium ${dirCls[e.dir]}`}>{dirLabel[e.dir]}</td>
                                <td><EvidenceSource source={e.source} date={s.date} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {v.id === "H6" && <IncidentPanel s={s} />}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/** §8.9: before/after the 2026-10-01 NEAR Intents exploit, with the date's sources. */
function IncidentPanel({ s }: { s: Snapshot }) {
  const D = s.incident.date;
  const c = s.series.custody_constant;
  const t = s.series.intents_txns.filter((d) => d.date >= "2026-09-15");
  const before = (xs: { date: string }[]) => xs.filter((d) => d.date < D && d.date >= addDaysUTC(D, -7));
  const cb = before(c).map((d) => (d as (typeof c)[number]).usd);
  const tb = before(t).map((d) => (d as (typeof t)[number]).txns);
  const cLast = c.at(-1);
  const tLast = t.at(-1);
  return (
    <Card>
      <CardHeader
        title={`Before and after ${D} (reported)`}
        subtitle={
          <>
            Incident date <strong>{D} (reported)</strong>; it only sets the H6 baseline. Reported loss{" "}
            {s.incident.amount_usd_range.low === s.incident.amount_usd_range.high ? usd(s.incident.amount_usd_range.low, { compact: true }) : `${usd(s.incident.amount_usd_range.low, { compact: true })}–${usd(s.incident.amount_usd_range.high, { compact: true })}`}
            {s.incident.amount_usd_range.low === s.incident.amount_usd_range.high ? " (all sources agree)" : ""}; timing range {s.incident.timing_range.from.slice(0, 16).replace("T", " ")} – {s.incident.timing_range.to.slice(0, 16).replace("T", " ")} UTC ({s.incident.timing_range.note}). Sources:{" "}
            {s.incident.sources.map((x, i) => (
              <span key={x.url}>
                {i > 0 && "; "}
                <a href={x.url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-text">{x.publisher}</a> ({x.kind}, {x.published.slice(0, 10)})
              </span>
            ))}
            . Custody is a quantity index: archival <code className="num">ft_balance_of(intents.near)</code> at the first block of each UTC day for {s.series.custody_constant_meta.assets.map((a) => a.symbol).join(", ")}
            {" "}({(s.series.custody_constant_meta.coverage * 100).toFixed(0)}% of today&apos;s custody), valued at this snapshot&apos;s prices.
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-4 sm:px-6">
        {[
          ["Custody, 7d pre-incident median", cb.length ? usd(median(cb), { compact: true }) : "not reported"],
          [`Custody, latest (${cLast?.date ?? "—"})`, cLast ? usd(cLast.usd, { compact: true }) : "not reported"],
          ["Txns/day, 7d pre-incident median", tb.length ? num(median(tb)) : "not reported"],
          [`Txns/day, latest (${tLast?.date ?? "—"})`, tLast ? num(tLast.txns) : "not reported"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[14px] bg-bg px-4 py-3">
            <p className="text-[12.5px] leading-snug text-muted">{k}</p>
            <p className="num mt-1 text-[18px] text-ink">{v}</p>
          </div>
        ))}
      </div>
      <div className="px-5 pt-4 pb-5 sm:px-6">
        <TimeChart
          height={260}
          label="intents.near custody at constant prices and daily intents.near transactions around the 2026-10-01 incident"
          series={[
            { name: "Custody, constant prices (USD)", color: SERIES.primary, scale: "left", data: c.map((d) => ({ time: d.date, value: d.usd })), format: "usd" },
            { name: "intents.near txns/day", color: SERIES.secondary, type: "line", data: t.map((d) => ({ time: d.date, value: d.txns })), format: "num" },
          ]}
        />
        <p className="mt-2 text-[12.5px] text-faint">Archival RPC blocks {c[0]?.block ?? "—"} → {c.at(-1)?.block ?? "—"}; txns from NearBlocks <code className="num">/v3/accounts/intents.near/stats/txns</code>. Raw series: <a className="underline underline-offset-4 hover:text-text" href={`/api/v1/history?claim=H6`}>/api/v1/history?claim=H6</a>.</p>
      </div>
    </Card>
  );
}
function addDaysUTC(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
