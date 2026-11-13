import "server-only";
import { memo } from "../memo";
import { mapLimit } from "../http";
import { findPath, getPoolHistory, getPriceHistory, type DailyPoint } from "../sources/rhea";
import { fastnearUrls, ftTotalSupply, getTopHolders } from "../sources/near";
import { USDC } from "../sources/endpoints";
import { units } from "../format";
import { getMarket, tokenLiquidity, type Market, type TokenLiquidity } from "./market";
import { isCustody, isStable } from "./registry";
import { flowStats, sampleSwaps, type FlowStats } from "./flows";
import { applyIndexRules } from "./index-rules";
import { loadThresholds } from "../thresholds/load";
import { latestSnapshot } from "../snapshot/io";

export const WEIGHTS = { depth: 0.3, activity: 0.25, distribution: 0.2, flow: 0.25 } as const;
export type Pillar = keyof typeof WEIGHTS;
export const UNIVERSE_MIN_LIQUIDITY = 50_000;
export const UNIVERSE_MAX = 24;
export const DEPTH_TRADE_USD = 10_000;

export type PillarResult = { score: number | null; inputs: { label: string; value: string | number | null; source?: string }[]; note?: string };

export type IndexRow = {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  icon?: string;
  price: number | null;
  change24h: number | null;
  liquidity: number;
  volume24h: number | null;
  mainPoolId: string | null;
  priceDeviation: number | null;
  depth: { impact: number | null; route: string[][] | null; source: string | null; method: "router" | "amm-reserves" | null };
  holders: { count: number | null; countCapped: boolean; top10Share: number | null; custodyShare: number | null; top: { account: string; share: number; custody: boolean }[]; source: string | null };
  flow: (FlowStats & { source: string }) | null;
  trend: { tvl7d: number | null; volume7vs30: number | null; tvlSeries: DailyPoint[]; volumeSeries: DailyPoint[]; sources: string[] };
  pillars: Record<Pillar, PillarResult>;
  score: number | null;
  confidence: number;
  flags: string[];
  rank: number | null;
  /** thresholds index_rules: high/low confidence, with reasons (see lib/model/index-rules.ts). */
  rules: { confidence: "high" | "low"; reasons: string[]; bestImpact10k: number | null; bestRoute: string | null };
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 10) / 10;

export function depthScore(impact: number) {
  const lo = Math.log10(0.003);
  const hi = Math.log10(0.1);
  return round(100 * clamp((hi - Math.log10(Math.max(impact, 0.0005))) / (hi - lo)));
}
export function activityScore(vol: number) {
  if (vol <= 0) return 0;
  return round(clamp((Math.log10(vol) - 3) / 5) * 100);
}
export function distributionScore(top10: number) {
  return round(100 * clamp((0.9 - top10) / 0.7));
}
export function flowScore(pressure: number | null, tvl7d: number | null, volTrend: number | null) {
  if (pressure == null && tvl7d == null && volTrend == null) return null;
  return round(clamp(50 + 25 * (pressure ?? 0) + 15 * clamp((tvl7d ?? 0) / 0.25, -1, 1) + 10 * clamp(volTrend ?? 0, -1, 1), 0, 100));
}

function changeOver(series: DailyPoint[], days: number): number | null {
  if (series.length < days + 1) return null;
  const last = series[series.length - 1].value;
  const prev = series[series.length - 1 - days].value;
  if (!(prev > 0)) return null;
  return last / prev - 1;
}
function volumeTrend(series: DailyPoint[]): number | null {
  // last 7 complete days vs the 30 days before, using completed days only (exclude today)
  const s = series.slice(0, -1);
  if (s.length < 37) return null;
  const a = s.slice(-7).reduce((x, p) => x + p.value, 0) / 7;
  const b = s.slice(-37, -7).reduce((x, p) => x + p.value, 0) / 30;
  if (!(b > 0)) return null;
  return a / b - 1;
}

