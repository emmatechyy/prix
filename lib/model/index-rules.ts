/**
 * Universe rules from thresholds/v1.yaml (index_rules), pure and tested.
 * - clean liquidity < min_liquidity_usd → low confidence
 * - no measured $10k depth → low confidence (never outranks a token with measured depth)
 * - best measured $10k impact > max_price_impact_10k → low confidence
 * Low-confidence tokens stay visible but rank below every high-confidence token, so they are
 * excluded from the top-ranked view.
 */
export type IndexRules = { min_liquidity_usd: number; max_price_impact_10k: number };
export type RuleInput = { id: string; score: number | null; liquidity: number; impact10k: number | null; impactRoute: string | null; derivedDepth?: boolean };
export type RuleOutput = { id: string; confidence: "high" | "low"; reasons: string[]; bestImpact10k: number | null; bestRoute: string | null; rank: number | null };

export function applyIndexRules(rows: RuleInput[], rules: IndexRules, extra: Map<string, { impact: number; route: string }> = new Map()): RuleOutput[] {
  const out = rows.map((r) => {
    const x = extra.get(r.id);
    let best = r.impact10k;
    let route = r.impactRoute;
    if (x && (best == null || x.impact < best)) {
      best = x.impact;
      route = x.route;
    }
    const reasons: string[] = [];
    if (!(r.liquidity >= rules.min_liquidity_usd)) reasons.push(`clean liquidity below $${rules.min_liquidity_usd.toLocaleString("en-US")}`);
    if (best == null) reasons.push("no measured $10k depth");
    else if (best > rules.max_price_impact_10k) reasons.push(`$10k price impact ${(best * 100).toFixed(1)}% > ${(rules.max_price_impact_10k * 100).toFixed(0)}%`);
    return { id: r.id, score: r.score, confidence: (reasons.length ? "low" : "high") as "high" | "low", reasons, bestImpact10k: best, bestRoute: route, rank: null as number | null, derived: !!r.derivedDepth && route === r.impactRoute };
  });
  const order = [...out].sort((a, b) => (a.confidence === b.confidence ? (b.score ?? -1) - (a.score ?? -1) : a.confidence === "high" ? -1 : 1));
  let n = 0;
  for (const r of order) r.rank = r.score == null ? null : ++n;
  return out.map(({ score: _s, derived, ...r }) => {
    void _s;
    return derived ? { ...r, reasons: [...r.reasons, "depth from AMM reserve math, not a router quote"] } : r;
  });
}
