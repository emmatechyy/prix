import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader, SourceError, SourceLink, Sources, VERDICT_TONE } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { SERIES } from "@/lib/palette";
import { getThesis } from "@/lib/model/thesis";
import { getNetwork } from "@/lib/model/network";
import { utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;
export const metadata: Metadata = { title: "Investment thesis" };

const VERDICT_TEXT = { Supported: "text-up", "Not supported": "text-danger", Mixed: "text-warn", "Insufficient data": "text-muted" } as const;
const dirCls = { for: "text-up", against: "text-danger", neutral: "text-muted" } as const;
const dirLabel = { for: "for", against: "against", neutral: "context" } as const;

export default async function Thesis() {
  const [t, net] = await Promise.all([safe(getThesis), safe(getNetwork)]);
  return (
    <>
      <PageHeader eyebrow="Investment thesis" title="Is NEAR a long-term investment? Five claims, tested live.">
        Each claim has a fixed, published rule. The verdict is computed from today&apos;s data — PRIX does not write the conclusion by hand, and it shows the evidence that cuts against the case as prominently as the evidence for it. Re-run any of it with <code className="num rounded-md bg-surface px-1.5 py-0.5 text-[0.9em] text-ink">pnpm snapshot</code>.{t.ok && <span className="mt-3 block text-[14px]">Snapshot {utc(t.v.asOf)}</span>}
      </PageHeader>
      {!t.ok ? (
        <SourceError what="The thesis" error={t.e} />
      ) : (
        <div className="space-y-16 sm:space-y-24">
          {t.v.hypotheses.map((h) => (
            <article key={h.id} aria-labelledby={h.id} className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-12">
              <div className="appear lg:sticky lg:top-28 lg:self-start">
                <p className="text-[15px] font-medium text-muted">Hypothesis {h.id.slice(1)} · verdict</p>
                <p className={`display mt-2 text-[48px] sm:text-[56px] ${VERDICT_TEXT[h.verdict]}`}>{h.verdict}</p>
                <div className="mt-3"><Badge tone={VERDICT_TONE[h.verdict]}>{h.id} · {h.verdict}</Badge></div>
                <p className="mt-4 text-[16px] leading-[1.55] text-muted">{h.why}</p>
              </div>
              <div className="min-w-0 space-y-3">
                <div className="appear max-w-[680px] rounded-[20px_20px_20px_6px] bg-surface px-5 py-4">
                  <p className="text-[14px] text-muted">Claim</p>
                  <h2 id={h.id} className="mt-1 font-serif text-[26px] leading-[1.15] text-text sm:text-[30px]">{h.claim}</h2>
                </div>
                <Card>
                  <div className="scroll-x">
                    <table className="data">
                      <thead><tr><th>Evidence</th><th className="r">Value</th><th>Reads as</th><th>Source</th></tr></thead>
                      <tbody>
                        {h.evidence.map((e) => (
                          <tr key={e.label}>
                            <td className="min-w-[200px] whitespace-normal text-muted">{e.label}</td>
                            <td className="r num text-ink"><div className="ml-auto w-max max-w-[240px] whitespace-normal break-words">{e.value}</div></td>
                            <td className={`text-[13px] font-medium ${dirCls[e.dir]}`}>{dirLabel[e.dir]}</td>
                            <td>{e.source ? <SourceLink href={e.source} compact /> : <span className="text-[12.5px] text-faint">derived</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <div className="appear ml-auto grid max-w-[680px] gap-4 rounded-[20px_20px_6px_20px] bg-tint px-5 py-4 text-[15.5px] leading-[1.55] sm:grid-cols-2">
                  <div>
                    <p className="text-[14px] font-medium text-muted">PRIX decision rule</p>
                    <p className="mt-1 text-text">{h.rule}</p>
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-muted">What would change the verdict</p>
                    <p className="mt-1 text-text">{h.changeMind}</p>
                  </div>
                </div>
              </div>
            </article>
          ))}
          {net.ok && (
            <Card>
              <CardHeader title="Usage vs price, 365 days" subtitle="Daily active accounts (left axis) against the NEAR price (right axis). Supports H1." />
              <div className="px-5 pb-5 sm:px-6">
                <TimeChart
                  height={280}
                  label="NEAR daily active accounts versus NEAR price over 365 days"
                  series={[
                    { name: "Active accounts", color: SERIES.primary, scale: "left", data: net.v.days.map((d) => ({ time: d.date, value: d.active })), format: "num" },
                    { name: "NEAR price (USD)", color: SERIES.secondary, type: "line", data: net.v.days.filter((d) => d.price != null).map((d) => ({ time: d.date, value: d.price! })), format: "price" },
                  ]}
                />
              </div>
              <Sources urls={net.v.sources} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