async function buildRow(m: Market, tl: TokenLiquidity, change24h: number | null): Promise<IndexRow> {
  const t = tl.token;
  const flags: string[] = [];
  const main = tl.mainPool;

  // 1. Depth: quote selling $10k of the token for USDC through RHEA Smart Router.
  let impact: number | null = null;
  let route: string[][] | null = null;
  let depthSource: string | null = null;
  let depthMethod: "router" | "amm-reserves" | null = null;
  if (t.price && t.id !== USDC) {
    try {
      const amount = BigInt(Math.floor((DEPTH_TRADE_USD / t.price) * 1e6)) * 10n ** BigInt(Math.max(0, t.decimals - 6));
      const q = await findPath(t.id, USDC, amount.toString());
      const out = units(q.amountOutRaw, 6);
      depthSource = q.url;
      route = q.hops;
      if (out > 0) {
        impact = clamp(1 - out / DEPTH_TRADE_USD, 0, 1);
        depthMethod = "router";
      }
    } catch {
      /* fall through to the AMM-reserve computation */
    }
    if (impact == null) {
      // RHEA Smart Router returned no route. Fall back to exact constant-product math on the
      // deepest clean AMM pool's on-chain reserves: out/spot = (1 - fee) * X / (X + x).
      const amm = tl.pools.filter((p) => p.kind === "AMM").sort((a, b) => b.tvl - a.tvl)[0];
      const i = amm ? amm.tokens.indexOf(t.id) : -1;
      const side = amm && i >= 0 ? amm.sideUsd[i] : null;
      if (amm && side && side > 0) {
        const x = DEPTH_TRADE_USD; // in USD terms; X is the token-side reserve value in USD
        impact = clamp(1 - (1 - amm.fee / 10000) * (side / (side + x)), 0, 1);
        depthMethod = "amm-reserves";
        depthSource = `AMM pool ${amm.id} reserves (list-top-pools)`;
        route = [[amm.id]];
        flags.push("not routable by RHEA Smart Router; depth from AMM reserves");
      } else {
        flags.push("not routable by RHEA Smart Router; depth not reported");
      }
    }
  }

  // 2. Distribution: top holders (NearBlocks) vs total supply (on-chain ft_total_supply).
  let count: number | null = null;
  let countCapped = false;
  let top10Share: number | null = null;
  let custodyShare: number | null = null;
  let top: IndexRow["holders"]["top"] = [];
  let holderSource: string | null = null;
  try {
    const [holders, supplyRaw] = await Promise.all([getTopHolders(t.id), ftTotalSupply(t.id)]);
    // FastNEAR returns up to 100 top holders: an exact count below 100, otherwise reported as "100+".
    count = holders.length < 100 ? holders.filter((x) => x.amount !== "0").length : null;
    countCapped = holders.length >= 100;
    const supply = units(supplyRaw, t.decimals);
    holderSource = fastnearUrls.top(t.id);
    if (supply > 0 && holders.length > 0) {
      top = holders.slice(0, 25).map((h) => ({ account: h.account, share: units(h.amount, t.decimals) / supply, custody: isCustody(h.account) }));
      custodyShare = top.filter((h) => h.custody).reduce((a, h) => a + h.share, 0);
      const float = 1 - custodyShare;
      const top10 = top.filter((h) => !h.custody).slice(0, 10).reduce((a, h) => a + h.share, 0);
      // Share of the float (supply not held by custody contracts) owned by the 10 largest non-custody holders.
      top10Share = float >= 0.01 ? top10 / float : null;
      if (top10Share != null && top10Share > 1.0001) {
        top10Share = null;
        flags.push("holder balances inconsistent with on-chain supply");
      } else if (float < 0.01) flags.push("float < 1% of supply (nearly all in custody contracts)");
    } else {
      holderSource = null;
      flags.push("top holders not reported by FastNEAR");
    }
  } catch {
    flags.push("holder data unavailable");
  }

  // 3. Flow: last 50 swaps in the token's deepest clean pool + daily pool history.
  let flow: IndexRow["flow"] = null;
  let trend: IndexRow["trend"] = { tvl7d: null, volume7vs30: null, tvlSeries: [], volumeSeries: [], sources: [] };
  if (main) {
    const [sample, hist] = await Promise.all([sampleSwaps(m, main).catch(() => null), getPoolHistory(main.id).catch(() => null)]);
    if (sample) flow = { ...flowStats(t, sample), source: sample.source };
    if (hist) {
      trend = { tvl7d: changeOver(hist.tvl, 7), volume7vs30: volumeTrend(hist.volume), tvlSeries: hist.tvl.slice(-90), volumeSeries: hist.volume.slice(-90), sources: hist.sources };
    }
  }

  // Pillars
  const vol = tl.volume24h;
  const turnover = vol != null && tl.pairedTvl > 0 ? vol / tl.pairedTvl : null;
  let act: number | null = vol == null ? null : activityScore(vol);
  if (act != null && turnover != null && turnover > 5) {
    flags.push(`abnormal turnover ${turnover.toFixed(1)}×/day`);
    act = Math.min(act, 50);
  }
  if (act != null && flow?.roundTripShare != null && flow.roundTripShare > 0.3 && flow.count >= 10) {
    flags.push(`round-trip pattern ${(flow.roundTripShare * 100).toFixed(0)}% of sampled volume`);
    act = Math.min(act, 50);
  }
  if (t.priceDeviation != null && t.priceDeviation > 0.05) flags.push(`RHEA vs NEAR Intents price gap ${(t.priceDeviation * 100).toFixed(1)}%`);
  if (trend.volume7vs30 != null && trend.volume7vs30 > 1) flags.push(`volume spike: 7d avg ${(trend.volume7vs30 * 100 + 100).toFixed(0)}% of prior 30d`);
  if (top10Share != null && top10Share > 0.8) flags.push("top-10 holders own >80% of float");

  const pillars: Record<Pillar, PillarResult> = {
    depth: {
      score: impact == null ? null : depthScore(impact),
      inputs: [
        { label: `Price impact + fees, sell $${DEPTH_TRADE_USD.toLocaleString()} → USDC`, value: impact, source: depthSource ?? undefined },
        { label: "Method", value: depthMethod === "router" ? "RHEA Smart Router quote" : depthMethod === "amm-reserves" ? "Constant-product math on AMM reserves" : null },
        { label: "Route hops", value: route ? route.map((r) => r.length).join(" / ") : null },
      ],
      note: t.id === USDC ? "Quote currency; not scored." : undefined,
    },
    activity: {
      score: act,
      inputs: [
        { label: "24h volume, clean pools (USD)", value: vol },
        { label: "Turnover (volume / paired TVL)", value: turnover },
        { label: "Round-trip share of last-50 swaps", value: flow?.roundTripShare ?? null },
      ],
    },
    distribution: {
      score: top10Share == null ? null : distributionScore(top10Share),
      inputs: [
        { label: "Top-10 non-custody holders, share of float", value: top10Share, source: holderSource ?? undefined },
        { label: "Custody contracts in top 25, share of supply", value: custodyShare },
        { label: "Holder accounts (FastNEAR)", value: countCapped ? "100+" : count },
      ],
    },
    flow: {
      score: flowScore(flow?.pressure ?? null, trend.tvl7d, trend.volume7vs30),
      inputs: [
        { label: "Net buy pressure, last 50 swaps in main pool", value: flow?.pressure ?? null, source: flow?.source },
        { label: "Main pool TVL change, 7d", value: trend.tvl7d, source: trend.sources[1] },
        { label: "Volume, last 7d vs prior 30d", value: trend.volume7vs30, source: trend.sources[0] },
      ],
    },
  };

  let wsum = 0;
  let ssum = 0;
  (Object.keys(WEIGHTS) as Pillar[]).forEach((k) => {
    const s = pillars[k].score;
    if (s != null) {
      wsum += WEIGHTS[k];
      ssum += WEIGHTS[k] * s;
    }
  });
  const confidence = Math.round(wsum * 100) / 100;
  const score = confidence >= 0.5 ? round(ssum / wsum) : null;
  if (score == null) flags.push("insufficient evidence (<50% of weight)");

  return {
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    sector: t.sector,
    icon: t.icon,
    price: t.price,
    change24h,
    liquidity: tl.liquidity,
    volume24h: vol,
    mainPoolId: main?.id ?? null,
    priceDeviation: t.priceDeviation,
    depth: { impact, route, source: depthSource, method: depthMethod },
    holders: { count, countCapped, top10Share, custodyShare, top, source: holderSource },
    flow,
    trend,
    pillars,
    score,
    confidence,
    flags,
    rank: null,
    rules: { confidence: "low", reasons: [], bestImpact10k: impact, bestRoute: null },
  };
}

