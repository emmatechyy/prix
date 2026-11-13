import "server-only";
import { memo } from "../memo";
import { mapLimit } from "../http";
import { fastnearUrls, ftTotalSupply, getAccount, getTopHolders, getTxn, nearblocksUrls } from "../sources/near";
import { units } from "../format";
import { getMarket, MIN_POOL_TVL, type Pool } from "./market";
import { isCustody, isStable, sectorOf } from "./registry";

const NEWEST_AMM = 80; // highest AMM pool ids
const NEWEST_DCL = 120; // last DCL pools in contract listing order
const MAX_CANDIDATES = 16;

export const LAUNCH_WEIGHTS = { liquidity: 0.35, distribution: 0.25, activity: 0.2, maturity: 0.2 } as const;

export type Launch = {
  token: string;
  symbol: string;
  name: string;
  sector: string;
  pool: { id: string; kind: Pool["kind"]; pair: string[]; tvl: number; volume24h: number | null };
  price: number | null;
  createdAt: number | null; // token account creation (NearBlocks)
  creator: string | null; // signer of the account-creation transaction
  creationTx: string | null;
  holders: number | null;
  holdersCapped: boolean;
  top10Share: number | null;
  components: { liquidity: number; distribution: number | null; activity: number | null; maturity: number | null };
  score: number;
  confidence: number;
  flags: string[];
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export const getLaunches = memo(async () => {
  const m = await getMarket();
  const amm = m.pools
    .filter((p) => p.kind === "AMM" && /^\d+$/.test(p.id))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, NEWEST_AMM);
  const dclAll = m.pools.filter((p) => p.kind === "DCL");
  const dcl = dclAll.slice(-NEWEST_DCL).reverse();

  // Candidate = the non-base token of a recent pool with real (clean, ≥$1k) liquidity.
  const seen = new Set<string>();
  const cands: { token: string; pool: Pool }[] = [];
  for (const p of [...dcl, ...amm]) {
    if (!p.clean || p.tvl < MIN_POOL_TVL) continue;
    const t = p.tokens.find((id) => id !== "wrap.near" && !isStable(id) && sectorOf(id) !== "Liquid staking");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    cands.push({ token: t, pool: p });
  }
  const picked = cands.sort((a, b) => b.pool.tvl - a.pool.tvl).slice(0, MAX_CANDIDATES);

  const rows = await mapLimit(picked, 3, async ({ token, pool }): Promise<Launch> => {
    const t = m.tokens.get(token)!;
    const flags: string[] = [];
    const acct = await getAccount(token).catch(() => null);
    const createdAt = acct?.created?.block_timestamp ? Math.floor(Number(acct.created.block_timestamp) / 1e6) : null;
    const creationTx = acct?.created?.transaction_hash ?? null;
    const creator = creationTx ? ((await getTxn(creationTx).catch(() => null))?.signer_account_id ?? null) : null;
    let holders: number | null = null;
    let holdersCapped = false;
    let top10: number | null = null;
    try {
      const [h, supply] = await Promise.all([getTopHolders(token), ftTotalSupply(token)]);
      holders = h.length < 100 ? h.filter((x) => x.amount !== "0").length : null;
      holdersCapped = h.length >= 100;
      const sup = units(supply, t.decimals);
      if (sup > 0 && h.length > 0) {
        const custody = h.filter((x) => isCustody(x.account)).reduce((a, x) => a + units(x.amount, t.decimals) / sup, 0);
        const float = 1 - custody;
        const t10 = h.filter((x) => !isCustody(x.account)).slice(0, 10).reduce((a, x) => a + units(x.amount, t.decimals) / sup, 0);
        top10 = float >= 0.01 && t10 / float <= 1.0001 ? t10 / float : null;
      }
    } catch {
      /* not reported */
    }
    const liqScore = r1(100 * clamp((Math.log10(Math.max(pool.tvl, 1)) - 3) / 3));
    const distScore = top10 == null ? null : r1(100 * clamp((0.9 - top10) / 0.7));
    const actScore = pool.volume24h == null ? null : pool.volume24h <= 0 ? 0 : r1(100 * clamp((Math.log10(pool.volume24h) - 2) / 4));
    const ageDays = createdAt ? (Date.now() - createdAt) / 86_400_000 : null;
    const matScore = ageDays == null ? null : r1(100 * clamp(ageDays / 30));

    if (ageDays != null && ageDays < 1) flags.push("token account < 24h old");
    if (!creator) flags.push("creator not resolved");
    if (top10 != null && top10 > 0.8) flags.push("top-10 holders own >80% of float");
    if (top10 == null) flags.push("holders not indexed");
    if (pool.volume24h === 0) flags.push("no trades in 24h");
    if (t.priceDeviation != null && t.priceDeviation > 0.05) flags.push("price disagrees with NEAR Intents");

    const parts: [number | null, number][] = [
      [liqScore, LAUNCH_WEIGHTS.liquidity],
      [distScore, LAUNCH_WEIGHTS.distribution],
      [actScore, LAUNCH_WEIGHTS.activity],
      [matScore, LAUNCH_WEIGHTS.maturity],
    ];
    const w = parts.reduce((a, [s, wt]) => a + (s == null ? 0 : wt), 0);
    const score = r1(parts.reduce((a, [s, wt]) => a + (s == null ? 0 : s * wt), 0) / w);
    return {
      token,
      symbol: t.symbol,
      name: t.name,
      sector: t.sector,
      pool: { id: pool.id, kind: pool.kind, pair: pool.symbols, tvl: pool.tvl, volume24h: pool.volume24h },
      price: t.price,
      createdAt,
      creator,
      creationTx,
      holders,
      holdersCapped,
      top10Share: top10,
      components: { liquidity: liqScore, distribution: distScore, activity: actScore, maturity: matScore },
      score,
      confidence: Math.round(w * 100) / 100,
      flags,
    };
  });

  const launches = rows.filter((x): x is Launch => !!x).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return {
    asOf: new Date().toISOString(),
    launches,
    scanned: { amm: amm.length, dcl: dcl.length, candidates: cands.length },
    sources: ["https://api.rhea.finance/list-top-pools", "dclv2.ref-labs.near list_pools (RPC)", nearblocksUrls.account("<token>"), nearblocksUrls.txn("<hash>"), fastnearUrls.top("<token>")],
  };
});
