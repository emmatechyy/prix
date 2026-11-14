# PRIX — Product Requirements Document

**Product:** PRIX, an evidence-graded smart index layer for NEAR on-chain markets
**Event:** NEAR HACKATHON 2026 (nearhackathon.com), track **Investment Thesis** (`thesis`)
**Owner:** Yusuf Habib, full-stack engineer and lead product designer
**Status:** v1 built and verified locally on 13 Nov 2026. Not deployed yet.
**Scope rule:** read-only. No wallet connection, no signing, no trading, no custody, no private keys.

---

## 1. Problem

Anyone who wants to hold a position on NEAR has to answer four questions, and today they have no single, trustworthy place to do it:

1. **Can I get in and out?** Real depth is hidden. Pool TVL figures shown by indexers include pools priced against illiquid tokens. For example, on 13 Nov 2026 one RHEA pool (ELON/INEAR) claimed about $683M, which is more than ten times RHEA's whole reported TVL.
2. **Is the activity real?** Volume and TVL can be manufactured with round-trip trades or self-priced pairs.
3. **Who owns it?** Holder concentration is spread across explorers. Custody contracts (DEXs, bridges, the NEAR Intents vault) also distort naive "top holder" counts.
4. **Where is capital moving?** Flows through RHEA and NEAR Intents, the chain-abstraction layer, are visible on-chain but are not aggregated anywhere.

The track asks for an investment thesis that is "judged on the evidence, not the conviction" and "models anyone can re-run". Most crypto dashboards do the opposite: they show numbers with no provenance and draw no falsifiable conclusion.

## 2. Users

| User | Job to be done | What PRIX gives them |
|---|---|---|
| Fund / treasury analyst | Size a position in a NEAR token and defend it in a memo | A score with every input, the price impact for $10k, holder concentration, and links to sources |
| DAO / grant committee | Decide which ecosystem tokens or pools to support | Sector liquidity, integrity rejections, launch quality |
| Researcher / journalist | Make a claim about NEAR's health | Six pre-registered hypotheses with verdicts from hashed snapshots, plus `pnpm verdicts` / `pnpm verify` to reproduce them |
| Builder / bot / AI agent | Consume clean signals without running an indexer | A public JSON API with `asOf` and source URLs |

## 3. Thesis framing (track fit)

PRIX turns "is NEAR investable?" into six falsifiable claims. Their numeric rules are pre-registered in `thresholds/v1.yaml` (zod-validated at build; **DRAFT, not locked** until a human sets `locked_at_commit`; differences from the earlier rules in `docs/threshold-diff.md`):

| # | Claim | Rule (summary, from thresholds/v1.yaml) |
|---|---|---|
| H1 | Network usage holds up independently of price | Spearman ρ of 7d-MA active accounts vs 7d-MA price (180d): Supported if \|ρ\| < 0.30 and 30d growth ≥ 0; Not supported if ρ ≥ 0.60 |
| H2 | NEAR Intents, not the AMM, is where capital sits | custody ÷ clean RHEA TVL ≥ 2× on ≥ 80% of the last 30 daily snapshots; Not supported if < 1× on > 50% |
| H3 | Markets absorb institutional size beyond NEAR | ≥ 5 non-NEAR tokens with $100k impact ≤ 1% (best of RHEA router and 1Click dry quotes); Not supported if ≤ 1 |
| H4 | RHEA activity is mostly organic | volume share of non-rejected, non-flagged pools over 30d ≥ 80%; Not supported < 60% |
| H5 | Fresh capital is entering now | sampled 30d and 7d net Intents flow > 0 and 30d TVL change > 0; Not supported if both flows < 0; needs ≥ 6,000 sampled events |
| H6 | NEAR Intents recovered from the 2026-10-01 exploit | custody (constant prices) and daily txns ≥ 90% of the 7d pre-incident median on day 30; Not supported if either < 70% |

Verdicts come from a pure engine (`lib/thesis/engine.ts`) over one published daily snapshot (`data/snapshots/YYYY-MM-DD.json`, sha256 inside). A window shorter than 30 days gives "Insufficient data".

The verdict is computed and never written by hand. Evidence against a claim is shown next to evidence for it. The "what would change the verdict" condition is printed with every claim.

## 4. Signals

### 4.1 Integrity layer (applies to everything)
PRIX recomputes every pool's value from reserves × RHEA price. AMM reserves come from the RHEA indexer. DCL reserves are read directly from `dclv2.ref-labs.near.list_pools` over NEAR RPC. A pool is **excluded** when any of these hold:
- `unpriced-side`: a token has no price
- `price-imbalance`: a 50/50 AMM pool whose two sides differ by more than 3×
- `unanchored-pair`: no base asset (NEAR, stablecoins, liquid-staked NEAR, or curated bridged majors) is in the pair
- `exceeds-protocol-tvl`: a single pool claims more than 50% of RHEA's whole TVL

Pools under $1k are ignored as dust. Prices are cross-checked against NEAR Intents 1Click, and gaps over 5% are flagged. In the protocol TVL history, days above 3× the median are dropped and listed.

