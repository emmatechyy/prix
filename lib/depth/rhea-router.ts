import "server-only";
import { mapLimit } from "../http";
import { findPath } from "../sources/rhea";
import { USDC } from "../sources/endpoints";
import type { Market } from "../model/market";
import type { DepthRow } from "../snapshot/schema";
import { applyBaselines, DEPTH_SIZES, statusFromError, usdToBaseUnits } from "./slippage";

/**
 * RHEA depth: sell `size` USD of each token for USDC.
 * 1. RHEA Smart Router V1 (smartrouter.rhea.finance/findPath, the endpoint behind the cross-chain SDK's findPath).
 * 2. RHEA aggregator V2 (SwapClient) needs a JWT from boss.rhea.finance; without RHEA_AGGREGATOR_API_KEY
 *    it is reported as not-configured instead of being called.
 * 3. If V1 has no route at any size, exact constant-product math on the deepest clean AMM pool's
 *    on-chain reserves (router "amm-math"; evidence grade C) — the same fallback the index used before.
 */
export function aggregatorAuth(): "configured" | "not-configured" {
  return process.env.RHEA_AGGREGATOR_API_KEY ? "configured" : "not-configured";
}

/** out/spot for a constant-product pool: (1 − fee) · X / (X + x), with x and X in USD. */
export function ammOutRatio(sideUsd: number, tradeUsd: number, feeBps: number) {
  return (1 - feeBps / 10000) * (sideUsd / (sideUsd + tradeUsd));
}

export async function getRheaDepth(m: Market, tokenIds: string[], { concurrency = 3, log = ((m: string) => void m) as (m: string) => void } = {}) {
  const usdc = m.tokens.get(USDC);
  const fetched_at = new Date().toISOString();
  const jobs = tokenIds.flatMap((token) => DEPTH_SIZES.map((size) => ({ token, size })));
  const v1 = (
    await mapLimit(jobs, concurrency, async ({ token, size }): Promise<DepthRow> => {
      const t = m.tokens.get(token);
      const base: Omit<DepthRow, "status"> = { route: "rhea-router", router: "smartrouter-v1", router_version: "RHEA Smart Router V1 · findPath", app_fee_bps: null, origin: t?.symbol ?? token, destination_token: USDC, token_id: token, size_usd: size, amount_in_usd: null, amount_out_usd: null, fee_usd: null, relative_slippage: null, quote_ms: null, fetched_at };
      if (!t || t.price == null || !usdc || usdc.price == null) return { ...base, status: "error", error: "token or USDC has no RHEA price" };
      const t0 = Date.now();
      try {
        const q = await findPath(token, USDC, usdToBaseUnits(size, t.price, t.decimals));
        const out = (Number(q.amountOutRaw) / 10 ** usdc.decimals) * usdc.price;
        return { ...base, amount_in_usd: size, amount_out_usd: out, quote_ms: Date.now() - t0, status: out > 0 ? "ok" : "no-route", error: out > 0 ? undefined : "router returned 0" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ...base, quote_ms: Date.now() - t0, status: statusFromError((e as { status?: number }).status ?? null, msg), error: msg.slice(0, 160) };
      }
    })
  ).filter((r): r is DepthRow => r != null);

  const rows: DepthRow[] = [...v1];
  for (const token of tokenIds) {
    if (v1.some((r) => r.token_id === token && r.status === "ok")) continue;
    // V1 found no route at any size: constant-product math on the deepest clean AMM pool.
    const amm = m.pools.filter((p) => p.clean && p.kind === "AMM" && p.tokens.includes(token)).sort((a, b) => b.tvl - a.tvl)[0];
    const side = amm ? amm.sideUsd[amm.tokens.indexOf(token)] : null;
    for (const size of DEPTH_SIZES) {
      const base: Omit<DepthRow, "status"> = { route: "rhea-router", router: amm ? `amm-math:${amm.id}` : "amm-math", router_version: "AMM reserve math (fallback, no router quote)", app_fee_bps: null, origin: m.tokens.get(token)?.symbol ?? token, destination_token: amm ? amm.tokens.find((x) => x !== token) ?? USDC : USDC, token_id: token, size_usd: size, amount_in_usd: null, amount_out_usd: null, fee_usd: null, relative_slippage: null, quote_ms: null, fetched_at };
      if (!amm || !side || side <= 0) rows.push({ ...base, status: "no-route", error: "no clean AMM pool with priced reserves" });
      else rows.push({ ...base, amount_in_usd: size, amount_out_usd: size * ammOutRatio(side, size, amm.fee), fee_usd: (size * amm.fee) / 10000, status: "ok" });
    }
  }
  const out = applyBaselines(rows);
  const counts = out.reduce<Record<string, number>>((a, r) => ((a[`${r.router.split(":")[0]}:${r.status}`] = (a[`${r.router.split(":")[0]}:${r.status}`] ?? 0) + 1), a), {});
  log(`rhea depth: ${jobs.length} V1 router calls, ${JSON.stringify(counts)}, aggregator ${aggregatorAuth()}`);
  return { rows: out, attempted: jobs.length, ok: out.filter((r) => r.status === "ok").length };
}
