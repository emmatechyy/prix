import "server-only";
import { memo } from "../memo";
import { getIndex } from "./index-model";
import { getIntentsCustody, getIntentsFlows, getNetwork, getProtocolHistory } from "./network";
import { MIN_POOL_TVL } from "./market";

export type Verdict = "Supported" | "Not supported" | "Mixed" | "Insufficient data";
export type Evidence = { label: string; value: string; dir: "for" | "against" | "neutral"; source?: string };
export type Hypothesis = { id: string; claim: string; why: string; verdict: Verdict; rule: string; evidence: Evidence[]; changeMind: string };

const p = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "not reported" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);
const u = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`);

async function settle<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

/** Five testable claims about NEAR, each scored by an explicit rule against live data. */
export const getThesis = memo(async () => {
  const [net, idx, custody, flows, proto] = await Promise.all([settle(getNetwork), settle(getIndex), settle(getIntentsCustody), settle(getIntentsFlows), settle(getProtocolHistory)]);
  const hs: Hypothesis[] = [];

  // H1 — usage vs price
  if (net) {
    const a = net.d30.active.change;
    const t = net.d30.txns.change;
    const c = net.corrActivePrice180;
    const y = net.yoy.active;
    const verdict: Verdict =
      a == null || c == null ? "Insufficient data" : a <= -0.1 ? "Not supported" : Math.abs(c) >= 0.3 ? "Mixed" : y != null && y < -0.5 ? "Mixed" : "Supported";
    hs.push({
      id: "H1",
      claim: "NEAR network usage holds up independently of the NEAR price.",
      why: "If usage is driven by applications rather than speculation, it should not move in lock-step with price and should not collapse when price falls.",
      verdict,
      rule: "Supported if 30-day average daily active accounts fell less than 10% vs the prior 30 days, the 180-day correlation of daily % changes (active accounts vs price) is below 0.3 in absolute value, AND active accounts are not down more than 50% year on year. Not supported if the 30-day drop exceeds 10%; otherwise Mixed.",
      evidence: [
        { label: "Daily active accounts, 30d avg vs prior 30d", value: p(a), dir: a != null && a > -0.1 ? "for" : "against", source: net.sources[1] },
        { label: "Daily transactions, 30d avg vs prior 30d", value: p(t), dir: t != null && t > -0.1 ? "for" : "against", source: net.sources[0] },
        { label: "NEAR price, 30d avg vs prior 30d", value: p(net.d30.price.change), dir: "neutral", source: net.sources[2] },
        { label: "Correlation of daily changes, active accounts vs price (180d)", value: c == null ? "not reported" : c.toFixed(2), dir: c != null && Math.abs(c) < 0.3 ? "for" : "against" },
        { label: "Daily active accounts, last 30d vs same window 1 year earlier", value: p(net.yoy.active), dir: net.yoy.active != null && net.yoy.active > 0 ? "for" : "against" },
        { label: "Daily transactions, last 30d vs 1 year earlier", value: p(net.yoy.txns), dir: net.yoy.txns != null && net.yoy.txns > 0 ? "for" : "against" },
      ],
      changeMind: "Active accounts dropping more than 10% month-on-month, or the correlation with price rising above 0.3, would mean usage is following price rather than leading it.",
    });
  }

  // H2 — NEAR Intents as liquidity hub
  if (custody && idx) {
    const dexTvl = idx.market.pools.filter((x) => x.clean && x.tvl >= MIN_POOL_TVL).reduce((a, x) => a + x.tvl, 0);
    const ratio = dexTvl > 0 ? custody.total / dexTvl : null;
    const nearRow = custody.rows.find((r) => r.id === "wrap.near");
    hs.push({
      id: "H2",
      claim: "NEAR Intents, not the on-chain AMM, is where NEAR's capital now sits.",
      why: "Chain abstraction is NEAR's core bet. If it is working, assets parked in the Intents contract should exceed what sits in DEX pools.",
      verdict: ratio == null ? "Insufficient data" : ratio >= 1 ? "Supported" : ratio >= 0.5 ? "Mixed" : "Not supported",
      rule: "Supported if the USD value held by intents.near is at least 1× the clean TVL of all RHEA pools; Mixed between 0.5× and 1×.",
      evidence: [
        { label: "Assets held by intents.near (priced tokens)", value: u(custody.total), dir: "neutral", source: custody.source },
        { label: "RHEA clean pool TVL (PRIX-computed)", value: u(dexTvl), dir: "neutral" },
        { label: "Intents custody ÷ DEX TVL", value: ratio == null ? "not reported" : `${ratio.toFixed(2)}×`, dir: ratio != null && ratio >= 1 ? "for" : "against" },
        { label: "wNEAR held by intents.near", value: nearRow ? u(nearRow.usd) : "not reported", dir: "neutral" },
        { label: "Tokens held by intents.near without a RHEA price (excluded)", value: String(custody.unpriced), dir: "neutral" },
      ],
      changeMind: "Intents custody falling below half of DEX TVL would say capital still prefers classic AMM liquidity.",
    });
  }

  // H3 — depth
  if (idx) {
    const ranked = idx.rows.filter((r) => r.depth.impact != null);
    const deep = ranked.filter((r) => r.depth.impact! < 0.01);
    const share = ranked.length ? deep.length / ranked.length : null;
    const med = ranked.length ? [...ranked.map((r) => r.depth.impact!)].sort((a, b) => a - b)[Math.floor(ranked.length / 2)] : null;
    hs.push({
      id: "H3",
      claim: "NEAR's on-chain markets can absorb institutional-size orders beyond NEAR itself.",
      why: "A fund needs to enter and exit without moving price. A $10k sell is a deliberately small test.",
      verdict: share == null ? "Insufficient data" : share >= 0.5 ? "Supported" : share >= 0.25 ? "Mixed" : "Not supported",
      rule: "Supported if at least half of the index universe can sell $10k into USDC with under 1% price impact (fees included).",
      evidence: [
        { label: "Tokens with a measurable $10k quote", value: String(ranked.length), dir: "neutral" },
        { label: "Of which under 1% impact", value: `${deep.length} (${deep.map((r) => r.symbol).join(", ") || "none"})`, dir: share != null && share >= 0.5 ? "for" : "against" },
        { label: "Median impact for $10k", value: med == null ? "not reported" : `${(med * 100).toFixed(2)}%`, dir: med != null && med < 0.01 ? "for" : "against" },
        { label: "Tokens the RHEA Smart Router could not route", value: String(idx.rows.filter((r) => r.flags.some((f) => f.startsWith("not routable"))).length), dir: "against" },
      ],
      changeMind: "More than half of the universe quoting under 1% impact for $10k would flip this to Supported.",
    });
  }

  // H4 — organic activity
  if (idx) {
    const m = idx.market;
    const flagged = idx.rows.filter((r) => r.flags.some((f) => f.startsWith("round-trip") || f.startsWith("abnormal turnover")));
    const share = idx.rows.length ? flagged.length / idx.rows.length : null;
    const cleanTvl = m.pools.filter((x) => x.clean && x.tvl >= MIN_POOL_TVL).reduce((a, x) => a + x.tvl, 0);
    hs.push({
      id: "H4",
      claim: "Trading activity on RHEA is mostly organic.",
      why: "Volume is only evidence of demand if it is not manufactured. PRIX tests the sampled flow for wash-like patterns and the pool set for mispriced liquidity.",
      verdict: share == null ? "Insufficient data" : share < 0.2 ? "Supported" : share < 0.4 ? "Mixed" : "Not supported",
      rule: "Supported if fewer than 20% of index tokens trip the round-trip or abnormal-turnover checks.",
      evidence: [
        { label: "Index tokens flagged for wash-like patterns", value: `${flagged.length} of ${idx.rows.length}${flagged.length ? ` (${flagged.map((r) => r.symbol).join(", ")})` : ""}`, dir: share != null && share < 0.2 ? "for" : "against" },
        { label: "Pools rejected by integrity rules (≥$1k)", value: String(m.rejected.pools), dir: "neutral" },
        { label: "Liquidity claimed by rejected pools", value: u(m.rejected.tvl), dir: "against" },
        { label: "Clean liquidity kept", value: u(cleanTvl), dir: "for" },
      ],
      changeMind: "Two in five index tokens showing round-trip or abnormal-turnover patterns would mean reported volume overstates demand.",
    });
  }

  // H5 — capital direction
  if (flows || proto) {
    const net = flows ? flows.inUsd - flows.outUsd : null;
    const pts = proto?.points ?? [];
    const tvl30 = pts.length > 31 ? pts[pts.length - 1].amm / pts[pts.length - 31].amm - 1 : null;
    // A flow sample shorter than 30 minutes is shown but does not vote.
    const flowVotes = net != null && flows?.windowMs != null && flows.windowMs >= 30 * 60_000;
    const votes = [flowVotes ? Math.sign(net!) : null, tvl30 == null ? null : Math.sign(tvl30)].filter((v): v is number => v != null);
    const allUp = votes.length > 0 && votes.every((v) => v > 0);
    const allDown = votes.length > 0 && votes.every((v) => v < 0);
    hs.push({
      id: "H5",
      claim: "Fresh capital is entering NEAR's markets right now.",
      why: "A thesis needs flows behind it. PRIX combines very recent Intents deposits/withdrawals with the 30-day trend in RHEA TVL.",
      verdict: votes.length === 0 ? "Insufficient data" : allUp ? "Supported" : allDown ? "Not supported" : "Mixed",
      rule: "Two signals: net deposits into NEAR Intents over the sampled window (votes only if the window is at least 30 minutes) and the 30-day change in RHEA AMM TVL (outlier days excluded). Supported if every voting signal is positive, Not supported if every one is negative, otherwise Mixed.",
      evidence: [
        { label: `Intents net deposits, last ${flows?.events ?? 0} events`, value: net == null ? "not reported" : `${net >= 0 ? "+" : "−"}${u(Math.abs(net))}`, dir: net != null && net > 0 ? "for" : "against", source: flows?.source },
        { label: "Sample window (votes only if ≥ 30 min)", value: flows?.windowMs != null ? `${Math.max(1, Math.round(flows.windowMs / 60000))} min${flowVotes ? "" : " — too short to vote"}` : "not reported", dir: "neutral" },
        { label: "RHEA AMM TVL, 30d change", value: p(tvl30), dir: tvl30 != null && tvl30 > 0 ? "for" : "against", source: proto?.source },
        { label: "Outlier days excluded from TVL history", value: proto ? (proto.excluded.map((e) => e.date).join(", ") || "none") : "not reported", dir: "neutral" },
      ],
      changeMind: "Both signals turning negative — net Intents withdrawals and a falling 30-day TVL — would mean capital is leaving.",
    });
  }

  return { asOf: new Date().toISOString(), hypotheses: hs };
});
