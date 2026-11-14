import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader, STAT_GRID, Stat, type Tone } from "@/components/ui";
import { NoSnapshot, Provenance, snapshotApi } from "@/components/snapshot-ui";
import { getPublished } from "@/lib/server/published";
import { DEPTH_SIZES } from "@/lib/depth/slippage";
import type { DepthRow } from "@/lib/snapshot/schema";



const STATUS_TONE: Record<DepthRow["status"], Tone> = { ok: "up", "no-route": "neutral", error: "danger", paused: "warn", "rate-limited": "warn", "not-configured": "neutral" };
const sizeLabel = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : `$${n / 1e3}k`);

function Cell({ r }: { r: DepthRow | undefined }) {
  if (!r) return <span className="text-faint">—</span>;
  if (r.status !== "ok") return <Badge tone={STATUS_TONE[r.status]} title={r.error}>{r.status}</Badge>;
  if (r.size_usd === 1000 && r.relative_slippage === 0) return <span className="text-[13px] text-faint" title={`Baseline quote: in $${r.amount_in_usd?.toFixed(2)} → out $${r.amount_out_usd?.toFixed(2)}`}>baseline</span>;
  if (r.relative_slippage == null) return <span className="text-[13px] text-faint" title="No $1k baseline quote on this route">no baseline</span>;
  const v = r.relative_slippage;
  const cls = v <= 0.01 ? "text-up" : v <= 0.1 ? "text-warn" : "text-danger";
  return (
    <span className={`num ${cls}`} title={`in $${r.amount_in_usd?.toFixed(2)} → out $${r.amount_out_usd?.toFixed(2)}${r.app_fee_bps ? ` · app fee ${r.app_fee_bps} bps ($${r.fee_usd?.toFixed(2)}), excluded from slippage` : ""} · ${r.router_version} · ${r.quote_ms ?? "?"} ms`}>
      {(v * 100).toFixed(2)}%
    </span>
  );
}

export async function DepthView() {
  const { snapshot: s, thresholds } = await getPublished();
  if (!s) return (<><PageHeader eyebrow="Depth" title="Depth matrix" /><NoSnapshot /></>);
  const rows = s.depth;
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const order = s.index.map((r) => r.token_id);
  const sym = new Map(s.index.map((r) => [r.token_id, r.symbol]));
  const groups = new Map<string, Map<string, DepthRow[]>>();
  for (const r of rows) {
    const lane = r.route === "intents" ? (r.origin === "any" ? "NEAR Intents · not listed" : `NEAR Intents · from ${r.origin}`) : r.router.startsWith("amm-math") ? "RHEA · AMM reserve math" : "RHEA Smart Router V1 · sell for USDC";
    const g = groups.get(r.token_id) ?? new Map<string, DepthRow[]>();
    g.set(lane, [...(g.get(lane) ?? []), r]);
    groups.set(r.token_id, g);
  }
  const tokens = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <>
      <PageHeader eyebrow="Depth" title="What a real order would cost, by size and route.">
        Relative slippage = 1 − (out/in at size) ÷ (out/in of the $1k quote on the same route), both net of any flat app fee: until PRIX has a 1Click partner key every 1Click quote carries a 0.2% (20 bps) fee, which is reported as its own field and removed before slippage is computed. Every row names its router and version. NEAR Intents rows are 1Click <strong className="text-text">dry-run</strong> quotes that buy the token with BTC, ETH or SOL; dry quotes return no deposit address, so nothing can be sent. RHEA rows sell the token for USDC through the Smart Router. Failed, paused and rate-limited quotes are shown, never hidden or filled in.
        <Provenance date={s.date} sha={s.sha256} asOf={s.as_of} version={thresholds.t.version} locked={thresholds.locked} />
      </PageHeader>
      <div className={STAT_GRID}>
        <Stat label="Quotes attempted" value={s.depth_meta.quotes_attempted} sub={`1Click cap ${s.depth_meta.cap} per run, concurrency 3`} source={snapshotApi(s.date)} />
        <Stat label="Rows ok" value={counts.ok ?? 0} sub={`of ${rows.length} rows`} tone="up" />
        <Stat label="No route" value={counts["no-route"] ?? 0} sub="no liquidity or not listed" />
        <Stat label="Errors · paused · rate-limited" value={`${counts.error ?? 0} · ${counts.paused ?? 0} · ${counts["rate-limited"] ?? 0}`} tone={(counts.error ?? 0) + (counts.paused ?? 0) + (counts["rate-limited"] ?? 0) ? "warn" : undefined} sub="shown in the matrix" />
        <Stat label="Auth" value={s.depth_meta.oneclick_auth === "none" ? "none" : s.depth_meta.oneclick_auth} sub={`1Click ${s.depth_meta.oneclick_auth === "none" ? "unauthenticated (20 bps app fee, reported separately, excluded from slippage)" : "key configured"} · RHEA aggregator V2 ${s.depth_meta.aggregator_auth}`} />
      </div>
      <Card className="mt-4">
        <CardHeader title="Matrix" subtitle={<>Green ≤ 1% · amber ≤ 10% · red &gt; 10%. Hover a cell for amounts and latency, or a status for the upstream message. Raw rows: <a className="underline underline-offset-4 hover:text-text" href="/api/v1/depth">/api/v1/depth</a>.</>} />
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Token</th>
                <th>Route</th>
                {DEPTH_SIZES.map((z) => <th key={z} className="r">{sizeLabel(z)}</th>)}
              </tr>
            </thead>
            <tbody>
              {tokens.flatMap((t) =>
                [...groups.get(t)!.entries()].map(([lane, rs], i) => (
                  <tr key={t + lane}>
                    <td>{i === 0 ? <Link href={`/token/${encodeURIComponent(t)}`} className="font-medium text-ink hover:text-accent hover:underline">{sym.get(t) ?? t}</Link> : null}</td>
                    <td className="text-[13.5px] whitespace-nowrap text-muted">
                      {lane}
                      <span className="block text-[13px] text-faint">
                        {rs[0].router_version}
                        {rs.some((r) => r.app_fee_bps) ? ` · app fee ${Math.max(...rs.map((r) => r.app_fee_bps ?? 0))} bps, reported separately` : ""}
                      </span>
                    </td>
                    {DEPTH_SIZES.map((z) => <td key={z} className="r"><Cell r={rs.find((r) => r.size_usd === z)} /></td>)}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-5 py-3.5 text-[13px] text-faint sm:px-6">
          Sources: <a className="underline underline-offset-4 hover:text-text" href="https://1click.chaindefuser.com/docs/v0/openapi.yaml" target="_blank" rel="noreferrer">1Click /v0/quote (dry:true)</a> ·{" "}
          <a className="underline underline-offset-4 hover:text-text" href="https://smartrouter.rhea.finance/findPath" target="_blank" rel="noreferrer">smartrouter.rhea.finance/findPath</a> · AMM math = (1 − fee)·X/(X + x) on the deepest clean pool&apos;s reserves (evidence grade C) · <a className="underline underline-offset-4 hover:text-text" href={snapshotApi(s.date)}>snapshot {s.date}</a>
        </div>
      </Card>
    </>
  );
}
