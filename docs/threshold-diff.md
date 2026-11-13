# Thresholds v1 vs the rules PRIX published before

**Status: DRAFT, not locked.** `thresholds/v1.yaml` is the file the user supplied, copied verbatim.
`locked_at_commit` is still the placeholder. Verdicts on the site and in the API are labelled
"thresholds: DRAFT, not locked" until a human fills in the commit SHA (see "To lock" at the end).

"Before" is what `/methodology` and `lib/model/thesis.ts` used on `main` at the time of writing.
"After" is what the YAML says and what `lib/thesis/engine.ts` now computes.

## What changed, claim by claim

| | Before (live site on `main`) | After (`thresholds/v1.yaml`) | Decision needed? |
|---|---|---|---|
| **Global** | No minimum window; a verdict could come from one day of data | `min_window_days: 30` and `min_intents_events: 6000`; otherwise "Insufficient data" | No. Applied as written, except H3 (see below) |
| **H1** usage vs price | Pearson correlation of daily % changes, 180d, \|r\| < 0.30. Active accounts 30d vs prior 30d > −10%. Year-on-year drop < 50%. Not supported if the 30d drop is more than 10% | Spearman ρ of the **7d moving averages** of active accounts and price, 180d. Supported if \|ρ\| < 0.30 **and** 30d growth ≥ 0%. Not supported if **ρ ≥ 0.60** | Yes, one point. The new rule never says "Not supported" for a falling-usage, uncorrelated chain; it gives Mixed. The year-on-year guard is gone. Also, smoothed MAs usually correlate much more than daily changes do, so ρ will be far from 0 even with no causal link. Confirm this is intended. |
| **H2** custody vs AMM | Ratio ≥ 1× on **one** day (today). Mixed from 0.5× to 1× | Ratio ≥ **2×** on ≥ 80% of the last **30 days**. Not supported if < 1× on > 50% of days | Yes. There is no honest daily backfill of clean RHEA TVL, because the pool-level integrity filter needs same-day reserves and prices. PRIX therefore counts only days that have a published snapshot, so **H2 shows "Insufficient data" until 30 daily snapshots exist** (around mid-December 2026). Today's ratio is shown as evidence only. An alternative is to backfill clean TVL from archival pool reserves; that is possible but not built. |
| **H3** depth | ≥ 50% of the universe sells **$10k** into USDC at < 1% impact, using the RHEA router only | Count of non-NEAR tokens with **$100k** impact ≤ 1%, best of the RHEA router and Intents dry quotes. Supported if ≥ 5, Not supported if ≤ 1 | Yes, two points. (a) **Window:** a depth quote is a point-in-time fact, so PRIX does **not** apply `min_window_days` to H3. The window shows as 1 day. Confirm, or say H3 should wait for 30 daily snapshots. (b) **LSTs:** stNEAR, LiNEAR and rNEAR count as "non-NEAR, non-wNEAR" under a literal reading. Confirm, or exclude them. |
| **H3** impact definition | 1 − out/in at $10k, fees included | *Relative slippage*: 1 − (out/in at size) ÷ (out/in at the $1k quote on the same route). Fixed fees cancel out | No. This follows spec §4. For Intents the trade buys the token with BTC/ETH/SOL; for RHEA it sells the token for USDC. |
| **H4** organic volume | < 20% of index tokens trip the round-trip or abnormal-turnover checks | Volume share of non-rejected, non-flagged pools ≥ 80% (Not supported < 60%) over **30d** | Yes, partly. "Flagged" is read as: the pool's tokens carry a round-trip or abnormal-turnover flag *today*. Today's clean/flag status is applied to each pool's 30-day volume history, because there is no daily flag history. The pools counted are the 25 clean pools with the most volume plus the 15 largest rejected pools. |
| **H5** fresh capital | Net Intents deposits over the latest ~1 hour sample (counts if ≥ 30 min), plus the 30d AMM TVL change | Net Intents flow over **7d and 30d** plus the 30d **clean** TVL change. Supported if all three are > 0; Not supported if both flows are < 0 | Yes. (a) Net flow is a **sample**: one page of 100 events every 3 h (backfill) and every 30 min (GitHub Action). Mint minus burn USD is summed over the sampled pages and **never extrapolated**. Confirm a sample is acceptable for "net flow". (b) "Clean TVL change" uses the RHEA data-service AMM TVL series (outlier days excluded), because there is no daily clean-TVL history (same issue as H2). (c) Insufficient until ≥ 6,000 sampled events span ≥ 29 days. |
| **H6** incident recovery | Not in the old rule set | New: custody and daily intents.near txns vs the 7-day median before 2026-10-01. Supported if both ≥ 90% within 30d; Not supported if either < 70% at day 30 | Yes, two points. (a) "Within 30d" is evaluated **on day 30 (2026-10-31)**, not as "at any point in 30 days". (b) Custody is a **quantity index**: daily `ft_balance_of(intents.near)` of the top 8 assets by value (about 97% of custody), read from archival RPC at the first block of each UTC day and valued at **today's** prices. This removes price moves and the hack's effect on prices. RHEA's historical price endpoint is not public, so priced-at-the-time custody is not available. Incident date verified: CoinDesk and The Block, both 2026-10-01. |
| **Index universe** | min clean liquidity $50k (same) | `min_liquidity_usd: 50000` (same). New: `max_price_impact_10k: 0.10` | No. Tokens below either rule get a **low confidence** badge and drop below every high-confidence token, so they are excluded from the top-ranked view. A token with no measured $10k depth is also low confidence, so it never outranks a token with measured depth. |
| **Index weights** | depth .30 / activity .25 / distribution .20 / flow .25 | identical | No |

## Results to sanity-check before locking (snapshot 2026-11-13)

* **H4 reads 100% organic.** The 15 largest rejected pools have almost no daily volume in the RHEA data service, and none of the 25 highest-volume clean pools contains a token flagged for round-trip or abnormal turnover today. The rule as written is therefore easy to pass. If wash trading in *clean* pools is the concern, a stricter "flagged" definition is needed, for example a turnover threshold on each pool.
* **H6 baseline.** The exploit window began 2026-09-29 16:14 UTC, so the 7-day baseline (09-24 to 09-30) includes about 1.3 days of it. Custody at constant prices was rising in that week (from $109M to $122M), so the baseline median ($120.6M) is high relative to day 30 ($101.0M, 84%). Shifting the baseline to 09-22 to 09-28 would change the custody ratio. This is a human decision.
* **H5 sample.** The backfill holds 249 buckets and 24,900 events over 31 days, but only about 4 hours of activity are actually sampled. The sign of the net flow is meaningful. The size is not.

## Evidence grades

The YAML grades every claim **B** (indexer/API). PRIX downgrades H3 to **C** when a passing token's
depth comes only from AMM reserve math rather than a router quote, as the YAML comment says.
No claim is graded A today: custody balances (H6) come from on-chain archival RPC, but they are combined
with indexer prices.

## To lock

1. A human reviews the "Decision needed?" column above and edits `thresholds/v1.yaml` if needed.
2. Commit the YAML. Then set `locked_at_commit` to that commit's 40-character SHA in a second commit.
   PRIX treats only a 40-hex value as locked: `lib/thresholds/schema.ts → isLocked`.
3. Any later change to a number becomes `thresholds/v2.yaml`. v1 is never edited after locking.
