/**
 * UI strings and the terms table (frontend spec §8). Code keeps its internal names; everything a
 * reader sees goes through `plain()` so the UI uses the agreed words.
 */
export const COPY = {
  siteTitle: "The long-term case for NEAR, tested daily.",
  readOnly: "Read-only. No wallet, no trading, no custody.",
  notReported: "Not reported",
  notEnoughData: "Not enough data yet",
  refused: "What PRIX refused to count",
  stale: (ago: string) => `Last updated ${ago}. Showing the last good snapshot.`,
} as const;

const TERMS: [RegExp, string][] = [
  [/\bInsufficient data\b/g, "Not enough data yet"],
  [/\$10k (price )?impact\b/gi, "Cost to trade $10k"],
  [/\bclean pool TVL\b/gi, "TVL (verified pools)"],
  [/\bclean TVL\b/gi, "TVL (verified pools)"],
  [/\brejected pools\b/gi, "pools we didn't count"],
  [/\bunanchored-pair\b/g, "Priced against a token with no reliable price"],
  [/\bno-route\b/g, "no route"],
  [/\bnot-configured\b/g, "not configured"],
];

/** Apply the terms table to a string from the engine or the snapshot. */
export function plain(s: string): string {
  return TERMS.reduce((a, [re, to]) => a.replace(re, to), s).replace(/(^|[\s(])'/g, "$1‘").replace(/'/g, "’");
}

/** Plain explanations for the evidence grades (thresholds/v1.yaml global.evidence_grades, reworded). */
export const GRADE_TEXT: Record<"A" | "B" | "C", string> = {
  A: "Grade A: read directly from the chain (RPC or contract view).",
  B: "Grade B: read from an indexer or public API (RHEA indexer, NearBlocks, FastNEAR) and recomputed by PRIX.",
  C: "Grade C: derived or modelled from grade A or B data.",
};

/** Order claims by importance to the thesis (usage, capital, markets, then the supporting tests), not by verdict. */
export const CLAIM_ORDER = ["H1", "H2", "H3", "H4", "H5", "H6"] as const;

const FLAG_TEXT: Record<string, string> = {
  "unanchored-pair": "Priced against a token with no reliable price",
  "unpriced-side": "One side of the pool has no price",
  "price-imbalance": "The two sides of the pool differ in value by more than 3×",
  "exceeds-protocol-tvl": "Claims more than half of RHEA’s whole TVL",
  dust: "Under $1,000 of liquidity",
  "amm-reserves": "Depth from pool reserves, not a router quote",
  "top-10 holders own >80% of float": "Top 10 holders own over 80% of supply",
  "insufficient evidence (<50% of weight)": "Less than half of the score had data",
};

/** Flags are plain sentences, never codes (spec §4.2). */
export function flagText(f: string): string {
  const t = FLAG_TEXT[f] ?? f;
  return plain(t.charAt(0).toUpperCase() + t.slice(1));
}
