import "server-only";
import { batchViews } from "@rhea-finance/cross-chain-sdk";
import { memo } from "../memo";
import { getMarket } from "../model/market";
import { units } from "../format";

/**
 * RHEA Lending (Burrow, contract contract.main.burrow.near) fundamentals via the RHEA cross-chain SDK's
 * read-only `batchViews()` (NEAR RPC view calls; no account, nothing signed). Balances are in token
 * decimals + the asset's extra_decimals; USD values use RHEA prices (not reported when unpriced).
 */
export type LendingRow = { token_id: string; symbol: string; supplied: number; borrowed: number; supplied_usd: number | null; borrowed_usd: number | null; utilization: number | null; supply_apr: number | null; borrow_apr: number | null; can_borrow: boolean };
export const LENDING_SOURCE = "@rhea-finance/cross-chain-sdk batchViews() → contract.main.burrow.near get_assets_paged_detailed (NEAR RPC view)";

let cache: { at: number; v: Promise<{ rows: LendingRow[]; supplied_usd: number; borrowed_usd: number; unpriced: number; asOf: string }> } | null = null;

async function load() {
  const [d, m] = await Promise.all([batchViews(), getMarket()]);
  const rows: LendingRow[] = d.assets_paged_detailed.map((a) => {
    const t = m.tokens.get(a.token_id);
    const dec = (t?.decimals ?? 0) + (a.config.extra_decimals ?? 0);
    const supplied = t ? units(a.supplied.balance, dec) : NaN;
    const borrowed = t ? units(a.borrowed.balance, dec) : NaN;
    const px = t?.price ?? null;
    return {
      token_id: a.token_id,
      symbol: t?.symbol ?? a.token_id,
      supplied,
      borrowed,
      supplied_usd: px != null && Number.isFinite(supplied) ? supplied * px : null,
      borrowed_usd: px != null && Number.isFinite(borrowed) ? borrowed * px : null,
      utilization: Number(a.supplied.balance) > 0 ? Number(a.borrowed.balance) / Number(a.supplied.balance) : null,
      supply_apr: Number.isFinite(Number(a.supply_apr)) ? Number(a.supply_apr) : null,
      borrow_apr: Number.isFinite(Number(a.borrow_apr)) ? Number(a.borrow_apr) : null,
      can_borrow: a.config.can_borrow,
    };
  });
  rows.sort((a, b) => (b.supplied_usd ?? -1) - (a.supplied_usd ?? -1));
  return {
    rows,
    supplied_usd: rows.reduce((a, r) => a + (r.supplied_usd ?? 0), 0),
    borrowed_usd: rows.reduce((a, r) => a + (r.borrowed_usd ?? 0), 0),
    unpriced: rows.filter((r) => r.supplied_usd == null).length,
    asOf: new Date().toISOString(),
  };
}

/** 10-minute in-process cache (the SDK uses its own fetch, outside Next's data cache). */
export const getLending = memo(async () => {
  if (!cache || Date.now() - cache.at > 600_000) {
    cache = { at: Date.now(), v: load() };
    cache.v.catch(() => (cache = null));
  }
  return cache.v;
});
