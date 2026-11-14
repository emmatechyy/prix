import { DEPTH_TRADE_USD, UNIVERSE_MAX, UNIVERSE_MIN_LIQUIDITY, WEIGHTS } from "@/lib/model/index-model";
import { LAUNCH_WEIGHTS } from "@/lib/model/launches";
import { WHALE_USD } from "@/lib/model/whales";
import { CUSTODY_ACCOUNTS } from "@/lib/model/registry";
import type { loadThresholds } from "@/lib/thresholds/load";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section aria-labelledby={id} className="border-t border-rule pt-5">
      <h3 id={id} className="font-serif text-[21px] text-ink">{title.replace(/^\d+\.\s*/, "")}</h3>
      <div className="measure mt-2 space-y-3 text-[15px] leading-[1.65] text-slate break-words [&_code]:break-all [&_code]:rounded [&_code]:bg-wash [&_code]:px-1 [&_code]:text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export const SOURCES: [string, string, string][] = [
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

/** Definitions behind the index and the signals (integrity rules, score, heuristics, launch score, labels). */
export function MethodDefinitions({ th }: { th: ReturnType<typeof loadThresholds> }) {
  return (
    <div className="grid gap-6">
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
            <li><strong>Intents flows</strong> — intents.near token events from NearBlocks, paged newest-first with a stored cursor: each run pages back from now to the newest instant already read, and unread stretches are kept as gaps that later runs resume. MINT = deposit, BURN = withdrawal, valued at the price recorded on each event. <strong>Coverage</strong> = hours of the window actually read ÷ hours in the window; H5 needs ≥ {(th.t.claims.H5.min_coverage * 100).toFixed(0)}% of both the 7d and 30d windows before it gives any verdict. Nothing is scaled up to cover what was not read.</li>
            <li><strong>H4 volume from verified pools</strong> — numerator: 30-day volume of pools that are not rejected and not wash-flagged; denominator: 30-day volume of <em>every</em> live pool (≥ $1k TVL), rejected and flagged included. Wash flags: mean daily volume above {th.t.claims.H4.wash_flags.max_daily_turnover}× the pool&apos;s TVL, or ≥ {(th.t.claims.H4.wash_flags.concentration_min_share * 100).toFixed(0)}% of all volume while more than {th.t.claims.H4.wash_flags.concentration_tvl_multiple}× its share of clean TVL. These are signals, not proof: concentrated-liquidity pools turn over their TVL faster by design.</li>
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

    </div>
  );
}
