import type { DepthRow } from "../snapshot/schema";

/** Depth-matrix view model (spec §4.3): one cell per token × size for a chosen route. Pure. */
export type RouteView = "intents" | "rhea" | "best";
export type Cell = { kind: "value"; row: DepthRow; slippage: number; baseline: boolean } | { kind: "status"; row: DepthRow; label: string } | { kind: "none" };

export const STATUS_LABEL: Record<DepthRow["status"], string> = {
  ok: "Measured",
  "no-route": "No route",
  error: "Quote failed",
  paused: "Paused",
  "rate-limited": "Rate-limited",
  "not-configured": "Not configured",
};

const inRoute = (r: DepthRow, v: RouteView) => v === "best" || (v === "intents" ? r.route === "intents" : r.route === "rhea-router");

/** Lowest measured slippage among the route's rows at this size; otherwise the most informative failure. */
export function cellFor(rows: DepthRow[], token: string, size: number, view: RouteView): Cell {
  const rs = rows.filter((r) => r.token_id === token && r.size_usd === size && inRoute(r, view));
  const ok = rs.filter((r) => r.status === "ok" && r.relative_slippage != null).sort((a, b) => a.relative_slippage! - b.relative_slippage!);
  if (ok.length) return { kind: "value", row: ok[0], slippage: Math.max(0, ok[0].relative_slippage!), baseline: size === 1000 };
  const pref: DepthRow["status"][] = ["paused", "rate-limited", "error", "not-configured", "no-route"];
  const fail = [...rs].sort((a, b) => pref.indexOf(a.status) - pref.indexOf(b.status))[0];
  if (fail && fail.status !== "ok") return { kind: "status", row: fail, label: STATUS_LABEL[fail.status] };
  if (fail) return { kind: "status", row: fail, label: "No baseline" };
  return { kind: "none" };
}

/**
 * Neutral heat (ink share of the cell background) for a slippage; colour stays reserved for verdicts.
 * Two bands with a gap in the middle so the cell text (ink below, paper above) always keeps AA contrast:
 * 0.1%–3.16% → 6–30%, 3.16%–100% → 62–78% (the split is the log midpoint).
 */
export function heat(s: number): number {
  if (s <= 0.001) return 0;
  const t = Math.min(1, Math.log10(s * 1000) / 3);
  return t < 0.5 ? Math.round(6 + t * 48) : Math.round(62 + (t - 0.5) * 32);
}
export const HEAT_DARK_TEXT_FROM = 62;
