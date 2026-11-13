import type { Metadata } from "next";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { DEPTH_TRADE_USD, UNIVERSE_MAX, UNIVERSE_MIN_LIQUIDITY, WEIGHTS } from "@/lib/model/index-model";
import { LAUNCH_WEIGHTS } from "@/lib/model/launches";
import { WHALE_USD } from "@/lib/model/whales";
import { CUSTODY_ACCOUNTS } from "@/lib/model/registry";
import { getPublished } from "@/lib/server/published";
import { ThresholdsBadge } from "@/components/snapshot-ui";

export const metadata: Metadata = { title: "Methodology" };

function Section({ id, title, children, wide }: { id: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Card className={wide ? "xl:col-span-2" : ""}>
      <CardHeader id={id} title={title} />
      <div className="space-y-3 px-5 pb-6 text-[15px] leading-[1.65] text-muted sm:px-6 break-words [&_code]:break-all [&_code]:num [&_code]:rounded-md [&_code]:bg-tint [&_code]:px-1 [&_code]:text-text [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-text">{children}</div>
    </Card>
  );
}

const SOURCES: [string, string, string][] = [
  ["RHEA indexer", "https://api.rhea.finance", "AMM pools & reserves (list-top-pools), token prices & metadata, 24h volume per DCL pool, pool detail, recent swaps & liquidity events, protocol totals"],
  ["RHEA data service", "https://api.data-service.ref.finance/api", "Daily protocol TVL (AMM + lending), daily per-pool TVL & volume, 24h volume variation"],
  ["RHEA Smart Router", "https://smartrouter.rhea.finance/findPath", "Read-only route quotes used to measure price impact. Nothing is executed."],
  ["NEAR RPC (FastNEAR free)", "https://free.rpc.fastnear.com", "dclv2.ref-labs.near list_pools (DCL reserves), ft_total_supply per token"],
  ["FastNEAR API", "https://api.fastnear.com", "Top 100 holders per token; token balances of intents.near"],
  ["NearBlocks API v3", "https://api.nearblocks.io/v3", "Daily txns/active accounts/price; receipt → transaction → signer; account creation; NEAR Intents MINT/BURN events"],
  ["NEAR Intents 1Click", "https://1click.chaindefuser.com/v0/tokens", "Independent price for cross-checking RHEA prices; sizing of the BTC/ETH/SOL quote legs"],
  ["NEAR Intents 1Click quotes", "https://1click.chaindefuser.com/docs/v0/openapi.yaml", "POST /v0/quote with dry:true for the depth matrix. Dry quotes carry no deposit address; nothing is ever sent."],
  ["NEAR archival RPC (FastNEAR)", "https://archival-rpc.mainnet.fastnear.com", "ft_balance_of(intents.near) at the first block of each UTC day since 2026-09-19 (H6 custody quantity index)"],
  ["NearBlocks intents.near stats", "https://api.nearblocks.io/v3/accounts/intents.near/stats/txns", "Daily intents.near transactions (H6)"],
  ["Incident reporting", "https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-promises-full-compensation-417404", "The 2026-10-01 NEAR Intents exploit date (also CoinDesk, 2026-10-01)"],
];

