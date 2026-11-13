import "server-only";
import { memo } from "../memo";
import { mapLimit } from "../http";
import { getRecentLiquidity, recentLiquidityUrl } from "../sources/rhea";
import { getTxn, receiptToTx } from "../sources/near";
import { units } from "../format";
import { getMarket, MIN_POOL_TVL, type Market, type Pool } from "./market";
import { sampleSwaps, type PricedSwap } from "./flows";

export const WHALE_USD = 10_000;
const SWAP_POOLS = 16;
const LP_POOLS = 14;
const RESOLVE = 18;

export type Resolved = { txHash: string | null; signer: string | null };

export type WhaleSwap = PricedSwap & Resolved & { symbols: [string, string] };
export type WhaleLp = {
  poolId: string;
  method: "add" | "remove";
  usd: number;
  ts: number;
  receipt_id: string;
  symbols: string[];
  amounts: { symbol: string; amount: number }[];
} & Resolved;

export type WhaleAccount = { account: string; swapUsd: number; lpAddUsd: number; lpRemoveUsd: number; events: number; lastTs: number };

export type WhaleResult = {
  asOf: string;
  swaps: WhaleSwap[];
  lps: WhaleLp[];
  accounts: WhaleAccount[];
  sampled: { swapPools: number; swaps: number; lpPools: number; lpEvents: number; oldestSwapTs: number | null };
  sources: string[];
  unresolved: number;
};

async function resolve(receipt: string): Promise<Resolved> {
  const txHash = await receiptToTx(receipt).catch(() => null);
  if (!txHash) return { txHash: null, signer: null };
  const tx = await getTxn(txHash).catch(() => null);
  return { txHash, signer: tx?.signer_account_id ?? null };
}

function lpUsd(m: Market, p: Pool, amounts: string[]) {
  let total = 0;
  const parts: { symbol: string; amount: number }[] = [];
  p.tokens.forEach((id, i) => {
    const t = m.tokens.get(id)!;
    const a = units(amounts[i] ?? "0", t.decimals);
    parts.push({ symbol: t.symbol, amount: a });
    if (t.price != null && Number.isFinite(a)) total += a * t.price;
  });
  return { total, parts };
}

export const getWhales = memo(async (): Promise<WhaleResult> => {
  const m = await getMarket();
  const clean = m.pools.filter((p) => p.clean && p.tvl >= MIN_POOL_TVL);
  const swapPools = clean.filter((p) => (p.volume24h ?? 0) > 0).sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, SWAP_POOLS);
  const lpPools = [...clean].sort((a, b) => b.tvl - a.tvl).slice(0, LP_POOLS);

  const [samples, lpLists] = await Promise.all([
    mapLimit(swapPools, 6, (p) => sampleSwaps(m, p)),
    mapLimit(lpPools, 6, (p) => getRecentLiquidity(p.id)),
  ]);

  const all: PricedSwap[] = samples.flatMap((s) => s?.swaps ?? []);
  const big = all.filter((s) => (s.usd ?? 0) >= WHALE_USD).sort((a, b) => b.usd! - a.usd!);

  const lps: WhaleLp[] = [];
  let lpEvents = 0;
  lpPools.forEach((p, i) => {
    for (const e of lpLists[i] ?? []) {
      lpEvents++;
      const { total, parts } = lpUsd(m, p, e.amounts);
      if (total < WHALE_USD) continue;
      const method = /remove/i.test(e.method) ? "remove" : "add";
      lps.push({ poolId: p.id, method, usd: total, ts: Math.floor(Number(e.timestamp) / 1e6), receipt_id: e.receipt_id, symbols: p.symbols, amounts: parts, txHash: null, signer: null });
    }
  });
  lps.sort((a, b) => b.ts - a.ts);

  // Resolve receipts → tx hash → signer for the largest events (NearBlocks; immutable, cached for a week).
  const toResolve = [...big.slice(0, RESOLVE).map((s) => s.receipt_id), ...lps.slice(0, 20).map((l) => l.receipt_id)];
  const resolved = await mapLimit(toResolve, 3, resolve);
  const rmap = new Map<string, Resolved>();
  toResolve.forEach((r, i) => resolved[i] && rmap.set(r, resolved[i]!));

  const swaps: WhaleSwap[] = big.map((s) => {
    const r = rmap.get(s.receipt_id) ?? { txHash: null, signer: null };
    return { ...s, ...r, symbols: [m.tokens.get(s.token_in)?.symbol ?? s.token_in, m.tokens.get(s.token_out)?.symbol ?? s.token_out] };
  });
  for (const l of lps) Object.assign(l, rmap.get(l.receipt_id) ?? {});

  const acc = new Map<string, WhaleAccount>();
  const get = (a: string) => {
    let x = acc.get(a);
    if (!x) acc.set(a, (x = { account: a, swapUsd: 0, lpAddUsd: 0, lpRemoveUsd: 0, events: 0, lastTs: 0 }));
    return x;
  };
  for (const s of swaps) {
    if (!s.signer) continue;
    const a = get(s.signer);
    a.events++;
    a.lastTs = Math.max(a.lastTs, s.ts);
    a.swapUsd += s.usd!;
  }
  for (const l of lps) {
    if (!l.signer) continue;
    const a = get(l.signer);
    a.events++;
    a.lastTs = Math.max(a.lastTs, l.ts);
    if (l.method === "add") a.lpAddUsd += l.usd;
    else a.lpRemoveUsd += l.usd;
  }

  return {
    asOf: new Date().toISOString(),
    swaps,
    lps,
    accounts: [...acc.values()].sort((a, b) => b.swapUsd + b.lpAddUsd + b.lpRemoveUsd - (a.swapUsd + a.lpAddUsd + a.lpRemoveUsd)),
    sampled: {
      swapPools: swapPools.length,
      swaps: all.length,
      lpPools: lpPools.length,
      lpEvents,
      oldestSwapTs: all.length ? Math.min(...all.map((s) => s.ts)) : null,
    },
    sources: [...swapPools.slice(0, 1).map((p) => samples[0]?.source ?? p.id), recentLiquidityUrl(lpPools[0]?.id ?? "<pool>"), "https://api.nearblocks.io/v1/search/receipts", "https://api.nearblocks.io/v1/txns/<hash>"],
    unresolved: toResolve.length - [...rmap.values()].filter((r) => r.txHash).length,
  };
});
