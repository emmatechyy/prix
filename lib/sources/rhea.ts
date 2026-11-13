import "server-only";
import { fetchJson, getJsonRaw } from "../http";
import { RHEA_API, RHEA_DATA, RHEA_ROUTER } from "./endpoints";

export type RheaSimplePool = {
  id: string;
  pool_kind: "SIMPLE_POOL" | "STABLE_SWAP" | "RATED_SWAP" | "DEGEN_SWAP" | string;
  token_account_ids: string[];
  token_symbols: string[];
  amounts: string[];
  total_fee: number;
  shares_total_supply: string;
  tvl: string;
  update_time: number;
};

export type RheaTokenPrice = { price: string; symbol: string; decimal: number };
export type RheaTokenMeta = { name: string; symbol: string; decimals: number; icon?: string };

export type RheaSwap = {
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  timestamp: string; // ns
  receipt_id: string;
  tx_id: string;
};

export type RheaLiquidityEvent = {
  method: string;
  amounts: string[]; // same order as pool tokens (simple) or [x, y] (DCL)
  timestamp: string;
  receipt_id: string;
};

export const rheaUrls = {
  topPools: `${RHEA_API}/list-top-pools`,
  prices: `${RHEA_API}/list-token-price`,
  tokens: `${RHEA_API}/list-token`,
  allPoolData: `${RHEA_API}/all-pool-data`,
  volume24hList: `${RHEA_API}/get-24h-volume-list`,
  volumeVariation: `${RHEA_DATA}/24h_volume_variation`,
  historicalTvl: (days: number) => `${RHEA_DATA}/historical_tvl?period=${days}`,
  poolDetail: (id: string) => `${RHEA_API}/pool/detail?pool_id=${encodeURIComponent(id)}`,
  findPathBase: `${RHEA_ROUTER}/findPath`,
  poolVolumeBase: `${RHEA_DATA}/pool/<id>/volume`,
  priceHistory: (ids: string[]) => `${RHEA_API}/list-history-token-price-by-ids?ids=${ids.map(encodeURIComponent).join("|")}`,
};

export async function getTopPools() {
  return fetchJson<RheaSimplePool[]>(rheaUrls.topPools, { revalidate: 600, timeoutMs: 25000 });
}
export async function getPrices() {
  return fetchJson<Record<string, RheaTokenPrice>>(rheaUrls.prices, { revalidate: 300, timeoutMs: 20000 });
}
// list-token is ~2.5 MB, above the Next.js data-cache item limit, so it is memoised in-process (1 h TTL) in trimmed form.
let metaMemo: { at: number; p: Promise<Record<string, RheaTokenMeta>> } | null = null;
export async function getTokenMeta() {
  if (metaMemo && Date.now() - metaMemo.at < 3_600_000) return metaMemo.p;
  const p = getJsonRaw<Record<string, RheaTokenMeta>>(rheaUrls.tokens).then((all) => {
    const out: Record<string, RheaTokenMeta> = {};
    for (const [k, v] of Object.entries(all)) out[k] = { name: v.name, symbol: v.symbol, decimals: v.decimals, icon: v.icon?.startsWith("http") ? v.icon : undefined };
    return out;
  });
  metaMemo = { at: Date.now(), p };
  p.catch(() => (metaMemo = null));
  return p;
}
export async function getAllPoolData() {
  const r = await fetchJson<{ code: number; data: { tvl: string; volume_24h: string } }>(rheaUrls.allPoolData, { revalidate: 600 });
  return { tvl: Number(r.data.tvl.slice(0, 30)), volume24h: Number(r.data.volume_24h.slice(0, 30)) };
}
export async function getVolume24hList() {
  const r = await fetchJson<{ pool_id: string; volume: string }[]>(rheaUrls.volume24hList, { revalidate: 600, timeoutMs: 25000 });
  const m = new Map<string, number>();
  for (const x of r) m.set(x.pool_id, Number(x.volume));
  return m;
}
export async function getVolumeVariation() {
  const r = await fetchJson<{ lastVolumeUSD: string; previousVolumeUSD: string; variation: string }>(rheaUrls.volumeVariation, { revalidate: 600 });
  return { last: Number(r.lastVolumeUSD), previous: Number(r.previousVolumeUSD), variation: Number(r.variation) };
}
export type TvlPoint = { date: string; amm: number; lending: number };
export async function getHistoricalTvl(days: number) {
  const r = await fetchJson<{ historicalTVL: { date: string; totalUsdTvl: number; lending_tvl: number }[] }>(rheaUrls.historicalTvl(days), { revalidate: 3600 });
  return r.historicalTVL
    .map((p) => ({ date: normDate(p.date), amm: p.totalUsdTvl, lending: p.lending_tvl }))
    .sort((a, b) => a.date.localeCompare(b.date)) as TvlPoint[];
}
export async function getPoolDetail(id: string) {
  const r = await fetchJson<{ code: number; data: { volume_24h: string; tvl: string; apy: string } }>(rheaUrls.poolDetail(id), { revalidate: 600 });
  return { volume24h: Number(r.data.volume_24h), tvl: Number(r.data.tvl) };
}
export async function getPriceHistory(ids: string[]) {
  if (ids.length === 0) return new Map<string, { price: number; prev: number }>();
  const r = await fetchJson<{ contract_address: string; price: string; history_price: number }[]>(rheaUrls.priceHistory(ids), { revalidate: 600 });
  return new Map(r.map((x) => [x.contract_address, { price: Number(x.price), prev: Number(x.history_price) }]));
}

