import "server-only";
import { fetchJson } from "../http";
import { DCL_CONTRACT, FASTNEAR_API, NEAR_RPC, NEARBLOCKS, ONECLICK } from "./endpoints";

const nbHeaders = (): Record<string, string> =>
  process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {};

/** NEAR JSON-RPC view call (read-only). */
export async function viewCall<T>(contract: string, method: string, args: Record<string, unknown>, revalidate = 300): Promise<T> {
  const r = await fetchJson<{ result?: { result: number[] }; error?: { message?: string; cause?: { name?: string } } }>(NEAR_RPC, {
    method: "POST",
    revalidate,
    body: {
      jsonrpc: "2.0",
      id: `${contract}.${method}.${JSON.stringify(args)}`,
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
    },
  });
  if (!r.result) throw new Error(r.error?.cause?.name ?? r.error?.message ?? "RPC error");
  return JSON.parse(Buffer.from(r.result.result).toString("utf8")) as T;
}

export type DclPool = {
  pool_id: string;
  token_x: string;
  token_y: string;
  fee: number;
  total_x: string;
  total_y: string;
  state: string;
};

/** All RHEA DCL (concentrated liquidity) pools, read directly from the dclv2.ref-labs.near contract. */
export async function listDclPools(): Promise<DclPool[]> {
  const out: DclPool[] = [];
  const limit = 300;
  for (let from = 0; from < 30000; from += limit) {
    const page = await viewCall<DclPool[]>(DCL_CONTRACT, "list_pools", { from_index: from, limit }, 600);
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

export async function ftTotalSupply(token: string): Promise<string> {
  return viewCall<string>(token, "ft_total_supply", {}, 3600);
}

/** NearBlocks API v3 (v1/v2 are switched off on 2026-11-22). */
export const nearblocksUrls = {
  txnStats: `${NEARBLOCKS}/v3/txn-stats`,
  addressStats: `${NEARBLOCKS}/v3/address-stats`,
  priceStats: `${NEARBLOCKS}/v3/price-stats`,
  stats: `${NEARBLOCKS}/v3/stats`,
  receipt: (r: string) => `${NEARBLOCKS}/v3/search/receipts?keyword=${encodeURIComponent(r)}`,
  txn: (h: string) => `${NEARBLOCKS}/v3/txns/${encodeURIComponent(h)}`,
  account: (a: string) => `${NEARBLOCKS}/v3/accounts/${encodeURIComponent(a)}`,
  intents: (next?: string) => `${NEARBLOCKS}/v3/intents/txns?limit=100${next ? `&next=${encodeURIComponent(next)}` : ""}`,
};

export type ChartDay = { date: string; txns: number; active: number; newContracts: number; fees: number; price: number | null };

/** Daily network history: transactions & fees (txn-stats), active accounts (address-stats), NEAR price (price-stats). */
export async function getNetworkCharts(): Promise<ChartDay[]> {
  const o = { revalidate: 21600, timeoutMs: 30000, headers: nbHeaders() };
  const [tx, ad, pr] = await Promise.all([
    fetchJson<{ data: { date: string; txns: number; txn_fee: string }[] }>(nearblocksUrls.txnStats, o),
    fetchJson<{ data: { date: string; active_accounts: number; new_contracts: number | null }[] }>(nearblocksUrls.addressStats, o),
    fetchJson<{ data: { date: string; near_price: string | null }[] }>(nearblocksUrls.priceStats, o),
  ]);
  const a = new Map(ad.data.map((d) => [d.date, d]));
  const p = new Map(pr.data.map((d) => [d.date, d.near_price == null ? null : Number(d.near_price)]));
  return tx.data
    .filter((d) => a.has(d.date))
    .map((d) => ({
      date: d.date,
      txns: Number(d.txns),
      active: Number(a.get(d.date)!.active_accounts),
      newContracts: Number(a.get(d.date)!.new_contracts ?? 0),
      fees: Number(d.txn_fee),
      price: p.get(d.date) ?? null,
    }))
    .sort((x, y) => x.date.localeCompare(y.date));
}
export async function getNetworkStats() {
  const r = await fetchJson<{ data: { near_price: string; market_cap: string; volume_24h: string; change_24h: string; circulating_supply: string; total_supply: string; nodes_online: number; avg_block_time: string; total_txns: string; tps: number } }>(nearblocksUrls.stats, { revalidate: 600, headers: nbHeaders() });
  return r.data;
}
/** Receipt → originating transaction hash. Immutable, cached for a week. */
export async function receiptToTx(receipt: string) {
  const r = await fetchJson<{ data: { transaction_hash: string }[] | null }>(nearblocksUrls.receipt(receipt), { revalidate: 604800, headers: nbHeaders() });
  return r.data?.[0]?.transaction_hash ?? null;
}
export async function getTxn(hash: string) {
  const r = await fetchJson<{ data: { signer_account_id: string; receiver_account_id: string; block_timestamp: string } | null }>(nearblocksUrls.txn(hash), { revalidate: 604800, headers: nbHeaders() });
  return r.data ?? null;
}
export async function getAccount(id: string) {
  const r = await fetchJson<{ data: { account_id: string; created?: { transaction_hash?: string | null; block_timestamp?: string | null } } | null }>(nearblocksUrls.account(id), { revalidate: 86400, headers: nbHeaders() });
  return r.data ?? null;
}

export type IntentsEvent = { cause: string; token_id: string; delta_amount: string; price: string | null; block_timestamp: string; transaction_hash: string; affected_account_id: string; base_meta?: { decimals?: number; symbol?: string } };
/** Most recent NEAR Intents token events (intents.near MINT = deposit, BURN = withdrawal). */
export async function getIntentsEvents(pages: number) {
  const out: IntentsEvent[] = [];
  let next: string | undefined;
  for (let i = 0; i < pages; i++) {
    let r: { data: IntentsEvent[]; meta?: { next_page?: string } };
    try {
      r = await fetchJson(nearblocksUrls.intents(next), { revalidate: 600, headers: nbHeaders() });
    } catch (e) {
      if (out.length === 0) throw e;
      break; // keep the pages already read; the window shown reflects what was read
    }
    out.push(...r.data);
    next = r.meta?.next_page;
    if (!next) break;
  }
  return out;
}

export const fastnearUrls = {
  ft: (a: string) => `${FASTNEAR_API}/v1/account/${encodeURIComponent(a)}/ft`,
  top: (t: string) => `${FASTNEAR_API}/v1/ft/${encodeURIComponent(t)}/top`,
};
/** Top holders of a NEP-141 token (FastNEAR, near-real-time). */
export async function getTopHolders(token: string) {
  const r = await fetchJson<{ accounts: { account_id: string; balance: string }[] }>(fastnearUrls.top(token), { revalidate: 3600, timeoutMs: 20000 });
  return r.accounts.map((a) => ({ account: a.account_id, amount: a.balance }));
}
export async function getAccountFts(account: string) {
  const r = await fetchJson<{ tokens: { contract_id: string; balance: string }[] }>(fastnearUrls.ft(account), { revalidate: 900, timeoutMs: 20000 });
  return r.tokens;
}

export const oneClickUrls = { tokens: `${ONECLICK}/v0/tokens` };
export type OneClickToken = { assetId: string; decimals: number; blockchain: string; symbol: string; price: number; priceUpdatedAt: string; contractAddress?: string };
export async function getOneClickTokens() {
  return fetchJson<OneClickToken[]>(oneClickUrls.tokens, { revalidate: 600 });
}