export default function Methodology() {
  const { thresholds: th, snapshot } = getPublished();
  return (
    <>
      <PageHeader eyebrow="Methodology" title="How every PRIX number is produced">
        PRIX is deterministic: the same upstream data gives the same scores. No language model writes a number or a verdict. Labels below (sectors, custody accounts) are curated by hand and listed in full so they can be challenged.
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section id="thresholds" title="0. Pre-registered thresholds" wide>
          <p className="flex flex-wrap items-center gap-2">
            <ThresholdsBadge version={th.t.version} locked={th.locked} />
            <span>
              File <a className="underline underline-offset-4 hover:text-text" href="https://github.com/emmatechyy/prix/blob/integration/thresholds/v1.yaml" target="_blank" rel="noreferrer"><code>thresholds/v1.yaml</code></a> · sha256 <code>{th.sha256.slice(0, 16)}…</code> · lock commit:{" "}
              {th.locked ? <code>{th.t.locked_at_commit}</code> : <strong>not set (DRAFT)</strong>}
            </span>
          </p>
          <p>
            Every verdict threshold lives in one YAML file that is validated with zod at build time; the build fails if it does not parse. Once a human sets <code>locked_at_commit</code> to the commit that introduced it, any change becomes <code>v2.yaml</code> and old and new verdicts are shown side by side. Until then every verdict on this site is labelled <strong>DRAFT, not locked</strong>. Differences from PRIX&apos;s earlier rules are listed in <a className="underline underline-offset-4 hover:text-text" href="https://github.com/emmatechyy/prix/blob/integration/docs/threshold-diff.md" target="_blank" rel="noreferrer">docs/threshold-diff.md</a>.
          </p>
          <div className="scroll-x -mx-5 sm:-mx-6">
            <table className="data">
              <thead><tr><th>Claim</th><th>Metric</th><th>Supported</th><th>Not supported</th><th>Grade</th></tr></thead>
              <tbody>
                {Object.entries(th.t.claims).map(([id, c]) => (
                  <tr key={id}>
                    <td className="num text-ink">{id}</td>
                    <td className="min-w-[260px] whitespace-normal">{c.metric.replace(/\s+/g, " ")}</td>
                    <td className="min-w-[180px] whitespace-normal"><code>{c.supported}</code></td>
                    <td className="min-w-[160px] whitespace-normal"><code>{c.not_supported}</code></td>
                    <td>{c.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Global: no verdict from a window under <strong>{th.t.global.min_window_days} days</strong> (H3 depth is point-in-time and exempt; see the diff) and Intents-flow claims need at least <strong>{th.t.global.min_intents_events.toLocaleString("en-US")} sampled events</strong>, otherwise “Insufficient data”. Index universe: clean liquidity ≥ ${th.t.index_rules.min_liquidity_usd.toLocaleString("en-US")} and best measured $10k impact ≤ {(th.t.index_rules.max_price_impact_10k * 100).toFixed(0)}%; tokens failing either are shown with a low-confidence badge and excluded from the top-ranked view.
          </p>
          <p>
            <strong>Evidence grades.</strong> A = {th.t.global.evidence_grades.A}; B = {th.t.global.evidence_grades.B}; C = {th.t.global.evidence_grades.C}. H3 drops to C when a passing token&apos;s depth comes only from AMM reserve math.
          </p>
          <p>
            <strong>Snapshots.</strong> A GitHub Action builds <code>data/snapshots/YYYY-MM-DD.json</code> once a day and commits it; its <code>sha256</code> is the hash of the canonical JSON (sorted keys) of everything else in the file. Every API response carries it as <code>source_hash</code>. Latest: {snapshot ? <a className="underline underline-offset-4 hover:text-text" href={`/api/v1/snapshots/${snapshot.date}`}><code>{snapshot.date}</code> · <code>{snapshot.sha256.slice(0, 16)}…</code></a> : "none"}. Re-run: <code>pnpm verdicts</code> (offline) and <code>pnpm verify</code> (refetch and diff).
          </p>
        </Section>

        <Section id="neutrality" title="Neutrality note" wide>
          <p>
            <strong>RHEA is both a source and a subject.</strong> RHEA&apos;s indexer, data service and Smart Router supply most of PRIX&apos;s pool, price and depth data, and RHEA&apos;s own token is ranked in the index and its markets are judged in H3 and H4. PRIX does not take RHEA&apos;s totals on trust: pool values are recomputed from reserves, pools that fail the integrity rules are excluded (and the excluded amount is published), RHEA prices are cross-checked against NEAR Intents 1Click, and depth is measured on two independent routes (RHEA router and 1Click quotes) with the better one used. PRIX has no commercial relationship with RHEA or NEAR Intents; the build is for the NEAR Hackathon 2026 Investment Thesis track.
          </p>
        </Section>

        <Section id="sources" title="1. Data sources" wide>
          <div className="scroll-x -mx-5 sm:-mx-6">
            <table className="data">
              <thead><tr><th>Source</th><th>Used for</th></tr></thead>
              <tbody>
                {SOURCES.map(([n, u, w]) => (
                  <tr key={n}><td className="align-top"><a className="text-accent hover:underline" href={u} target="_blank" rel="noreferrer">{n} ↗</a></td><td className="whitespace-normal">{w}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>All sources are public and read without keys. An optional <code>NEARBLOCKS_API_KEY</code> raises NearBlocks rate limits. Responses are cached 5 min – 6 h (immutable lookups such as receipt → transaction for 7 days).</p>
        </Section>

        <Section id="integrity" title="2. Integrity rules — what PRIX refuses to count">
          <p>PRIX recomputes every pool&apos;s value as <code>Σ reserve × RHEA price</code> from on-chain reserves (AMM reserves from the RHEA indexer, DCL reserves read directly from <code>dclv2.ref-labs.near</code>). A pool is excluded from every metric if any rule trips:</p>
          <ul>
            <li><strong>unpriced-side</strong> — one token has no RHEA price.</li>
            <li><strong>price-imbalance</strong> — a constant-product (50/50) pool whose two sides differ by more than 3×. Equal value is an invariant of these pools, so a gap means one price is wrong.</li>
            <li><strong>unanchored-pair</strong> — neither side is a base asset (NEAR, stablecoins, liquid-staked NEAR, curated bridged majors). Two thinly traded tokens can price each other at any level.</li>
            <li><strong>exceeds-protocol-tvl</strong> — a single pool claims more than 50% of RHEA&apos;s whole reported TVL.</li>
            <li><strong>dust</strong> — pools under $1,000 are ignored (not rejected).</li>
          </ul>
          <p>Prices are cross-checked against NEAR Intents 1Click; gaps above 5% are flagged. Protocol TVL history drops days above 3× the 90-day median. Intents custody drops any asset worth more than 10× the next one.</p>
        </Section>

        <Section id="index" title="3. PRIX Index score">
          <p>Universe: non-stablecoin tokens with ≥ ${UNIVERSE_MIN_LIQUIDITY.toLocaleString()} of verified liquidity, top {UNIVERSE_MAX} by liquidity. Score = weighted mean of available pillars (0–100):</p>
          <ul>
            <li><strong>Depth ({WEIGHTS.depth * 100}%)</strong> — impact <code>i</code> = 1 − USDC out ÷ ${DEPTH_TRADE_USD.toLocaleString()} for a ${DEPTH_TRADE_USD.toLocaleString()} sell quoted by the RHEA Smart Router (fees included). <code>score = 100 × clamp((log10 0.10 − log10 i) ÷ (log10 0.10 − log10 0.003))</code>: ≤0.3% → 100, ≥10% → 0. If the router has no route, PRIX uses exact constant-product math on the deepest verified AMM pool: <code>i = 1 − (1 − fee) × X ÷ (X + 10,000)</code> with X the token-side reserve in USD. DCL-only tokens without a route: not reported.</li>
            <li><strong>Activity ({WEIGHTS.activity * 100}%)</strong> — 24h USD volume across the token&apos;s verified pools. <code>score = 100 × clamp((log10 vol − 3) ÷ 5)</code>: $1k → 0, $100M → 100. Capped at 50 if turnover (volume ÷ paired TVL) exceeds 5×/day or if round trips exceed 30% of sampled volume.</li>
            <li><strong>Distribution ({WEIGHTS.distribution * 100}%)</strong> — share of float (supply minus custody contracts) held by the 10 largest non-custody accounts among the top 100 (FastNEAR), with supply from <code>ft_total_supply</code>. <code>score = 100 × clamp((0.9 − s) ÷ 0.7)</code>: ≤20% → 100, ≥90% → 0.</li>
            <li><strong>Flow ({WEIGHTS.flow * 100}%)</strong> — <code>50 + 25·p + 15·clamp(ΔTVL7d ÷ 25%) + 10·clamp(vol7d ÷ vol30d − 1)</code>, where <code>p</code> = (bought − sold) ÷ (bought + sold) in the last 50 swaps of the token&apos;s deepest verified pool.</li>
          </ul>
          <p><strong>Confidence</strong> = sum of weights with data. Tokens below 50% are listed but not ranked.</p>
        </Section>

        <Section id="signals" title="4. Signals and heuristics">
          <ul>
            <li><strong>Round trip</strong> — a buy and a sell of the same token within 10 minutes whose USD sizes are within 2% (each ≥ $50). It is a pattern, not proof of wash trading.</li>
            <li><strong>Volume spike</strong> — 7-day average daily volume more than 2× the prior 30-day average.</li>
            <li><strong>Whale</strong> — any swap or liquidity move ≥ ${WHALE_USD.toLocaleString()}, sampled from the latest 50 swaps in the 16 busiest verified pools and the latest liquidity events in the 14 deepest. Swap size uses the smaller leg. The 18 largest swaps and 20 newest LP moves are traced receipt → transaction → signer.</li>
            <li><strong>Intents flows</strong> — the latest intents.near token events from NearBlocks: MINT = deposit, BURN = withdrawal, valued at the price recorded on each event. The window is stated wherever it is shown.</li>
          </ul>
        </Section>

        <Section id="launch" title="5. Launch radar score">
          <p>Candidates: the non-base token of the 80 highest-id AMM pools and the 120 most recently listed DCL pools with ≥ $1k verified liquidity; the deepest 16 are scored.</p>
          <ul>
            <li>Liquidity ({LAUNCH_WEIGHTS.liquidity * 100}%): <code>100 × clamp((log10 TVL − 3) ÷ 3)</code> — $1k → 0, $1M → 100.</li>
            <li>Distribution ({LAUNCH_WEIGHTS.distribution * 100}%): as in the index.</li>
            <li>Activity ({LAUNCH_WEIGHTS.activity * 100}%): <code>100 × clamp((log10 vol24h − 2) ÷ 4)</code>.</li>
            <li>Maturity ({LAUNCH_WEIGHTS.maturity * 100}%): token account age ÷ 30 days, capped at 100.</li>
          </ul>
        </Section>

        <Section id="labels" title="6. Curated labels">
          <p><strong>Custody accounts</strong> (excluded from holder concentration): {[...CUSTODY_ACCOUNTS].join(", ")}, plus account names matching pool/vault/launchpad/bridge/lockup/farm/staking.</p>
          <p><strong>Sectors</strong>: curated for well-known contracts; otherwise by suffix — <code>.omft.near</code> → Omni-bridged; launchpad factories (meme-launchpad, justhoot, nearlytrade, tkn.near, meme-cooking, batgirlfun) → Launchpad / meme; <code>.factory.bridge.near</code> → Bridged; anything else → Unclassified.</p>
        </Section>

        <Section id="api" title="7. Public JSON API">
          <ul>
            <li><code>GET /api/v1/index</code> — ranked index with every pillar input</li>
            <li><code>GET /api/v1/token/&lt;contract&gt;</code> — one token&apos;s evidence row and pools</li>
            <li><code>GET /api/v1/flows</code> — sector liquidity, token pressure, Intents flows & custody</li>
            <li><code>GET /api/v1/whales</code> — whale swaps, LP moves, accounts</li>
            <li><code>GET /api/v1/launches</code> — launch radar</li>
            <li><code>GET /api/v1/thesis</code> — verdicts H1–H6 from the latest snapshot</li>
            <li><code>GET /api/v1/depth?token=&amp;size=</code> — depth matrix rows</li>
            <li><code>GET /api/v1/integrity</code> — TVL with and without rejected pools</li>
            <li><code>GET /api/v1/history?claim=H1</code> — one claim across all snapshots</li>
            <li><code>GET /api/v1/snapshots/&lt;date&gt;</code> — a published snapshot file</li>
            <li><code>GET /api/v1/openapi.json</code> — OpenAPI 3.1 description · <code>/feed.xml</code> — Atom feed of verdict changes</li>
          </ul>
          <p>Snapshot-backed responses use the envelope <code>{"{as_of, methodology_version, thresholds_version, source_hash, data}"}</code>; <code>source_hash</code> equals the snapshot file&apos;s <code>sha256</code>. The live legacy endpoints keep their fields. CORS is open; responses are cached for 10 minutes.</p>
        </Section>

        <Section id="limits" title="8. Known limits">
          <ul>
            <li>Swap and Intents flow samples are short windows (minutes to hours); they describe the present, not a trend.</li>
            <li>The RHEA indexer does not expose swap signers; PRIX resolves them for the largest events only.</li>
            <li>Pool TVL change is measured in USD and includes price moves.</li>
            <li>FastNEAR returns the top 100 holders; tokens with more are shown as “100+”.</li>
            <li>Holdings outside RHEA (other DEXs, CEXs) are not covered.</li>
            <li>H2 needs 30 daily snapshots: there is no honest backfill of clean (integrity-filtered) RHEA TVL, so H2 reads “Insufficient data” until the window fills.</li>
            <li>H5 net flow is a sample (one page of up to 100 events per slot), day-weighted and never extrapolated; it gives a direction, not a total.</li>
            <li>H6 custody is a quantity index at today&apos;s prices for the largest assets that existed throughout the window; tokens launched after the incident are left out rather than counted as recovery.</li>
            <li>The RHEA aggregator V2 route needs a key from boss.rhea.finance and is reported as not configured; V1 router quotes and AMM math are used instead.</li>
            <li>1Click quotes without a partner key include a 20 bps app fee, identical at every size, so it cancels out of relative slippage.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
