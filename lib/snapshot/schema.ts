import { z } from "zod";

const num = z.number().finite();
const nnum = num.nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DepthStatus = z.enum(["ok", "no-route", "error", "paused", "rate-limited", "not-configured"]);
export const DepthRowSchema = z.object({
  route: z.enum(["intents", "rhea-router"]),
  /** Which concrete router produced the row (e.g. "1click-dry", "smartrouter-v1", "aggregator-v2"). */
  router: z.string(),
  /** Human label of the router and its version, shown on every depth row. */
  router_version: z.string(),
  origin: z.string(),
  destination_token: z.string(),
  /** Index token this row measures (the token being bought via Intents, or sold via RHEA). */
  token_id: z.string(),
  size_usd: num,
  amount_in_usd: nnum,
  amount_out_usd: nnum,
  fee_usd: nnum,
  /** Flat app fee charged by the quoting API (1Click without a partner key: 20 bps). Null when none applies. */
  app_fee_bps: nnum,
  /** 1 − (out/in at size) ÷ (out/in at the $1k baseline), both net of the flat app fee. Null when either quote is missing. */
  relative_slippage: nnum,
  quote_ms: nnum,
  status: DepthStatus,
  error: z.string().optional(),
  fetched_at: z.string(),
});
export type DepthRow = z.infer<typeof DepthRowSchema>;

export const FlowBucketSchema = z.object({
  /** Window covered by the sampled page(s), ISO UTC. */
  start: z.string(),
  end: z.string(),
  events: z.number().int().nonnegative(),
  deposits_usd: num,
  withdrawals_usd: num,
  mints: z.number().int().nonnegative(),
  burns: z.number().int().nonnegative(),
  unpriced: z.number().int().nonnegative(),
  source: z.string(),
});
export type FlowBucket = z.infer<typeof FlowBucketSchema>;

export const SnapshotSchema = z.object({
  as_of: z.string(),
  date: isoDate,
  methodology_version: z.string(),
  thresholds_version: z.number().int(),
  thresholds_sha256: z.string(),
  near_price_usd: nnum,
  active_accounts_daily: nnum,
  rhea: z.object({
    clean_tvl_usd: nnum,
    /** Sum of every pool's PRIX-computed value, including the rejected ones (the counterfactual). */
    unfiltered_tvl_usd: nnum,
    reported_tvl_usd: nnum,
    amm_tvl_usd: nnum,
    lending_tvl_usd: nnum,
    volume_24h_usd: nnum,
    rejected_pools: z.array(z.object({ id: z.string(), pair: z.string(), claimed_usd: num, reasons: z.array(z.string()) })),
    rejected_count: z.number().int(),
    volume_organic_share: nnum,
  }),
  intents: z.object({
    custody_usd: nnum,
    priced_assets: z.number().int().nullable(),
    deposits_usd: nnum,
    withdrawals_usd: nnum,
    events_sampled: z.number().int(),
    window_minutes: num,
  }),
  depth: z.array(DepthRowSchema),
  depth_meta: z.object({ quotes_attempted: z.number().int(), quotes_ok: z.number().int(), cap: z.number().int(), oneclick_auth: z.enum(["api-key", "jwt", "none"]), aggregator_auth: z.enum(["configured", "not-configured"]) }),
  index: z.array(
    z.object({
      token_id: z.string(),
      symbol: z.string(),
      score: nnum,
      rank: z.number().int().nullable(),
      liquidity_usd: nnum,
      impact_10k: nnum,
      best_impact_10k: nnum,
      best_impact_route: z.string().nullable(),
      flags: z.array(z.string()),
      confidence: z.enum(["high", "low"]),
      low_confidence_reasons: z.array(z.string()),
    }),
  ),
  series: z.object({
    network: z.array(z.object({ date: isoDate, active: nnum, txns: nnum, price: nnum })),
    rhea_tvl: z.array(z.object({ date: isoDate, amm: nnum, lending: nnum })),
    intents_txns: z.array(z.object({ date: isoDate, txns: num })),
    /** intents.near holdings of the top assets, valued at this snapshot's prices (a quantity index). */
    custody_constant: z.array(z.object({ date: isoDate, usd: num, block: z.number().int(), assets: z.number().int() })),
    custody_constant_meta: z.object({ assets: z.array(z.object({ id: z.string(), symbol: z.string(), price_usd: num, share_of_custody: num })), coverage: num, price_as_of: z.string() }),
    /** Daily intents custody ÷ clean RHEA TVL, both from the same day's snapshot (carried forward). */
    h2_daily: z.array(z.object({ date: isoDate, custody_usd: num, clean_tvl_usd: num, ratio: num, snapshot_sha256: z.string() })),
    flow_buckets: z.array(FlowBucketSchema),
    /**
     * H4: daily USD volume of every live pool (>= $1k TVL) that traded in the window, rejected
     * included. `daily[i]` is the volume on `dates[i]`. Pools with no volume are counted in pools_live.
     */
    pool_volume_all: z
      .object({
        dates: z.array(isoDate),
        pools_live: z.number().int(),
        pools_unreported: z.number().int(),
        protocol_volume_24h_usd: nnum,
        all_pool_volume_last_day_usd: nnum,
        rows: z.array(z.object({ id: z.string(), pair: z.string(), kind: z.string(), tvl_usd: num, rejected: z.boolean(), token_flagged: z.boolean(), daily: z.array(num) })),
      })
      .nullable(),
  }),
  incident: z.object({
    /** H6 baseline parameter: the date the incident was reported. */
    date: isoDate,
    date_basis: z.literal("reported"),
    sources: z.array(z.object({ kind: z.enum(["official", "press"]), publisher: z.string(), url: z.string().url(), published: z.string(), amount_usd: nnum, timing: z.string() })),
    amount_usd_range: z.object({ low: num, high: num }),
    timing_range: z.object({ from: z.string(), to: z.string(), note: z.string() }),
  }),
  sources: z.array(z.object({ url: z.string(), fetched_at: z.string(), sha256: z.string() })),
  errors: z.array(z.object({ step: z.string(), message: z.string() })),
  sha256: z.string(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;
