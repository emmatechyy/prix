import type { Metadata } from "next";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { DEPTH_TRADE_USD, UNIVERSE_MAX, UNIVERSE_MIN_LIQUIDITY, WEIGHTS } from "@/lib/model/index-model";
import { LAUNCH_WEIGHTS } from "@/lib/model/launches";
import { WHALE_USD } from "@/lib/model/whales";
import { CUSTODY_ACCOUNTS } from "@/lib/model/registry";

export const metadata: Metadata = { title: "Methodology" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader id={id} title={title} />
      <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-muted break-words [&_code]:break-all [&_code]:num [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-text [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-text">{children}</div>
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
  ["NEAR Intents 1Click", "https://1click.chaindefuser.com/v0/tokens", "Independent price for cross-checking RHEA prices"],
];

export default function Methodology() {
  return (
    <>
      <PageHeader eyebrow="Methodology" title="How every PRIX number is produced">
        PRIX is deterministic: the same upstream data gives the same scores. No language model writes a number or a verdict. Labels below (sectors, custody accounts) are curated by hand and listed in full so they can be challenged.
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="sources" title="1. Data sources">
          <div className="scroll-x -mx-4">
            <table className="data">
              <thead><tr><th>Source</th><th>Used for</th></tr></thead>
              <tbody>
                {SOURCES.map(([n, u, w]) => (
                  <tr key={n}><td className="align-top"><a className="text-info hover:underline" href={u} target="_blank" rel="noreferrer">{n} ↗</a></td><td className="whitespace-normal">{w}</td></tr>
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
            <li><code>GET /api/v1/thesis</code> — hypotheses, rules, evidence, verdicts</li>
          </ul>
          <p>Responses carry <code>asOf</code> and source URLs. Cached for 10 minutes.</p>
        </Section>

        <Section id="limits" title="8. Known limits">
          <ul>
            <li>Swap and Intents flow samples are short windows (minutes to hours); they describe the present, not a trend.</li>
            <li>The RHEA indexer does not expose swap signers; PRIX resolves them for the largest events only.</li>
            <li>Pool TVL change is measured in USD and includes price moves.</li>
            <li>FastNEAR returns the top 100 holders; tokens with more are shown as “100+”.</li>
            <li>Holdings outside RHEA (other DEXs, CEXs) are not covered.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
