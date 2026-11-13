import "server-only";
import type { Market } from "./market";
import { MIN_POOL_TVL } from "./market";

export type SectorRow = { sector: string; liquidity: number; volume24h: number; pools: number; tokens: number };

/** Clean-pool liquidity and 24h volume by sector. Each pool's volume is split 50/50 between its two sides. */
export function sectorBreakdown(m: Market): { rows: SectorRow[]; total: number; volumeCovered: number } {
  const by = new Map<string, SectorRow & { tokenSet: Set<string> }>();
  let total = 0;
  let volumeCovered = 0;
  for (const p of m.pools) {
    if (!p.clean || p.tvl < MIN_POOL_TVL) continue;
    p.tokens.forEach((id, i) => {
      const t = m.tokens.get(id)!;
      let r = by.get(t.sector);
      if (!r) by.set(t.sector, (r = { sector: t.sector, liquidity: 0, volume24h: 0, pools: 0, tokens: 0, tokenSet: new Set() }));
      r.liquidity += p.sideUsd[i] ?? 0;
      total += p.sideUsd[i] ?? 0;
      if (p.volume24h != null) r.volume24h += p.volume24h / p.tokens.length;
      r.pools++;
      r.tokenSet.add(id);
    });
    if (p.volume24h != null) volumeCovered += p.volume24h;
  }
  const rows = [...by.values()].map(({ tokenSet, ...r }) => ({ ...r, tokens: tokenSet.size })).sort((a, b) => b.liquidity - a.liquidity);
  return { rows, total, volumeCovered };
}
