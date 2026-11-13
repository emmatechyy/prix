import type { DepthRow } from "../snapshot/schema";
type DepthStatus = DepthRow["status"];

/** Pure helpers for the depth matrix (tested in tests/depth.test.ts). */
export const DEPTH_SIZES = [1_000, 10_000, 100_000, 1_000_000] as const;
export const BASELINE_SIZE = 1_000;

/**
 * Relative slippage of a quote vs the $1k baseline quote on the same route:
 *   1 - (out/in at size) / (out/in at $1k).
 * Fixed fees (e.g. the 20 bps unauthenticated 1Click app fee) cancel out. Never negative-clamped:
 * a negative value (better price at size) is reported as measured.
 */
export function relativeSlippage(inUsd: number, outUsd: number, baseInUsd: number, baseOutUsd: number): number | null {
  if (!(inUsd > 0 && outUsd > 0 && baseInUsd > 0 && baseOutUsd > 0)) return null;
  return 1 - outUsd / inUsd / (baseOutUsd / baseInUsd);
}

/** Map an HTTP status + error message from a quote API to a depth status. */
export function statusFromError(httpStatus: number | null, message: string): DepthStatus {
  const m = message.toLowerCase();
  if (httpStatus === 429 || /rate.?limit|too many requests/.test(m)) return "rate-limited";
  if (/paus|halt|maintenance|disabled/.test(m)) return "paused";
  if (/no liquidity|no route|not routable|insufficient liquidity|failed to get quote|amount is too (low|high)|tokenout is not valid|tokenin is not valid|no path|path not found/.test(m)) return "no-route";
  if (httpStatus === 401 || httpStatus === 403) return "not-configured";
  return "error";
}

/** Fill relative_slippage on every row from the $1k row of the same (route, origin, token). */
export function applyBaselines(rows: DepthRow[]): DepthRow[] {
  const key = (r: DepthRow) => `${r.route}|${r.router}|${r.origin}|${r.token_id}`;
  const base = new Map<string, DepthRow>();
  for (const r of rows) if (r.size_usd === BASELINE_SIZE && r.status === "ok") base.set(key(r), r);
  return rows.map((r) => {
    const b = base.get(key(r));
    if (r.status !== "ok" || !b || r.amount_in_usd == null || r.amount_out_usd == null || b.amount_in_usd == null || b.amount_out_usd == null)
      return { ...r, relative_slippage: null };
    return { ...r, relative_slippage: r.size_usd === BASELINE_SIZE ? 0 : relativeSlippage(r.amount_in_usd, r.amount_out_usd, b.amount_in_usd, b.amount_out_usd) };
  });
}

/** Best (lowest) relative slippage per token at a trade size across all ok rows. */
export function bestImpact(rows: DepthRow[], tokenId: string, size: number): { impact: number; row: DepthRow } | null {
  let best: { impact: number; row: DepthRow } | null = null;
  for (const r of rows) {
    if (r.token_id !== tokenId || r.size_usd !== size || r.status !== "ok" || r.relative_slippage == null) continue;
    if (!best || r.relative_slippage < best.impact) best = { impact: r.relative_slippage, row: r };
  }
  return best;
}

/** Convert a USD size to integer base units at a given USD price, exact to the token's decimals. */
export function usdToBaseUnits(usd: number, price: number, decimals: number): string {
  const amount = usd / price;
  const [i, f = ""] = amount.toFixed(Math.min(decimals, 18)).split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(i) * 10n ** BigInt(decimals) + BigInt(frac || "0")).toString();
}

