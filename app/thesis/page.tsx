import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader, SourceError, SourceLink, Sources } from "@/components/ui";
import { TimeChart } from "@/components/chart";
import { getThesis } from "@/lib/model/thesis";
import { getNetwork } from "@/lib/model/network";
import { utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;
export const metadata: Metadata = { title: "Investment thesis" };

const tone = { Supported: "accent", "Not supported": "danger", Mixed: "warn", "Insufficient data": "neutral" } as const;
const dirCls = { for: "text-accent", against: "text-danger", neutral: "text-muted" } as const;
const dirLabel = { for: "for", against: "against", neutral: "context" } as const;

export default async function Thesis() {
  const [t, net] = await Promise.all([safe(getThesis), safe(getNetwork)]);
  return (
    <>
      <PageHeader eyebrow="Investment thesis" title="Is NEAR a long-term investment? Five claims, tested live.">
        Each claim has a fixed, published rule. The verdict is computed from today&apos;s data — PRIX does not write the conclusion by hand, and it shows the evidence that cuts against the case as prominently as the evidence for it. Re-run any of it with <code className="num rounded bg-surface-2 px-1 text-text">pnpm snapshot</code>.
      </PageHeader>
      {!t.ok ? (
        <SourceError what="The thesis" error={t.e} />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-faint">Snapshot {utc(t.v.asOf)}</p>
          {t.v.hypotheses.map((h) => (
            <Card key={h.id}>
              <CardHeader id={h.id} title={<span className="flex flex-wrap items-center gap-2"><span className="num text-faint">{h.id}</span>{h.claim}</span>} subtitle={h.why} right={<Badge tone={tone[h.verdict]}>{h.verdict}</Badge>} />
              <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
                <div className="scroll-x border-b border-border lg:border-r lg:border-b-0">
                  <table className="data">
                    <thead><tr><th>Evidence</th><th className="r">Value</th><th>Reads as</th><th>Source</th></tr></thead>
                    <tbody>
                      {h.evidence.map((e) => (
                        <tr key={e.label}>
                          <td className="whitespace-normal text-muted">{e.label}</td>
                          <td className="r num max-w-[280px] whitespace-normal text-text">{e.value}</td>
                          <td className={`text-xs ${dirCls[e.dir]}`}>{dirLabel[e.dir]}</td>
                          <td>{e.source ? <SourceLink href={e.source} compact /> : <span className="text-faint">derived</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 p-4 text-[13px] leading-relaxed">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-faint">Decision rule</p>
                    <p className="mt-1 text-muted">{h.rule}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-faint">What would change the verdict</p>
                    <p className="mt-1 text-muted">{h.changeMind}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {net.ok && (
            <Card>
              <CardHeader title="Usage vs price, 365 days" subtitle="Daily active accounts (left axis) against the NEAR price (right axis). Supports H1." />
              <div className="p-4">
                <TimeChart
                  height={280}
                  label="NEAR daily active accounts versus NEAR price over 365 days"
                  series={[
                    { name: "Active accounts", color: "#00e599", scale: "left", data: net.v.days.map((d) => ({ time: d.date, value: d.active })), format: "num" },
                    { name: "NEAR price (USD)", color: "#f2b84b", type: "line", data: net.v.days.filter((d) => d.price != null).map((d) => ({ time: d.date, value: d.price! })), format: "price" },
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
