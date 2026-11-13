# SDK & API notes (verified 2026-11-13 from the installed `.d.ts` files and live calls)

PRIX is read-only. Every function below is used only to **read** prices, routes or quotes. Nothing
signs or deposits, and no `execute*`, `swap*`, `build*`, `submit*`, relayer or MCA function is imported.

## `@rhea-finance/cross-chain-sdk` 0.1.22

| Export | Signature (from `dist/index.d.ts`) | Used? |
|---|---|---|
| `findPath` | `findPath({ amountIn, tokenIn, tokenOut, slippage })` → GET `smartrouter.rhea.finance/findPath` | The **same endpoint** is called directly by `lib/sources/rhea.ts → findPath` (`pathDeep=3, slippage=0.005`). This is the RHEA Smart Router **V1** in `lib/depth/rhea-router.ts`. |
| `intentsQuotation` | `({ originAsset, destinationAsset, amount, refundTo, recipient, customRecipientMsg?, isReverse?, dry?, slippageTolerance?, authorization? })` → `IIntentsQuoteResult { quoteStatus: "success" \| "error", quoteSuccessResult?, message?, quoteFeeData? }` | Not used. It proxies through `api.rhea.finance/api/1click/quote` and adds RHEA's own fee. PRIX calls the documented 1Click API directly instead, so a third party is not between PRIX and the quote. |
| `getAssets`, `getPrices`, `batchViews`, `config_near` | lending (Burrow) views | Reserved for the P1 Fundamentals block (`lib/rhea/lending.ts`, not built yet). |

## `@rhea-finance/cross-chain-aggregation-dex` 2.1.9

* The spec named the `NearSmartRouter` and `AggregateDexRouter` classes. **They do not exist in 2.1.9.** The only router entry point is
  `new SwapClient({ baseUrl: "https://api.rhea.finance", apiKey?, reportMode })` with
  `quoteRaw(SwapQuoteRequestRaw)` / `quote(QuoteRequest)`.
* A live call without a key fails with `Authorization header is required (format: Bearer <jwt>)`.
  The JWT comes from the RHEA Boss portal: https://boss.rhea.finance.
* PRIX reads `RHEA_AGGREGATOR_API_KEY` (server-side only). Without it, the snapshot records
  `depth_meta.aggregator_auth = "not-configured"` and the /depth page says so. **The V2 call is not
  wired yet**, because its response shape could not be verified without a key. This is a human decision (see the report).

## NEAR Intents 1Click API (`https://1click.chaindefuser.com`)

From the public OpenAPI (`/docs/v0/openapi.yaml`) and live calls on 2026-11-13:

* `POST /v0/quote`. Required fields: `dry, swapType, slippageTolerance (bps), originAsset, depositType,
  destinationAsset, amount (base units), refundTo, refundType, recipient, recipientType, deadline`.
* `dry: true` returns a quote with **no `depositAddress`**, no `deadline` and no `timeWhenInactive`. Nothing can be sent.
  PRIX uses `depositType/refundType/recipientType = INTENTS` and the placeholder account `prix-readonly.near`.
* **No key needed for dry quotes.** HTTP 201 in about 0.5 s. Without a key the API adds an app fee of
  **20 bps** (`quoteRequest.appFees`). That fee is the same at every size, so it cancels out of relative slippage; PRIX records it in `fee_usd`.
* Auth (optional, server-side env only): `ONECLICK_API_KEY` → `X-API-Key` header (recommended), or
  `ONECLICK_JWT` → `Authorization: Bearer`. Keys come from https://partners.near-intents.org/.
* Rate limit headers when unauthenticated: `x-ratelimit-limit-unauth: 1200` per 60 s. PRIX makes at most 96 quotes per run, with concurrency 3.
* Errors return HTTP 400 `{ message, correlationId, timestamp, path }`. Seen so far: `"No liquidity available"` (→ `no-route`) and
  `"tokenOut is not valid"` (→ `no-route`). 401 means an invalid key (→ `not-configured`); 429 → `rate-limited`;
  a message containing "paused" or "halt" → `paused`. See `lib/depth/slippage.ts → statusFromError`.
* `GET /v0/tokens`: 231 assets with USD prices, used to size the BTC/ETH/SOL legs.

## NearBlocks v3 (`https://api.nearblocks.io`)

* `/v3/accounts/intents.near/stats/txns?limit=365`: daily intents.near txns (H6).
* `/v3/intents/txns?limit=100&before_ts=<ns>`: a page of intents.near token events before a timestamp (H5 flow sampling).
  100 events cover about 8 s of activity. Free tier, so sampling is paced (1.2 s gap, backoff on 429).
* `NEARBLOCKS_API_KEY` is optional (server-side, Bearer).

## NEAR archival RPC

* `https://archival-rpc.mainnet.fastnear.com` (override with `NEAR_ARCHIVAL_RPC_URL`): `block` by height and
  `query/call_function ft_balance_of` at a historical `block_id`. Used for the H6 custody quantity index.
  A token contract that did not exist yet returns `UNKNOWN_ACCOUNT`; PRIX stores that as `"absent"` and leaves that asset out of the series.

## H6 incident: sources

* CoinDesk, 2026-10-01: https://www.coindesk.com/tech/2026/10/01/near-intents-hit-by-usd3-8-million-exploit-as-crypto-s-rough-year-of-hacks-continues
* The Block, 2026-10-01: https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-promises-full-compensation-417404
* Reported postmortem timeline: exploit window from 2026-09-29 16:14 UTC to 2026-10-01 05:54 UTC; services paused 2026-10-01 08:33 UTC and resumed later that day;
  fix deployed 2026-10-02; funds reported fully recovered on 2026-10-03 (Cointelegraph).
* The yaml's `incident_date: 2026-10-01` matches the public reporting date. The exploit itself began on 09-29, so the
  7-day baseline (09-24 to 09-30) includes about 1.3 days of the exploit window. This is a human decision: shift the baseline to 09-22 to 09-28?
