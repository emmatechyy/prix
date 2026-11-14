import type { DepthRow } from "@/lib/snapshot/schema";
import { DEPTH_SIZES } from "@/lib/depth/slippage";
import { cellFor, type RouteView } from "@/lib/depth/matrix";

const sizeLabel = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : `$${n / 1e3}k`);
const W = 560, H = 200, L = 44, R = 12, T = 12, B = 28;

/** Cost to trade at each size, NEAR Intents vs RHEA (spec §4.2). SVG, server-rendered, with a table view. */
export function CostChart({ rows, token, symbol, date }: { rows: DepthRow[]; token: string; symbol: string; date: string }) {
  const routes: { key: RouteView; name: string; dash?: string; color: string }[] = [
    { key: "intents", name: "NEAR Intents", color: "var(--ink)" },
    { key: "rhea", name: "RHEA", dash: "5 3", color: "var(--slate)" },
  ];
  const data = routes.map((r) => ({ ...r, cells: DEPTH_SIZES.map((z) => cellFor(rows, token, z, r.key)) }));
  const vals = data.flatMap((d) => d.cells.flatMap((c) => (c.kind === "value" ? [c.slippage] : [])));
  if (!data.some((d) => d.cells.some((c) => c.kind !== "none"))) return <p className="text-[15px] text-slate">Not reported: PRIX did not quote {symbol} in snapshot {date}.</p>;
  const max = Math.max(0.01, ...vals);
  const x = (i: number) => L + ((W - L - R) * i) / (DEPTH_SIZES.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const fmt = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
  const label = data.map((d) => `${d.name}: ${d.cells.map((c, i) => `${sizeLabel(DEPTH_SIZES[i])} ${c.kind === "value" ? fmt(c.slippage) : c.kind === "status" ? c.label.toLowerCase() : "not quoted"}`).join(", ")}`).join(". ");
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[640px]" role="img" aria-label={`Cost to trade ${symbol}. ${label}.`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--rule)" />
            <text x={L - 6} y={y(max * f) + 4} fontSize="13" textAnchor="end" fill="var(--slate)">
              {fmt(max * f)}
            </text>
          </g>
        ))}
        {DEPTH_SIZES.map((z, i) => (
          <text key={z} x={x(i)} y={H - 8} fontSize="13" textAnchor="middle" fill="var(--slate)">
            {sizeLabel(z)}
          </text>
        ))}
        {data.map((d) => {
          const pts = d.cells.map((c, i) => (c.kind === "value" ? `${x(i)},${y(c.slippage)}` : null));
          const segs: string[][] = [[]];
          pts.forEach((p) => (p ? segs.at(-1)!.push(p) : segs.push([])));
          return (
            <g key={d.key}>
              {segs.filter((s) => s.length > 1).map((s, i) => (
                <polyline key={i} points={s.join(" ")} fill="none" stroke={d.color} strokeWidth="2" strokeDasharray={d.dash} />
              ))}
              {d.cells.map((c, i) => (c.kind === "value" ? <circle key={i} cx={x(i)} cy={y(c.slippage)} r="3.5" fill={d.color} /> : null))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-slate">
        {data.map((d) => (
          <span key={d.key} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke={d.color} strokeWidth="2" strokeDasharray={d.dash} />
            </svg>
            <span className="text-ink">{d.name}</span>
          </span>
        ))}
      </figcaption>
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-ink">View as table</summary>
        <div tabIndex={0} className="scroll-x rounded-lg border border-rule">
          <table className="data">
            <caption className="sr-only">Cost to trade {symbol} by size and route</caption>
            <thead>
              <tr>
                <th scope="col">Route</th>
                {DEPTH_SIZES.map((z) => (
                  <th key={z} scope="col" className="r">
                    {sizeLabel(z)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{d.name}</td>
                  {d.cells.map((c, i) => (
                    <td key={i} className="r num">
                      {c.kind === "value" ? (c.baseline ? "Baseline" : fmt(c.slippage)) : c.kind === "status" ? c.label : "Not quoted"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <a href={`/api/v1/depth?token=${encodeURIComponent(token)}`} className="inline-flex min-h-11 items-center text-[15px] text-ink underline underline-offset-4">
        Download the quotes (JSON)
      </a>
    </figure>
  );
}
