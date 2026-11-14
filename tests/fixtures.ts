import type { Snapshot } from "../lib/snapshot/schema";
import { addDays } from "../lib/thesis/stats";

export const AS_OF = "2026-11-13T12:00:00.000Z";
export const TODAY = "2026-11-13";

/** A minimal, valid snapshot with empty series; tests fill in only what a claim needs. */
export function baseSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    as_of: AS_OF,
    date: TODAY,
    methodology_version: "test",
    thresholds_version: 1,
    thresholds_sha256: "t",
    near_price_usd: 3,
    active_accounts_daily: 100,
    rhea: { clean_tvl_usd: 40e6, unfiltered_tvl_usd: 900e6, reported_tvl_usd: 42e6, amm_tvl_usd: 42e6, lending_tvl_usd: 130e6, volume_24h_usd: 9e6, rejected_pools: [], rejected_count: 0, volume_organic_share: null },
    intents: { custody_usd: 100e6, priced_assets: 10, deposits_usd: 0, withdrawals_usd: 0, events_sampled: 0, window_minutes: 0 },
    depth: [],
    depth_meta: { quotes_attempted: 0, quotes_ok: 0, cap: 96, oneclick_auth: "none", aggregator_auth: "not-configured" },
    index: [],
    series: { network: [], rhea_tvl: [], intents_txns: [], custody_constant: [], custody_constant_meta: { assets: [], coverage: 0, price_as_of: AS_OF }, h2_daily: [], flow_buckets: [], pool_volume_all: null },
    incident: { date: "2026-10-01", date_basis: "reported", sources: [{ kind: "press", publisher: "Example", url: "https://example.org/incident", published: "2026-10-01", amount_usd: 1e6, timing: "reported 1 Oct" }], amount_usd_range: { low: 1e6, high: 1e6 }, timing_range: { from: "2026-10-01T00:00:00Z", to: "2026-10-01T00:00:00Z", note: "test" } },
    sources: [],
    errors: [],
    sha256: "snap",
    ...over,
  };
}
export const days = (n: number, end = TODAY) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