export type DailyPoint = { date: string; value: number };
function normDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
/** Daily USD volume and TVL history for one pool (simple pools via data-service, DCL via indexer). */
export async function getPoolHistory(id: string): Promise<{ volume: DailyPoint[]; tvl: DailyPoint[]; sources: string[] }> {
  if (id.includes("|")) {
    const vu = `${RHEA_API}/get-dcl-pools-volume?pool_id=${encodeURIComponent(id)}`;
    const tu = `${RHEA_API}/get-dcl-pools-tvl-list?pool_id=${encodeURIComponent(id)}`;
    const [v, t] = await Promise.all([
      fetchJson<{ dateString: string; volume: string }[]>(vu, { revalidate: 3600 }),
      fetchJson<{ dateString: string; tvl: string }[]>(tu, { revalidate: 3600 }),
    ]);
    const sortD = (a: DailyPoint, b: DailyPoint) => a.date.localeCompare(b.date);
    return {
      volume: v.map((x) => ({ date: normDate(x.dateString), value: Number(x.volume) })).sort(sortD),
      tvl: t.map((x) => ({ date: normDate(x.dateString), value: Number(x.tvl) })).sort(sortD),
      sources: [vu, tu],
    };
  }
  const vu = `${RHEA_DATA}/pool/${encodeURIComponent(id)}/volume`;
  const tu = `${RHEA_DATA}/pool/${encodeURIComponent(id)}/tvl`;
  const [v, t] = await Promise.all([
    fetchJson<{ date_string: string; volume_dollar: number }[]>(vu, { revalidate: 3600 }),
    fetchJson<{ date_string: string; tvl: number }[]>(tu, { revalidate: 3600 }),
  ]);
  const sortD = (a: DailyPoint, b: DailyPoint) => a.date.localeCompare(b.date);
  return {
    volume: v.map((x) => ({ date: normDate(x.date_string), value: x.volume_dollar })).sort(sortD),
    tvl: t.map((x) => ({ date: normDate(x.date_string), value: x.tvl })).sort(sortD),
    sources: [vu, tu],
  };
}

export function recentSwapsUrl(poolId: string) {
  return poolId.includes("|")
    ? `${RHEA_API}/get-recent-transaction-dcl-swap?pool_id=${encodeURIComponent(poolId)}`
    : `${RHEA_API}/get-recent-transaction-swap?pool_id=${encodeURIComponent(poolId)}`;
}
export function recentLiquidityUrl(poolId: string) {
  return poolId.includes("|")
    ? `${RHEA_API}/get-recent-transaction-dcl-liquidity?pool_id=${encodeURIComponent(poolId)}`
    : `${RHEA_API}/get-recent-transaction-liquidity?pool_id=${encodeURIComponent(poolId)}`;
}

/** Last 50 swaps in a pool (RHEA indexer). */
export async function getRecentSwaps(poolId: string): Promise<RheaSwap[]> {
  type Raw = { token_in: string; token_out: string; amount_in?: string; amount_out?: string; swap_in?: string; swap_out?: string; timestamp: string; receipt_id: string; tx_id: string };
  const r = await fetchJson<Raw[]>(recentSwapsUrl(poolId), { revalidate: 300 });
  return r.map((x) => ({
    token_in: x.token_in,
    token_out: x.token_out,
    amount_in: x.amount_in ?? x.swap_in ?? "0",
    amount_out: x.amount_out ?? x.swap_out ?? "0",
    timestamp: x.timestamp,
    receipt_id: x.receipt_id,
    tx_id: x.tx_id,
  }));
}

/** Recent liquidity add/remove events in a pool (RHEA indexer). */
export async function getRecentLiquidity(poolId: string): Promise<RheaLiquidityEvent[]> {
  if (poolId.includes("|")) {
    const r = await fetchJson<{ method_name: string; amount_x: string; amount_y: string; timestamp: string; receipt_id: string }[]>(recentLiquidityUrl(poolId), { revalidate: 600 });
    return r.map((x) => ({ method: x.method_name, amounts: [x.amount_x, x.amount_y], timestamp: x.timestamp, receipt_id: x.receipt_id }));
  }
  const r = await fetchJson<{ method_name: string; amounts: string; timestamp: string; receipt_id: string }[]>(recentLiquidityUrl(poolId), { revalidate: 600 });
  return r.map((x) => ({
    method: x.method_name,
    amounts: (x.amounts.match(/\d+/g) ?? []) as string[],
    timestamp: x.timestamp,
    receipt_id: x.receipt_id,
  }));
}

/** Route quote from RHEA Smart Router (read-only path finding; nothing is executed). */
export async function findPath(tokenIn: string, tokenOut: string, amountInRaw: string) {
  const url = `${RHEA_ROUTER}/findPath?amountIn=${amountInRaw}&tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&pathDeep=3&slippage=0.005`;
  const r = await fetchJson<{ result_code: number; result_message: string; result_data?: { amount_out: string; routes: { pools: { pool_id: string }[] }[] } }>(url, { revalidate: 900 });
  if (r.result_code !== 0 || !r.result_data) throw new Error(r.result_message || "No route");
  return { amountOutRaw: r.result_data.amount_out, hops: r.result_data.routes.map((x) => x.pools.map((p) => p.pool_id)), url };
}