### 4.2 Liquidity flows
- Liquidity and 24h volume by sector across clean pools. Each pool's volume is split 50/50 between its two sides.
- Per-token buy and sell pressure from the latest 50 swaps in the token's deepest clean pool. The window length is always shown.
- NEAR Intents deposits (MINT) and withdrawals (BURN) by asset and origin chain, from NearBlocks v3 `/intents/txns`.
- Assets held by `intents.near` (FastNEAR balances × RHEA prices).

### 4.3 Whale tracking
- Swaps and liquidity moves of at least $10k. Swaps come from the 16 busiest clean pools and LP events from the 14 deepest.
- Swap size uses the smaller leg, so a mispriced token cannot inflate it.
- The 18 largest swaps and the 20 newest LP moves are traced from receipt to transaction to signer (NearBlocks). Each row links to nearblocks.io.
- Large accounts are aggregated by signer.

### 4.4 Volume intelligence
- Turnover (24h volume ÷ paired TVL). Above 5×/day is flagged, and the activity pillar is capped at 50.
- Round-trip detection: a buy and a sell of the same token within 10 minutes whose sizes are within 2% (each at least $50). Above 30% of sampled volume is flagged and capped.
- Volume spike: the 7-day average is more than 2× the prior 30-day average.

### 4.5 Launch radar
- Candidates come from the 80 highest-id AMM pools and the 120 most recently listed DCL pools, keeping those with at least $1k of clean liquidity. The deepest 16 are scored.
- Score weights: liquidity 35%, distribution 25%, activity 20%, maturity (token account age ÷ 30 days) 20%.
- Each launch shows its creator (the signer of the account-creation transaction), holders (exact below 100, otherwise "100+"), and flags.

### 4.6 PRIX Index (score methodology)
- Universe: non-stablecoin tokens with at least $50k of clean liquidity, top 24 by liquidity.
- Score: the weighted mean of the available pillars, 0–100.

| Pillar | Weight | Input | Formula |
|---|---|---|---|
| Depth | 30% | Impact `i` from a $10k sell into USDC via RHEA Smart Router `findPath` (fees included). Fallback: exact constant-product math on the deepest clean AMM pool | `100·clamp((log10 .10 − log10 i)/(log10 .10 − log10 .003))` |
| Activity | 25% | 24h volume over clean pools | `100·clamp((log10 vol − 3)/5)`, capped at 50 by turnover or round-trip flags |
| Distribution | 20% | Share of float held by the top 10 non-custody accounts (FastNEAR top 100, `ft_total_supply`) | `100·clamp((0.9 − s)/0.7)` |
| Flow | 25% | Pressure `p` from the last 50 swaps, 7-day TVL change, and 7-day vs 30-day volume | `clamp(50 + 25p + 15·clamp(ΔTVL/25%) + 10·clamp(vol ratio − 1))` |

**Confidence** is the sum of the weights that have data. Tokens with confidence below 0.5 are listed but not ranked.

## 5. Data sources (all public, no key required)

| Source | Endpoints | Cache |
|---|---|---|
| RHEA indexer `api.rhea.finance` | `list-top-pools`, `list-token-price`, `list-token`, `get-24h-volume-list`, `pool/detail`, `get-recent-transaction-{swap,dcl-swap,liquidity,dcl-liquidity}`, `get-dcl-pools-{volume,tvl-list}`, `list-history-token-price-by-ids`, `all-pool-data` | 5–60 min (`list-token` is 2.5 MB, so it is memoised in-process) |
| RHEA data service `api.data-service.ref.finance/api` | `historical_tvl`, `24h_volume_variation`, `pool/{id}/{volume,tvl}` | 10–60 min |
| RHEA Smart Router `smartrouter.rhea.finance/findPath` | read-only quotes | 15 min |
| NEAR RPC `free.rpc.fastnear.com` | `dclv2.ref-labs.near.list_pools`, `ft_total_supply` | 10–60 min |
| FastNEAR `api.fastnear.com` | `/v1/ft/{token}/top`, `/v1/account/intents.near/ft` | 15–60 min |
| NearBlocks API **v3** | `txn-stats`, `address-stats`, `price-stats`, `stats`, `search/receipts`, `txns/{hash}`, `accounts/{id}`, `intents/txns` | 10 min – 7 days |
| NEAR Intents 1Click | `/v0/tokens` (independent prices) | 10 min |

These were verified working on 13 Nov 2026. NearBlocks v1/v2 are switched off on 22 Nov 2026, so PRIX uses v3 only. The NEAR Intents Explorer API needs a partner JWT and is **not** used. The RHEA cross-chain quote API needs a key and is **not** used.

## 6. Architecture

