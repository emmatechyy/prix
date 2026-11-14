import { LineChart } from "@/components/svg-chart";
import type { Snapshot } from "@/lib/snapshot/schema";
import { num, usd } from "@/lib/format";
import { median } from "@/lib/thesis/stats";

const compactUsd = (v: number) => usd(v, { compact: true });
const compactNum = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : num(v));

/** Network and TVL charts, all from the published snapshot so they match the verdicts. */
export function NetworkView({ s }: { s: Snapshot }) {
  const dl = `/api/v1/snapshots/${s.date}`;
  const incident = { date: s.incident.date, label: `Incident ${s.incident.date}`, href: "/#h6" };
  const net = s.series.network.slice(-180);
  const med = median(s.series.rhea_tvl.map((p) => p.amm).filter((v): v is number => v != null && v > 0)) ?? 0;
  const tvl = s.series.rhea_tvl.slice(-90);
  const kept = tvl.filter((p) => p.amm != null && p.amm > 0 && p.amm <= 3 * med);
  const dropped = tvl.length - kept.length;
  return (
    <div className="grid gap-4 min-[900px]:grid-cols-2">
      <section className="rounded-[20px] bg-surface p-4 sm:p-5">
        <h3 className="font-serif text-[21px] text-ink">NEAR network activity</h3>
        <p className="mt-1 mb-3 text-[15px] text-slate">Daily active accounts and transactions, last {net.length} days.</p>
        <LineChart
          title="NEAR daily active accounts and transactions"
          lines={[
            { name: "Active accounts", points: net.map((d) => ({ date: d.date, value: d.active })), format: compactNum },
            { name: "Transactions", points: net.map((d) => ({ date: d.date, value: d.txns })), format: compactNum },
          ]}
          annotate={incident}
          download={dl}
          note={<>Source: NearBlocks daily stats, via snapshot {s.date}. Each line has its own scale.</>}
        />
      </section>
      <section className="rounded-[20px] bg-surface p-4 sm:p-5">
        <h3 className="font-serif text-[21px] text-ink">RHEA protocol TVL</h3>
        <p className="mt-1 mb-3 text-[15px] text-slate">AMM and lending TVL, daily, last {kept.length} days.</p>
        <LineChart
          title="RHEA AMM and lending TVL"
          lines={[
            { name: "AMM TVL", points: kept.map((p) => ({ date: p.date, value: p.amm })), format: compactUsd },
            { name: "Lending TVL", points: kept.map((p) => ({ date: p.date, value: p.lending })), format: compactUsd },
          ]}
          download={dl}
          note={<>Source: RHEA data service. {dropped} outlier {dropped === 1 ? "day" : "days"} excluded (AMM TVL above 3× the series median).</>}
        />
      </section>
      <section className="rounded-[20px] bg-surface p-4 sm:p-5 min-[900px]:col-span-2">
        <h3 className="font-serif text-[21px] text-ink">NEAR Intents custody and transactions</h3>
        <p className="mt-1 mb-3 text-[15px] text-slate">Assets held by intents.near at constant prices (archival RPC) and daily intents.near transactions, around the incident.</p>
        <LineChart
          title="NEAR Intents custody at constant prices and daily transactions"
          lines={[
            { name: "Custody (constant prices)", points: s.series.custody_constant.map((p) => ({ date: p.date, value: p.usd })), format: compactUsd },
            { name: "Daily transactions", points: s.series.intents_txns.filter((p) => p.date >= (s.series.custody_constant[0]?.date ?? "")).map((p) => ({ date: p.date, value: p.txns })), format: compactNum },
          ]}
          annotate={incident}
          download={dl}
          note={<>Custody covers {Math.round(s.series.custody_constant_meta.coverage * 100)}% of today’s custody value, priced as of {s.series.custody_constant_meta.price_as_of.slice(0, 10)}.</>}
        />
      </section>
    </div>
  );
}
