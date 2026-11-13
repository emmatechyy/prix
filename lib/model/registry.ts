/**
 * Curated, disclosed classification tables. These are labels, not data:
 * every label below is shown in Methodology so readers can challenge it.
 */
export type Sector =
  | "L1 / NEAR"
  | "Stablecoin"
  | "Liquid staking"
  | "Bridged major"
  | "Omni-bridged"
  | "DeFi"
  | "Consumer"
  | "Launchpad / meme"
  | "Unclassified";

const CURATED: Record<string, { sector: Sector; label?: string }> = {
  "wrap.near": { sector: "L1 / NEAR", label: "NEAR" },
  "usdt.tether-token.near": { sector: "Stablecoin" },
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": { sector: "Stablecoin" },
  "dac17f958d2ee523a2206206994597c13d831ec7.factory.bridge.near": { sector: "Stablecoin" },
  "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near": { sector: "Stablecoin" },
  "6b175474e89094c44da98b954eedeac495271d0f.factory.bridge.near": { sector: "Stablecoin" },
  "853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near": { sector: "Stablecoin" },
  "usn": { sector: "Stablecoin" },
  "meta-pool.near": { sector: "Liquid staking" },
  "linear-protocol.near": { sector: "Liquid staking" },
  "lst.rhealab.near": { sector: "Liquid staking" },
  "v2-nearx.stader-labs.near": { sector: "Liquid staking" },
  "aurora": { sector: "Bridged major" },
  "eth.bridge.near": { sector: "Bridged major" },
  "2260fac5e5542a773aa44fbcfedf7c193bc2c599.factory.bridge.near": { sector: "Bridged major" },
  "nbtc.bridge.near": { sector: "Bridged major" },
  "token.rhealab.near": { sector: "DeFi" },
  "token.burrow.near": { sector: "DeFi" },
  "token.v2.ref-finance.near": { sector: "DeFi" },
  "meta-token.near": { sector: "DeFi" },
  "aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near": { sector: "DeFi" },
  "token.sweat": { sector: "Consumer" },
};

const LAUNCHPAD_SUFFIXES = [
  ".meme-launchpad.near",
  ".launchpad.justhoot.near",
  ".v2-launchpad.justhoot.near",
  ".nearlytrade.near",
  ".nearlytrader.near",
  ".tkn.near",
  ".meme-cooking.near",
  ".factory.batgirlfun.near",
];

export function sectorOf(token: string): Sector {
  const c = CURATED[token];
  if (c) return c.sector;
  if (token.endsWith(".omft.near")) return "Omni-bridged";
  if (LAUNCHPAD_SUFFIXES.some((s) => token.endsWith(s))) return "Launchpad / meme";
  if (token.endsWith(".factory.bridge.near")) return "Bridged major";
  return "Unclassified";
}

export function isStable(token: string) {
  return sectorOf(token) === "Stablecoin";
}

/** Accounts that hold tokens on behalf of many users (contracts, bridges, custody). Excluded from concentration metrics. */
export const CUSTODY_ACCOUNTS = new Set([
  "intents.near",
  "v2.ref-finance.near",
  "dclv2.ref-labs.near",
  "contract.main.burrow.near",
  "omni.bridge.near",
  "aurora",
  "factory.bridge.near",
  "e-11.bridge.near",
  "token.sweat",
  "meta-pool.near",
  "linear-protocol.near",
  "lst.rhealab.near",
  "staking.rhealab.near",
  "xtoken.rhealab.near",
  "xtoken.ref-finance.near",
  "boostfarm.ref-labs.near",
  "v2.ref-farming.near",
  "orderly-network.near",
  "asset-manager.orderly-network.near",
  "veax.near",
  "app.nearcrowd.near",
  "dex-aggregator.intear.near",
  "v2-pool-creator.justhoot.near",
]);

export function isCustody(account: string) {
  if (CUSTODY_ACCOUNTS.has(account)) return true;
  // Pool / vault / launchpad contracts commonly hold user funds.
  return /(^|\.)(pool|vault|launchpad|meme-launchpad|bridge|lockup|farm|staking)(\.|$)/.test(account) && !account.endsWith(".tg");
}

export const LAUNCHPAD_SUFFIX_LIST = LAUNCHPAD_SUFFIXES;

/** Base assets whose prices come from deep, external markets. Pools must contain one to count as "clean" liquidity. */
export function isAnchor(token: string) {
  const s = sectorOf(token);
  return s === "L1 / NEAR" || s === "Stablecoin" || s === "Liquid staking" || (s === "Bridged major" && token in CURATED);
}