export type IndexResult = { asOf: string; rows: IndexRow[]; universe: number; market: Market; rules: { min_liquidity_usd: number; max_price_impact_10k: number } };

export const getIndex = memo(async (): Promise<IndexResult> => {
  const m = await getMarket();
  const liq = [...tokenLiquidity(m).values()]
    .filter((x) => !isStable(x.token.id) && x.token.price != null && x.liquidity >= UNIVERSE_MIN_LIQUIDITY)
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, UNIVERSE_MAX);
  const ph = await getPriceHistory(liq.map((x) => x.token.id)).catch(() => new Map<string, { price: number; prev: number }>());
  const rows = (
    await mapLimit(liq, 4, (x) => {
      const h = ph.get(x.token.id);
      const ch = h && h.prev > 0 ? h.price / h.prev - 1 : null;
      return buildRow(m, x, ch);
    })
  ).filter((r): r is IndexRow => !!r);
  // Universe rules from thresholds/v1.yaml. Intents depth comes from the latest published snapshot
  // (1Click dry quotes are run by the daily job, not on page load).
  const extra = new Map<string, { impact: number; route: string }>();
  let rules = { min_liquidity_usd: UNIVERSE_MIN_LIQUIDITY, max_price_impact_10k: 0.1 };
  try {
    rules = loadThresholds().t.index_rules;
    for (const d of latestSnapshot()?.depth ?? []) {
      if (d.route !== "intents" || d.size_usd !== DEPTH_TRADE_USD || d.status !== "ok" || d.relative_slippage == null) continue;
      const cur = extra.get(d.token_id);
      if (!cur || d.relative_slippage < cur.impact) extra.set(d.token_id, { impact: d.relative_slippage, route: `NEAR Intents (1Click dry quote from ${d.origin}, snapshot ${d.fetched_at.slice(0, 10)})` });
    }
  } catch {
    /* no thresholds/snapshot available: rules fall back to the published defaults above */
  }
  const applied = applyIndexRules(
    rows.map((r) => ({ id: r.id, score: r.score, liquidity: r.liquidity, impact10k: r.depth.impact, impactRoute: r.depth.method === "router" ? "RHEA Smart Router" : r.depth.method === "amm-reserves" ? "RHEA AMM reserve math" : null, derivedDepth: r.depth.method === "amm-reserves" })),
    rules,
    extra,
  );
  applied.forEach((a, i) => {
    rows[i].rank = a.rank;
    rows[i].rules = { confidence: a.confidence, reasons: a.reasons, bestImpact10k: a.bestImpact10k, bestRoute: a.bestRoute };
  });
  const ranked = rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!);
  const unranked = rows.filter((r) => r.rank == null);
  return { asOf: new Date().toISOString(), rows: [...ranked, ...unranked], universe: liq.length, market: m, rules: { min_liquidity_usd: rules.min_liquidity_usd, max_price_impact_10k: rules.max_price_impact_10k } };
});

/** Full evidence row for one token: from the index if it is in the universe, otherwise computed on demand. */
export const getTokenDetail = memo(async (id: string) => {
  const idx = await getIndex();
  const m = idx.market;
  const token = m.tokens.get(id);
  if (!token) return null;
  const liq = tokenLiquidity(m).get(id);
  const pools = m.pools.filter((p) => p.tokens.includes(id)).sort((a, b) => b.tvl - a.tvl);
  let row = idx.rows.find((r) => r.id === id) ?? null;
  const inUniverse = !!row;
  if (!row && liq) {
    const ph = await getPriceHistory([id]).catch(() => new Map<string, { price: number; prev: number }>());
    const h = ph.get(id);
    row = await buildRow(m, liq, h && h.prev > 0 ? h.price / h.prev - 1 : null);
  }
  return { token, row, inUniverse, pools: pools.slice(0, 20), poolCount: pools.length, market: m };
});
