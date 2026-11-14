import Link from "next/link";
import { NoSnapshot, snapshotApi } from "@/components/snapshot-ui";
import { SegmentedControl } from "@/components/segmented";
import { getPublished } from "@/lib/server/published";
import { DEPTH_SIZES } from "@/lib/depth/slippage";
import { cellFor, heat, HEAT_DARK_TEXT_FROM, type Cell, type RouteView } from "@/lib/depth/matrix";
import { utc } from "@/lib/format";

const sizeLabel = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : `$${n / 1e3}k`);
const ROUTE_LABEL: Record<RouteView, string> = { intents: "NEAR Intents", rhea: "RHEA", best: "Best of both" };

function CellView({ c, token, size }: { c: Cell; token: string; size: number }) {
  if (c.kind === "none") return <span className="text-[13px] text-slate">Not quoted</span>;
  const r = c.row;
  const route = r.route === "intents" ? `NEAR Intents 1Click, from ${r.origin}` : r.router_version;
  const pct = c.kind === "value" ? (c.baseline ? "Baseline" : `${(c.slippage * 100).toFixed(2)}%`) : c.label;
  const h = c.kind === "value" ? heat(c.slippage) : 0;
  return (
    <details className="group relative">
      <summary
        className={`flex min-h-11 min-w-[84px] cursor-pointer list-none items-center justify-end rounded px-2 text-[15px] [&::-webkit-details-marker]:hidden ${c.kind === "status" ? "hatch text-[13px] text-ink" : "num"}`}
        style={c.kind === "value" ? { background: `color-mix(in srgb, ${h >= HEAT_DARK_TEXT_FROM ? "var(--heat-deep)" : "var(--ink)"} ${h}%, var(--surface))`, color: h >= HEAT_DARK_TEXT_FROM ? "var(--paper)" : "var(--ink)" } : undefined}
        aria-label={`${token} at ${sizeLabel(size)}: ${c.kind === "value" ? (c.baseline ? "baseline quote" : `${pct} slippage`) : c.label}. Show quote details`}
      >
        {pct}
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-64 rounded-[20px] bg-surface p-3 text-left text-[13px] leading-relaxed whitespace-normal text-ink">
        <p className="font-semibold">{route}</p>
        {c.kind === "value" ? (
          <p className="num">
            In ${r.amount_in_usd?.toFixed(2)} → out ${r.amount_out_usd?.toFixed(2)}
          </p>
        ) : (
          <p>{c.label}: no usable quote at this size. Nothing is filled in.</p>
        )}
        <p>Fee: {r.app_fee_bps ? `${r.app_fee_bps} bps app fee ($${r.fee_usd?.toFixed(2)}), excluded from slippage` : "no flat app fee"}</p>
        <p>Quote time: {r.quote_ms != null ? `${r.quote_ms} ms` : "Not reported"}</p>
        <p>Fetched {utc(r.fetched_at)}</p>
      </div>
    </details>
  );
}

export async function DepthView({ route = "best" }: { route?: RouteView }) {
  const { snapshot: s } = await getPublished();
  if (!s) return <NoSnapshot />;
  const rows = s.depth;
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const failed = (counts.error ?? 0) + (counts.paused ?? 0) + (counts["rate-limited"] ?? 0);
  const order = s.index.map((r) => r.token_id);
  const sym = new Map(s.index.map((r) => [r.token_id, r.symbol]));
  const tokens = [...new Set(rows.map((r) => r.token_id))].sort((a, b) => (order.indexOf(a) + 1 || 1e9) - (order.indexOf(b) + 1 || 1e9));
  const lastOk = rows.filter((r) => r.route === "intents" && r.status === "ok").map((r) => r.fetched_at).sort().at(-1);
  const intentsDown = rows.some((r) => r.route === "intents" && (r.status === "paused" || r.status === "rate-limited"));
  return (
    <>
      <h2 className="display text-[44px] text-ink sm:text-[56px]">Depth</h2>
      <p className="measure mt-2 text-[15px] text-slate">
        What an order of each size would cost, compared with a $1k order on the same route. Cell = relative slippage, net of any flat app fee. NEAR Intents rows are dry-run quotes (nothing can be sent); RHEA rows are Smart Router quotes. {rows.length} quotes, {counts.ok ?? 0} measured, {counts["no-route"] ?? 0} with no route, {failed} failed, paused or rate-limited, all shown. From snapshot{" "}
        <a href={snapshotApi(s.date)} className="num text-ink underline underline-offset-4">
          {s.date}
        </a>
        .
      </p>
      {intentsDown && lastOk && <p className="mt-2 text-[15px] text-ink">NEAR Intents quotes were unavailable for part of this run. Showing the last successful quotes from {utc(lastOk)}.</p>}
      <div className="mt-4 mb-3">
        <SegmentedControl
          label="Depth route"
          current={route}
          items={(["intents", "rhea", "best"] as const).map((k) => ({ key: k, label: k === "best" ? "Best" : k === "intents" ? "Intents" : "RHEA", href: `/capital?route=${k}#depth` }))}
        />
      </div>
      <div tabIndex={0} className="scroll-x rounded-[20px] bg-surface">
        <table className="data [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-surface [&_th:first-child]:left-0 [&_th:first-child]:z-20">
          <caption className="sr-only">Relative slippage by token and order size, {ROUTE_LABEL[route]}</caption>
          <thead>
            <tr>
              <th scope="col">Token</th>
              {DEPTH_SIZES.map((z) => (
                <th key={z} scope="col" className="r">
                  {sizeLabel(z)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t}>
                <th scope="row" className="!static !border-b-rule !bg-surface !text-[15px] !font-medium !text-ink">
                  <Link href={`/token/${encodeURIComponent(t)}`} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                    {sym.get(t) ?? t}
                  </Link>
                </th>
                {DEPTH_SIZES.map((z) => (
                  <td key={z} className="r !px-1 !py-1">
                    <CellView c={cellFor(rows, t, z, route)} token={sym.get(t) ?? t} size={z} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-slate">
        Darker = costlier (under 3% light, 3% and over dark). Hatched cells had no usable quote. Tap a cell for the route, fee, quote time and fetch time. Raw rows:{" "}
        <a href="/api/v1/depth" className="text-ink underline underline-offset-4">
          /api/v1/depth
        </a>
        . Sources:{" "}
        <a href="https://1click.chaindefuser.com/docs/v0/openapi.yaml" className="text-ink underline underline-offset-4" target="_blank" rel="noreferrer">
          1Click quotes
        </a>
        ,{" "}
        <a href="https://smartrouter.rhea.finance/findPath" className="text-ink underline underline-offset-4" target="_blank" rel="noreferrer">
          RHEA Smart Router
        </a>
        .
      </p>
    </>
  );
}
