import "server-only";
import { memo } from "../memo";
import { getAllPoolData, getPoolDetail, getPrices, getTokenMeta, getTopPools, getVolume24hList, rheaUrls, type RheaSimplePool } from "../sources/rhea";
import { getOneClickTokens, listDclPools, oneClickUrls } from "../sources/near";
import { NEAR_RPC, DCL_CONTRACT } from "../sources/endpoints";
import { units } from "../format";
import { mapLimit } from "../http";
import { isAnchor, isStable, sectorOf, type Sector } from "./registry";

export type Token = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  price: number | null; // RHEA price
  sector: Sector;
  intentsPrice: number | null; // NEAR Intents 1Click price (independent cross-check)
  priceDeviation: number | null; // |rhea - intents| / intents
};

export type PoolFlag = "price-imbalance" | "exceeds-protocol-tvl" | "unpriced-side" | "unanchored-pair" | "dust";

export type Pool = {
  id: string;
  kind: "AMM" | "STABLE" | "DCL";
  rawKind: string;
  tokens: string[];
  symbols: string[];
  sideUsd: (number | null)[];
  tvl: number; // PRIX-computed from reserves × RHEA prices (priced sides only)
  reportedTvl: number | null; // as reported by the RHEA indexer (AMM only)
  volume24h: number | null;
  fee: number; // bps (AMM) or 1e-6 units (DCL)
  flags: PoolFlag[];
  clean: boolean;
  updatedAt: number | null;
};

export type Market = {
  asOf: string;
  tokens: Map<string, Token>;
  pools: Pool[];
  protocol: { tvl: number; volume24h: number };
  rejected: { pools: number; tvl: number };
  sources: string[];
  errors: string[];
};

const AMM_VOLUME_POOLS = 40;
export const MIN_POOL_TVL = 1000; // pools below $1k are treated as dust

/**
 * Build the full RHEA market: tokens with prices (cross-checked against NEAR Intents),
 * every AMM + DCL pool with PRIX-computed TVL and integrity flags.
 */
