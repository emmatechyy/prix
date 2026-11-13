import "server-only";
import { getRecentSwaps, recentSwapsUrl, type RheaSwap } from "../sources/rhea";
import { units } from "../format";
import type { Market, Pool, Token } from "./market";

export type PricedSwap = RheaSwap & {
  poolId: string;
  usd: number | null;
  ts: number; // ms
  side: Record<string, "buy" | "sell">; // per token: bought (token_out) or sold (token_in)
};

export type SwapSample = {
  poolId: string;
  swaps: PricedSwap[];
  windowMs: number | null;
  source: string;
};

export function priceSwap(m: Market, poolId: string, s: RheaSwap): PricedSwap {
  const tin = m.tokens.get(s.token_in);
  const tout = m.tokens.get(s.token_out);
  const vin = tin?.price != null ? units(s.amount_in, tin.decimals) * tin.price : null;
  const vout = tout?.price != null ? units(s.amount_out, tout.decimals) * tout.price : null;
  // Prefer the stable / more liquid side when both are priced: use the smaller of the two to resist a mispriced leg.
  const usd = vin != null && vout != null ? Math.min(vin, vout) : (vin ?? vout);
  return {
    ...s,
    poolId,
    usd: usd != null && Number.isFinite(usd) ? usd : null,
    ts: Math.floor(Number(s.timestamp) / 1e6),
    side: { [s.token_in]: "sell", [s.token_out]: "buy" },
  };
}

export async function sampleSwaps(m: Market, pool: Pool): Promise<SwapSample> {
  const raw = await getRecentSwaps(pool.id);
  const swaps = raw.map((s) => priceSwap(m, pool.id, s)).sort((a, b) => b.ts - a.ts);
  const windowMs = swaps.length > 1 ? swaps[0].ts - swaps[swaps.length - 1].ts : null;
  return { poolId: pool.id, swaps, windowMs, source: recentSwapsUrl(pool.id) };
}

export type FlowStats = {
  buyUsd: number;
  sellUsd: number;
  netUsd: number;
  pressure: number | null; // (buy - sell) / (buy + sell)
  count: number;
  windowMs: number | null;
  roundTripShare: number | null; // share of sampled USD volume in matched opposite swaps
};

/** Net buy pressure and round-trip (wash-pattern) share for one token from a swap sample. */
export function flowStats(token: Token, sample: SwapSample): FlowStats {
  let buy = 0;
  let sell = 0;
  const rel = sample.swaps.filter((s) => s.usd != null && (s.token_in === token.id || s.token_out === token.id));
  for (const s of rel) {
    if (s.token_out === token.id) buy += s.usd!;
    else sell += s.usd!;
  }
  // Round-trip heuristic: a buy and a sell of the same token within 10 minutes whose USD sizes are within 2%.
  const used = new Set<number>();
  let rtUsd = 0;
  for (let i = 0; i < rel.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < rel.length; j++) {
      if (used.has(j)) continue;
      const a = rel[i];
      const b = rel[j];
      if (a.token_out === b.token_out) continue;
      if (Math.abs(a.ts - b.ts) > 10 * 60_000) continue;
      if (Math.abs(a.usd! - b.usd!) / Math.max(a.usd!, b.usd!) <= 0.02 && a.usd! >= 50) {
        used.add(i);
        used.add(j);
        rtUsd += a.usd! + b.usd!;
        break;
      }
    }
  }
  const total = buy + sell;
  return {
    buyUsd: buy,
    sellUsd: sell,
    netUsd: buy - sell,
    pressure: total > 0 ? (buy - sell) / total : null,
    count: rel.length,
    windowMs: sample.windowMs,
    roundTripShare: total > 0 ? rtUsd / total : null,
  };
}
