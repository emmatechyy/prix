import { z } from "zod";

/**
 * Schema for the pre-registered thresholds file (/thresholds/v1.yaml).
 * The file is the source of truth for every verdict rule. The build fails if it does not match
 * this schema, or if a rule string can no longer be parsed into numbers (see ./rules.ts).
 */
const Claim = z.object({
  text: z.string().min(10),
  metric: z.string().min(5),
  supported: z.string().min(3),
  not_supported: z.string().min(3),
  else: z.literal("Mixed"),
  grade: z.enum(["A", "B", "C"]),
  incident_date: z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
});

export const ThresholdsSchema = z.object({
  version: z.number().int().positive(),
  /** A 40-char git SHA once the human approves the file; anything else means DRAFT. */
  locked_at_commit: z.string(),
  verdict_values: z.tuple([z.literal("Supported"), z.literal("Mixed"), z.literal("Not supported"), z.literal("Insufficient data")]),
  global: z.object({
    min_window_days: z.number().int().positive(),
    min_intents_events: z.number().int().positive(),
    missing_data: z.literal("not reported"),
    evidence_grades: z.object({ A: z.string(), B: z.string(), C: z.string() }),
  }),
  claims: z.object({
    H1: Claim,
    H2: Claim,
    H3: Claim,
    H4: Claim.extend({
      denominator: z.string().min(5),
      wash_flags: z.object({ max_daily_turnover: z.number().positive(), concentration_min_share: z.number().positive().max(1), concentration_tvl_multiple: z.number().positive() }),
    }),
    H5: Claim.extend({ min_coverage: z.number().positive().max(1) }), H6: Claim.extend({ incident_date: Claim.shape.incident_date.unwrap() }) }),
  index_rules: z.object({
    min_liquidity_usd: z.number().positive(),
    max_price_impact_10k: z.number().positive().max(1),
    weights: z
      .object({ depth: z.number(), activity: z.number(), distribution: z.number(), flow: z.number() })
      .refine((w) => Math.abs(w.depth + w.activity + w.distribution + w.flow - 1) < 1e-9, "weights must sum to 1"),
  }),
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;
export type ClaimId = keyof Thresholds["claims"];
export const CLAIM_IDS: ClaimId[] = ["H1", "H2", "H3", "H4", "H5", "H6"];

export function isLocked(t: Pick<Thresholds, "locked_at_commit">) {
  return /^[0-9a-f]{40}$/.test(t.locked_at_commit);
}
