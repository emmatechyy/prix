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
| **H6** incident recovery | Not in the old rule set | New: custody and daily intents.near txns vs the 7-day median before 2026-10-01. Supported if both ≥ 90% within 30d; Not supported if either < 70% at day 30 | Yes, two points. (a) "Within 30d" is evaluated **on day 30 (2026-10-31)**, not as "at any point in 30 days". (b) Custody is a **quantity index**: daily `ft_balance_of(intents.near)` of the top 8 assets by value (about 97% of custody), read from archival RPC at the first block of each UTC day and valued at **today's** prices. This removes price moves and the hack's effect on prices. RHEA's historical price endpoint is not public, so priced-at-the-time custody is not available. Incident date (**reported**): CoinDesk and The Block, both 2026-10-01. The official @near_intents post is dated 2026-10-01 12:53 UTC; the official postmortem (2026-10-16) puts the withdrawals at 29 Sep 16:14 to 1 Oct 05:54 UTC and detection at 1 Oct 08:04 UTC. The site shows that timing range. Amount: $3.8M in all four sources. |
| **Index universe** | min clean liquidity $50k (same) | `min_liquidity_usd: 50000` (same). New: `max_price_impact_10k: 0.10` | No. Tokens below either rule get a **low confidence** badge and drop below every high-confidence token, so they are excluded from the top-ranked view. A token with no measured $10k depth is also low confidence, so it never outranks a token with measured depth. |
| **Index weights** | depth .30 / activity .25 / distribution .20 / flow .25 | identical | No |

## Edits after review (2026-11-14, file still DRAFT, edited in place)

The user reviewed the 2026-11-13 results and asked for two fixes before locking. Both are in
`thresholds/v1.yaml` now. `locked_at_commit` is still the placeholder, and the DRAFT label stays.

### H4: honest denominator plus wash flags

The 2026-11-13 result (99.97% "organic") was treated as a bug. The denominator only covered 40
hand-picked pools (the 25 clean pools with the most volume and the 15 largest rejected pools).

YAML change (H4):

```yaml
    denominator: all live pools (>= $1k TVL), rejected and flagged included
    wash_flags:
      max_daily_turnover: 2.0       # pool's mean daily volume over the window / its TVL; above = flagged
      concentration_min_share: 0.10 # pool's share of all-pool volume ...
      concentration_tvl_multiple: 5 # ... that is also > 5x its share of clean (non-rejected) TVL = flagged
```

The `supported` and `not_supported` bars did not change (≥ 80% and < 60%). The wash-flag
values were written into the file before the all-pool numbers were computed, and were not adjusted afterwards.

**Formula.** Window W = the 30 full UTC days before the snapshot date.

```
denominator = Σ over every live pool p (TVL ≥ $1k; rejected and flagged included) of Σ_{d∈W} volume(p, d)
numerator   = the same sum over pools that are
                not rejected by the integrity rules, AND
                carry no token-level round-trip/abnormal-turnover flag, AND
                trip neither wash flag:
                  turnover(p)      = mean_{d∈W} volume(p, d) / TVL(p)  >  2.0
                  concentration(p) = share(p) ≥ 10%  AND  share(p) > 5 × TVL(p) / clean TVL
H4 metric   = numerator / denominator
```