- One Next.js 16 App Router app with strict TypeScript and Tailwind v4. Pages are ISR, revalidated every 5–10 minutes. There is no database: history comes from upstream daily series, and snapshots are files.
- `lib/sources/*`: thin, typed clients with timeouts and retry on 429/5xx (honouring Retry-After). They use the Next.js data cache.
- `lib/model/*`: deterministic models (market and integrity, index, flows, whales, launches, network, thesis). The web app and the CLI share them.
- `scripts/snapshot-daily.mts`: `pnpm snapshot:daily` builds `data/snapshots/YYYY-MM-DD.json` (daily GitHub Action). `pnpm verdicts` recomputes verdicts offline; `pnpm verify` refetches, rebuilds and diffs.
- `app/api/v1/*`: public JSON API with CORS `*` and `s-maxage=600`.
- The client-side JavaScript is limited to the chart component (TradingView Lightweight Charts) and navigation state.
- **Why no Postgres/cron in v1:** every metric PRIX shows is available as a live or daily series upstream. A database would only add history for derived signals (index score over time), which is roadmap item R1.

## 7. Pages

| Route | Purpose |
|---|---|
| `/` Overview | KPIs, top of the index, thesis scorecard, network and TVL charts, integrity rejections, Intents net flow |
| `/rankings` PRIX Index | Full ranked table with pillar scores, confidence, inputs and flags |
| `/thesis` | Six claims: verdict, metric vs threshold, margin, grade, window, sample, flip condition, snapshot hashes, history sparkline; H6 before/after panel |
| `/depth` | Depth matrix: 1Click dry quotes and RHEA router at $1k–$1M, with failed/paused/rate-limited quotes shown |
| `/flows` | Sector liquidity, token pressure, Intents deposits and withdrawals, Intents custody |
| `/whales` | Whale swaps, large LP moves, large accounts, all linked to transactions |
| `/launches` | Launch radar with component scores and flags |
| `/token/[contract]` | Evidence row per pillar with sources, pool history chart, top holders, all pools including rejected ones |
| `/methodology` | Every rule, formula, curated label list, API reference, and known limits |

UX principles: a light editorial system (cool paper `#e7ecf3`, one cobalt ink `#2a3fd6`, Instrument Serif display over Host Grotesk text, pill controls, 16–20px cards without hard borders, blur-up appear motion), dense but readable hairline tables, tabular figures in Geist Mono, every number with a source link, "not reported" instead of a guess, explicit sample windows. Tokens live in `app/globals.css`; see README → Design system.

## 8. API

`GET /api/v1/index` · `/api/v1/token/{contract}` · `/api/v1/flows` · `/api/v1/whales` · `/api/v1/launches` · `/api/v1/thesis`. All responses include `asOf` and source URLs. Errors return `503 {error:"upstream_unavailable"}`, and an unknown token returns 404.

## 9. Non-goals

- No wallet connection, signing, swaps, "trade this signal" buttons, custody or private keys.
- No price prediction and no buy/sell recommendations. Scores grade evidence quality, not expected return.
- No language model generates numbers or verdicts.
- No coverage of venues other than RHEA and NEAR Intents in v1.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Free-tier rate limits (NearBlocks 429) | Retry with backoff; long caches for immutable lookups; partial results kept; optional `NEARBLOCKS_API_KEY` |
| Upstream API changes or deprecation | Endpoints in one file and overridable by env; NearBlocks already migrated to v3 |
| Mispriced tokens inflating metrics | The integrity layer, the smaller-leg rule for swaps, the Intents 10× outlier rule, and the 1Click price cross-check |
| Short flow windows misread as trends | Flows are sampled buckets, day-weighted and never extrapolated; H5 needs ≥ 6,000 sampled events over ≥ 30 days |
| Curated labels (sectors, custody) are subjective | Listed in full on /methodology; one file (`lib/model/registry.ts`) |
| Holder data limits (FastNEAR top 100) | Counts above 100 are shown as "100+", and the float share uses on-chain supply |

## 11. Roadmap

- **R1** Postgres (Neon) plus a Vercel cron snapshotting index scores hourly, giving score history and backtests of the scores against forward returns.
- **R2** NEAR Intents Explorer API (partner JWT) for full cross-chain swap volume by chain pair, instead of a minutes-long event sample.
- **R3** NEAR BigQuery public dataset for multi-year active-account cohorts (track prompt suggestion).
- **R4** Webhooks and an MCP endpoint so agents can subscribe to whale, launch and integrity events.
- **R5** More venues on NEAR (Veax, Orderly) and lending health from Burrow/RHEA Lend.

## 12. Hackathon fit and submission checklist

- Track `thesis`: on-chain analytics, live dashboards, a model anyone can re-run (`pnpm verdicts`, `pnpm verify`), and evidence for and against each claim.
- Partner tech used: RHEA (indexer, Smart Router, DCL contract) and NEAR Intents (custody, MINT/BURN flows, 1Click prices).
- Required by the rules and **owned by the human**: make the repo public before **2026-11-14 23:59 UTC**; publish an X demo post tagging @NEARProtocol and #NEARHackathon; submit once at nearhackathon.com with project name, lead, email, team size, tracks, mainnet payout account, repo URL, demo post URL, a description, and consent. Keep the hosted demo up until at least 2026-11-18, ideally 2026-11-25.