export const getMarket = memo(async (): Promise<Market> => {
  const errors: string[] = [];
  const [prices, meta, top, dcl, vol, proto, oneClick] = await Promise.all([
    getPrices(),
    getTokenMeta().catch((e) => (errors.push(`token metadata: ${e.message}`), {} as Awaited<ReturnType<typeof getTokenMeta>>)),
    getTopPools(),
    listDclPools().catch((e) => (errors.push(`DCL pools (RPC): ${e.message}`), [])),
    getVolume24hList().catch((e) => (errors.push(`24h volume list: ${e.message}`), new Map<string, number>())),
    getAllPoolData().catch((e) => (errors.push(`protocol totals: ${e.message}`), { tvl: NaN, volume24h: NaN })),
    getOneClickTokens().catch((e) => (errors.push(`NEAR Intents prices: ${e.message}`), [])),
  ]);

  const intents = new Map<string, number>();
  for (const t of oneClick) {
    if (t.blockchain === "near" && t.assetId.startsWith("nep141:")) intents.set(t.assetId.slice(7), t.price);
  }

  const tokens = new Map<string, Token>();
  const tokenOf = (id: string): Token => {
    let t = tokens.get(id);
    if (t) return t;
    const p = prices[id];
    const m = meta[id];
    const price = p && Number.isFinite(Number(p.price)) && Number(p.price) > 0 ? Number(p.price) : null;
    const ip = intents.get(id) ?? null;
    t = {
      id,
      symbol: m?.symbol ?? p?.symbol ?? id.slice(0, 8),
      name: m?.name ?? m?.symbol ?? p?.symbol ?? id,
      decimals: m?.decimals ?? p?.decimal ?? 24,
      icon: m?.icon && m.icon.startsWith("http") ? m.icon : undefined,
      price,
      sector: sectorOf(id),
      intentsPrice: ip,
      priceDeviation: price != null && ip != null && ip > 0 ? Math.abs(price - ip) / ip : null,
    };
    tokens.set(id, t);
    return t;
  };

  const pools: Pool[] = [];
  for (const p of top as RheaSimplePool[]) {
    const kind = p.pool_kind === "SIMPLE_POOL" ? "AMM" : "STABLE";
    const toks = p.token_account_ids.map(tokenOf);
    const sideUsd = toks.map((t, i) => (t.price == null ? null : units(p.amounts[i], t.decimals) * t.price));
    pools.push({
      id: p.id,
      kind,
      rawKind: p.pool_kind,
      tokens: p.token_account_ids,
      symbols: toks.map((t) => t.symbol),
      sideUsd,
      tvl: sideUsd.reduce<number>((a, b) => a + (b ?? 0), 0),
      reportedTvl: Number(p.tvl),
      volume24h: null,
      fee: p.total_fee,
      flags: [],
      clean: true,
      updatedAt: p.update_time ? p.update_time * 1000 : null,
    });
  }
  for (const p of dcl) {
    if (p.state !== "Running") continue;
    const tx = tokenOf(p.token_x);
    const ty = tokenOf(p.token_y);
    const sideUsd = [
      tx.price == null ? null : units(p.total_x, tx.decimals) * tx.price,
      ty.price == null ? null : units(p.total_y, ty.decimals) * ty.price,
    ];
    pools.push({
      id: p.pool_id,
      kind: "DCL",
      rawKind: "DCL",
      tokens: [p.token_x, p.token_y],
      symbols: [tx.symbol, ty.symbol],
      sideUsd,
      tvl: sideUsd.reduce<number>((a, b) => a + (b ?? 0), 0),
      reportedTvl: null,
      volume24h: vol.get(p.pool_id) ?? null,
      fee: p.fee,
      flags: [],
      clean: true,
      updatedAt: null,
    });
  }

  // Integrity rules (see Methodology §2).
  const protoTvl = proto.tvl;
  let rejectedTvl = 0;
  let rejectedCount = 0;
  for (const p of pools) {
    if (p.sideUsd.some((s) => s == null)) p.flags.push("unpriced-side");
    if (p.kind === "AMM") {
      const vals = p.sideUsd.filter((s): s is number => s != null && s > 0);
      if (vals.length === 2) {
        const ratio = Math.max(...vals) / Math.min(...vals);
        // A constant-product pool holds equal value on both sides; a large gap means one price is wrong.
        if (ratio > 3) p.flags.push("price-imbalance");
      }
    }
    // A pool's USD value is only trustworthy if at least one side is a base asset priced by deep markets.
    if (!p.tokens.some(isAnchor)) p.flags.push("unanchored-pair");
    if (Number.isFinite(protoTvl) && p.tvl > 0.5 * protoTvl) p.flags.push("exceeds-protocol-tvl");
    if (p.tvl < MIN_POOL_TVL) p.flags.push("dust");
    p.clean = !p.flags.some((f) => f !== "dust");
    if (!p.clean && p.tvl >= MIN_POOL_TVL) {
      rejectedCount++;
      rejectedTvl += p.tvl;
    }
  }

  // 24h volume for the largest clean AMM/stable pools (the DCL volume list does not cover them).
  const amm = pools.filter((p) => p.kind !== "DCL" && p.clean && p.tvl >= 10000).sort((a, b) => b.tvl - a.tvl).slice(0, AMM_VOLUME_POOLS);
  const vols = await mapLimit(amm, 6, (p) => getPoolDetail(p.id));
  amm.forEach((p, i) => {
    const v = vols[i];
    if (v && Number.isFinite(v.volume24h)) p.volume24h = v.volume24h;
  });
  if (vols.some((v) => v === undefined)) errors.push(`AMM 24h volume: ${vols.filter((v) => v === undefined).length} of ${amm.length} pools not reported`);

  return {
    asOf: new Date().toISOString(),
    tokens,
    pools,
    protocol: { tvl: proto.tvl, volume24h: proto.volume24h },
    rejected: { pools: rejectedCount, tvl: rejectedTvl },
    sources: [rheaUrls.prices, rheaUrls.tokens, rheaUrls.topPools, `${NEAR_RPC} → ${DCL_CONTRACT}.list_pools`, rheaUrls.volume24hList, rheaUrls.allPoolData, `${rheaUrls.poolDetail("<id>")} (top ${AMM_VOLUME_POOLS} AMM pools)`, oneClickUrls.tokens],
    errors,
  };
});

export type TokenLiquidity = {
  token: Token;
  liquidity: number; // USD value of this token held in clean pools
  pairedTvl: number; // total TVL of clean pools containing the token
  volume24h: number | null; // sum of 24h volume of clean pools containing the token (DCL + top AMM)
  pools: Pool[];
  mainPool: Pool | null;
};

/** Aggregate clean-pool liquidity per token. */
export function tokenLiquidity(m: Market): Map<string, TokenLiquidity> {
  const out = new Map<string, TokenLiquidity>();
  for (const p of m.pools) {
    if (!p.clean || p.tvl < MIN_POOL_TVL) continue;
    p.tokens.forEach((id, i) => {
      const t = m.tokens.get(id)!;
      let e = out.get(id);
      if (!e) {
        e = { token: t, liquidity: 0, pairedTvl: 0, volume24h: null, pools: [], mainPool: null };
        out.set(id, e);
      }
      e.liquidity += p.sideUsd[i] ?? 0;
      e.pairedTvl += p.tvl;
      if (p.volume24h != null) e.volume24h = (e.volume24h ?? 0) + p.volume24h;
      e.pools.push(p);
      if (!e.mainPool || p.tvl > e.mainPool.tvl) e.mainPool = p;
    });
  }
  return out;
}

export function isNonStableRankable(id: string) {
  return !isStable(id);
}