Daily volume per pool comes from RHEA's data service (simple pools) and the RHEA indexer (DCL
pools). Each pool needs one request; all 4,312 live pools are requested; 1 history was unreported in the
2026-11-14 snapshot and is left out of both numerator and denominator (listed in the snapshot's `errors`; H4 would go Insufficient if more than 5% were missing). **Denominator check:** the all-pool volume on the last full UTC day was
$9.13M, against RHEA's reported rolling 24h volume of $10.05M (91%). The rest is pools under
$1k TVL plus the window misalignment. Because an honest denominator *could* be built, the claim text
keeps the word "organic". The metric is labelled "volume share from verified pools".

**Result (snapshot 2026-11-14, sha256 `df9a7f1c26b1…`):**

| | 30d volume | share |
|---|---|---|
| Denominator: 2,103 of 4,312 live pools traded | $229.50M | 100% |
| Rejected pools (471) | $0.84M | 0.37% |
| Wash-flagged pools (4) | $135.38M | 59.0% |
| **Numerator: verified pools** | **$93.28M** | **40.6%** |

**H4 verdict: Not supported** (it needs +19.4 points to reach Mixed). The flagged pools:

| Pool | Kind | 30d volume | share of volume | share of clean TVL | turnover/day | flags |
|---|---|---|---|---|---|---|
| USDC/wNEAR (fee 0.01%) | DCL | $120.63M | 52.6% | 1.38% | 7.47× | turnover + concentration |
| wNEAR/ZEC (pool 6065) | AMM | $12.37M | 5.4% | 0.53% | 2.01× | turnover |
| QTC/wNEAR | DCL | $1.75M | 0.8% | 0.06% | 2.60× | turnover |
| FRAX/USDC (pool 4514) | STABLE | $0.62M | 0.3% | 0.01% | 4.38× | turnover |

**Decision needed.** Without the wash flags (rejected pools removed only), the share is **99.6%**,
which would be Supported. The verdict depends almost entirely on whether the USDC/wNEAR
concentrated-liquidity pool is wash trading. Concentrated-liquidity pools turn over their TVL faster
by design, so a 7.5× daily turnover there is a signal, not proof. The options are:
(a) keep the flags as written, so H4 is Not supported;
(b) exempt DCL pools from the turnover flag, or give them their own bar (this is a rule change, set
before looking at a new result, and becomes v2 if done after locking);
(c) remove the flags, so H4 reads 99.6% and is Supported.
PRIX will not choose one of these for you.

### H5: minimum coverage

YAML change (H5):

```yaml
    min_coverage: 0.80
```

**Coverage** is the share of window hours that were actually observed. NearBlocks pages are newest-first and
contiguous, so one page of 100 events observes every event between its oldest event and the point
where the previous page (or "now") ended. Coverage = the union of those intervals ÷ window hours.
H5 returns **Insufficient data** unless both the 7-day and the 30-day windows are at least 80% observed. Nothing is
extrapolated. The claim card shows coverage as a percentage and as a bar against the 80% mark.

**Flow job.** The job now uses a stored cursor (`data/history/intents-flow-buckets.json → high_ns, gaps[]`).
Each run pages back from now until it reaches the newest instant already observed. If the call
budget runs out first, the unread stretch is stored as a gap with the exact NearBlocks `next`
cursor, and later runs resume it, newest gap first. No gap is ever skipped silently; it simply stays
unobserved.

**Result (snapshot 2026-11-14):** coverage **0.59%** of the 30-day window (4.2 of 720 h) and
**0.50%** of the 7-day window. **H5 verdict: Insufficient data.**

**Backfill.** A historical backfill through pagination works mechanically: each page resumes exactly where the last
one stopped. It is not feasible on the free NearBlocks tier. intents.near emits about 100 token events a minute
(26,800 events read cover 254 minutes), so a full day needs about 1,500 pages. Thirty days need
about 45,000. At 30 calls per 30-minute run (about 1,440 a day), the job cannot even keep up with live
traffic, so coverage will **not** reach 80% by itself. Ways to reach it, all human decisions:
(a) a paid NearBlocks key (`NEARBLOCKS_API_KEY`, already read by the job) with a much larger call budget;
(b) a different complete source for MINT/BURN totals. For example, the custody quantity index used for H6 already gives
daily intents.near balances of the top assets from archival RPC with full coverage, and its day-over-day change at constant
prices equals deposits minus withdrawals for those assets. Using it would change the H5 metric, so it is
listed here as a proposal, not applied.

## Results to sanity-check before locking (snapshot 2026-11-13; superseded for H4 and H5 by the section above)

* **H4 read 100% organic.** That was the narrow 40-pool denominator. Fixed above: the all-pool denominator plus wash flags give 40.6%.
* **H6 baseline.** The exploit window began 2026-09-29 16:14 UTC, so the 7-day baseline (09-24 to 09-30) includes about 1.3 days of it. Custody at constant prices was rising in that week (from $109M to $122M), so the baseline median ($120.6M) is high relative to day 30 ($101.0M, 84%). Shifting the baseline to 09-22 to 09-28 would change the custody ratio. This is a human decision.
* **H5 sample.** The backfill held 249 buckets and 24,900 events over 31 days, but only about 4 hours of activity were actually sampled. Fixed above: `min_coverage: 0.80`, so H5 is Insufficient data at 0.59% coverage.

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
