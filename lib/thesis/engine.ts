/**
 * PRIX verdict engine. Pure and deterministic: (snapshot, rules) → verdicts. No network, no clock
 * (the "now" is the snapshot's as_of). Every threshold comes from thresholds/v1.yaml via compileRules.
 */
import type { Snapshot } from "../snapshot/schema";
import type { Rules } from "../thresholds/rules";
import type { Thresholds, ClaimId } from "../thresholds/schema";
import { addDays, mean, median, movingAverage, spearman } from "./stats";

export type VerdictValue = "Supported" | "Mixed" | "Not supported" | "Insufficient data";
export type Evidence = { label: string; value: string; dir: "for" | "against" | "neutral"; source?: string };
export type Verdict = {
  id: ClaimId;
  claim: string;
  metric: string;
  verdict: VerdictValue;
  metric_value: number | null;
  metric_label: string;
  threshold_supported: string;
  threshold_not_supported: string;
  margin_to_next: string;
  flip_condition: string;
  evidence_grade: "A" | "B" | "C";
  window: { from: string; to: string; days: number };
  sample_size: number;
  snapshot_hashes: string[];
  insufficient_reason?: string;
  evidence: Evidence[];
};

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "not reported" : `${(x * 100).toFixed(d)}%`);
const signedPct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "not reported" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const usd = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x)) return "not reported";
  const a = Math.abs(x);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0);
  return `${x < 0 ? "−" : ""}$${s}`;
};
const fx = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "not reported" : x.toFixed(d));
const day = (iso: string) => iso.slice(0, 10);

type Ctx = { s: Snapshot; r: Rules; t: Thresholds };
type Partial = Omit<Verdict, "id" | "claim" | "metric" | "threshold_supported" | "threshold_not_supported" | "evidence_grade" | "snapshot_hashes"> & { evidence_grade?: Verdict["evidence_grade"]; snapshot_hashes?: string[] };

function insufficient(reason: string, base: Omit<Partial, "verdict" | "margin_to_next" | "insufficient_reason">): Partial {
  return { ...base, verdict: "Insufficient data", margin_to_next: reason, insufficient_reason: reason };
}

function H1({ s, r }: Ctx): Partial {
  const R = r.H1;
  const rows = s.series.network.filter((d) => d.active != null && d.price != null).slice(-R.windowDays);
  const window = { from: rows[0]?.date ?? day(s.as_of), to: rows.at(-1)?.date ?? day(s.as_of), days: rows.length };
  const flip = `Supported needs |ρ| < ${R.maxAbsRho} and 30-day active-account growth ≥ ${(R.minGrowth * 100).toFixed(0)}%; ρ ≥ ${R.notRho} means usage is tracking price (Not supported).`;
  const all = s.series.network.filter((d) => d.active != null);
  const last30 = all.slice(-30).map((d) => d.active!);
  const prev30 = all.slice(-60, -30).map((d) => d.active!);
  const growth = last30.length === 30 && prev30.length === 30 ? mean(last30) / mean(prev30) - 1 : null;
  const base = { metric_value: null, metric_label: "Spearman ρ", flip_condition: flip, window, sample_size: rows.length, evidence: [] as Evidence[] };
  if (rows.length < Math.max(r.minWindowDays, R.maDays + 2)) return insufficient(`only ${rows.length} days with both series; needs ≥ ${r.minWindowDays}`, base);
  const ma = (k: "active" | "price") => movingAverage(rows.map((d) => d[k]!), R.maDays);
  const a = ma("active"), p = ma("price");
  const pairs = a.map((v, i) => [v, p[i]] as const).filter((x): x is readonly [number, number] => x[0] != null && x[1] != null);
  const rho = spearman(pairs.map((x) => x[0]), pairs.map((x) => x[1]));
  const evidence: Evidence[] = [
    { label: `Spearman ρ, ${R.maDays}d-MA active accounts vs ${R.maDays}d-MA NEAR price (${rows.length}d)`, value: fx(rho), dir: rho == null ? "neutral" : Math.abs(rho) < R.maxAbsRho ? "for" : rho >= R.notRho ? "against" : "neutral", source: "snapshot:series.network" },
    { label: "Daily active accounts, 30d avg vs prior 30d", value: signedPct(growth), dir: growth == null ? "neutral" : growth >= R.minGrowth ? "for" : "against", source: "snapshot:series.network" },
  ];
  if (rho == null || growth == null) return insufficient("correlation or growth could not be computed", { ...base, evidence });
  const sup = Math.abs(rho) < R.maxAbsRho && growth >= R.minGrowth;
  const not = rho >= R.notRho;
  const verdict: VerdictValue = sup ? "Supported" : not ? "Not supported" : "Mixed";
  const margin = sup
    ? `ρ is ${fx(R.maxAbsRho - Math.abs(rho))} inside the |ρ| < ${R.maxAbsRho} band; growth is ${signedPct(growth - R.minGrowth)} above the floor`
    : not
      ? `ρ must fall by ${fx(rho - R.notRho + 0.001, 3)} to leave Not supported`
      : [Math.abs(rho) >= R.maxAbsRho ? `|ρ| must fall by ${fx(Math.abs(rho) - R.maxAbsRho + 0.001, 3)}` : null, growth < R.minGrowth ? `active-account growth must rise by ${signedPct(R.minGrowth - growth)}` : null].filter(Boolean).join(" and ") + " to reach Supported";
  return { ...base, verdict, metric_value: rho, margin_to_next: margin, evidence };
}

function H2({ s, r }: Ctx): Partial {
  const R = r.H2;
  const from = addDays(day(s.as_of), -(R.windowDays - 1));
  const rows = s.series.h2_daily.filter((d) => d.date >= from && d.date <= day(s.as_of));
  const window = { from: rows[0]?.date ?? from, to: rows.at(-1)?.date ?? day(s.as_of), days: rows.length };
  const flip = `Supported when custody ÷ clean TVL ≥ ${R.ratio}× on ≥ ${R.share * 100}% of the last ${R.windowDays} days; Not supported when it is < ${R.notRatio}× on > ${R.notShare * 100}% of days.`;
  const latest = rows.at(-1);
  const evidence: Evidence[] = [
    { label: "Assets held by intents.near (latest day)", value: usd(latest?.custody_usd ?? s.intents.custody_usd), dir: "neutral", source: "snapshot:intents.custody_usd" },
    { label: "RHEA clean pool TVL (latest day)", value: usd(latest?.clean_tvl_usd ?? s.rhea.clean_tvl_usd), dir: "neutral", source: "snapshot:rhea.clean_tvl_usd" },
    { label: "Custody ÷ clean TVL (latest day)", value: latest ? `${fx(latest.ratio)}×` : "not reported", dir: latest ? (latest.ratio >= R.ratio ? "for" : latest.ratio < R.notRatio ? "against" : "neutral") : "neutral", source: "snapshot:series.h2_daily" },
    { label: `Days in window with both values (from same-day snapshots)`, value: `${rows.length} of ${R.windowDays}`, dir: "neutral", source: "snapshot:series.h2_daily" },
  ];
  const base = { metric_value: null, metric_label: `share of days ≥ ${R.ratio}×`, flip_condition: flip, window, sample_size: rows.length, evidence, snapshot_hashes: rows.map((d) => d.snapshot_sha256) };
  if (rows.length < Math.min(r.minWindowDays, R.windowDays)) return insufficient(`${rows.length} of ${R.windowDays} daily snapshots so far; needs ≥ ${Math.min(r.minWindowDays, R.windowDays)} (window fills one day per snapshot)`, base);
  const shareSup = rows.filter((d) => d.ratio >= R.ratio).length / rows.length;
  const shareNot = rows.filter((d) => d.ratio < R.notRatio).length / rows.length;
  const sup = shareSup >= R.share;
  const not = shareNot > R.notShare;
  const verdict: VerdictValue = sup ? "Supported" : not ? "Not supported" : "Mixed";
  const margin = sup ? `${pct(shareSup - R.share, 0)} of days above the ${pct(R.share, 0)} bar` : not ? `${pct(shareNot - R.notShare, 0)} of days must move above ${R.notRatio}× to leave Not supported` : `needs ${pct(R.share - shareSup, 0)} more of days at ≥ ${R.ratio}× to flip to Supported`;
  return { ...base, verdict, metric_value: shareSup, margin_to_next: margin };
}

function H3({ s, r }: Ctx): Partial {
  const R = r.H3;
  const ok = s.depth.filter((d) => d.status === "ok" && d.size_usd === R.sizeUsd && d.relative_slippage != null && d.token_id !== "wrap.near" && d.token_id !== "near");
  const best = new Map<string, { imp: number; route: string }>();
  for (const d of ok) {
    const cur = best.get(d.token_id);
    if (!cur || d.relative_slippage! < cur.imp) best.set(d.token_id, { imp: d.relative_slippage!, route: `${d.route}/${d.router}${d.route === "intents" ? ` from ${d.origin}` : ""}` });
  }
  const tokens = [...new Set(s.depth.filter((d) => d.token_id !== "wrap.near").map((d) => d.token_id))];
  const pass = [...best.entries()].filter(([, v]) => v.imp <= R.maxImpact);
  const sym = (id: string) => s.index.find((x) => x.token_id === id)?.symbol ?? id;
  const failed = s.depth.filter((d) => d.size_usd === R.sizeUsd && d.status !== "ok");
  const evidence: Evidence[] = [
    { label: `Tokens quoted at $${R.sizeUsd / 1000}k (excluding NEAR/wNEAR)`, value: `${tokens.length}`, dir: "neutral", source: "snapshot:depth" },
    { label: `With a measured $${R.sizeUsd / 1000}k quote on at least one route`, value: `${best.size}`, dir: "neutral", source: "snapshot:depth" },
    { label: `Best-route impact ≤ ${pct(R.maxImpact)}`, value: pass.length ? `${pass.length} (${pass.map(([id]) => sym(id)).join(", ")})` : "0", dir: pass.length >= R.minTokens ? "for" : pass.length <= R.maxTokensNot ? "against" : "neutral", source: "snapshot:depth" },
    { label: `$${R.sizeUsd / 1000}k quotes that failed (error / no-route / paused / not configured)`, value: `${failed.length}`, dir: "neutral", source: "snapshot:depth" },
  ];
  const window = { from: day(s.as_of), to: day(s.as_of), days: 1 };
  const flip = `Supported with ≥ ${R.minTokens} non-NEAR tokens at ≤ ${pct(R.maxImpact)} best-route impact for $${R.sizeUsd / 1000}k; Not supported with ≤ ${R.maxTokensNot}.`;
  const base = { metric_value: null, metric_label: "tokens passing", flip_condition: flip, window, sample_size: best.size, evidence };
  if (best.size === 0) return insufficient(`no token has a successful $${R.sizeUsd / 1000}k quote in this snapshot`, base);
  const n = pass.length;
  const verdict: VerdictValue = n >= R.minTokens ? "Supported" : n <= R.maxTokensNot ? "Not supported" : "Mixed";
  const margin = verdict === "Supported" ? `${n - R.minTokens} token(s) above the bar` : verdict === "Not supported" ? `needs ${R.maxTokensNot + 1 - n} more token(s) to reach Mixed, ${R.minTokens - n} for Supported` : `needs ${R.minTokens - n} more token(s) to flip to Supported`;
  const derivedOnly = pass.some(([, v]) => v.route.includes("amm-math"));
  return { ...base, verdict, metric_value: n, margin_to_next: margin, evidence_grade: derivedOnly ? "C" : undefined };
}

function H4({ s, r }: Ctx): Partial {
  const R = r.H4;
  const rows = s.series.pool_volume.slice(-R.windowDays);
  const window = { from: rows[0]?.date ?? day(s.as_of), to: rows.at(-1)?.date ?? day(s.as_of), days: rows.length };
  const total = rows.reduce((a, d) => a + d.total_usd, 0);
  const organic = rows.reduce((a, d) => a + d.organic_usd, 0);
  const share = total > 0 ? organic / total : null;
  const flip = `Supported at ≥ ${pct(R.supported, 0)} organic share of ${R.windowDays}-day volume; Not supported below ${pct(R.notSupported, 0)}.`;
  const evidence: Evidence[] = [
    { label: `Reported volume, ${rows.length}d (pools with daily history)`, value: usd(total), dir: "neutral", source: "snapshot:series.pool_volume" },
    { label: "Of which from clean, unflagged pools", value: usd(organic), dir: "neutral", source: "snapshot:series.pool_volume" },
    { label: "Organic share", value: pct(share), dir: share == null ? "neutral" : share >= R.supported ? "for" : share < R.notSupported ? "against" : "neutral", source: "snapshot:series.pool_volume" },
    { label: "Pools rejected by integrity rules (today)", value: `${s.rhea.rejected_count}`, dir: "neutral", source: "snapshot:rhea.rejected_pools" },
  ];
  const base = { metric_value: share, metric_label: "organic share", flip_condition: flip, window, sample_size: rows.reduce((a, d) => Math.max(a, d.pools), 0), evidence };
  if (rows.length < Math.min(r.minWindowDays, R.windowDays) || share == null) return insufficient(`${rows.length} days of pool volume; needs ≥ ${Math.min(r.minWindowDays, R.windowDays)}`, base);
  const verdict: VerdictValue = share >= R.supported ? "Supported" : share < R.notSupported ? "Not supported" : "Mixed";
  const margin = verdict === "Supported" ? `${pct(share - R.supported)} above the bar` : verdict === "Not supported" ? `needs +${pct(R.notSupported - share)} to reach Mixed` : `needs +${pct(R.supported - share)} to flip to Supported`;
  return { ...base, verdict, margin_to_next: margin };
}

function H5({ s, r }: Ctx): Partial {
  const end = Date.parse(s.as_of);
  const inWin = (days: number) => s.series.flow_buckets.filter((b) => Date.parse(b.end) <= end && Date.parse(b.start) >= end - days * 86400000);
  // Day-weighted: average the sampled net of the buckets within each UTC day, then sum the days, so
  // denser sampling on some days (30-minute job vs 3-hour backfill) does not over-weight them.
  const dayWeighted = (bs: Snapshot["series"]["flow_buckets"]) => {
    const by = new Map<string, { sum: number; n: number }>();
    for (const b of bs) {
      const k = b.end.slice(0, 10);
      const e = by.get(k) ?? { sum: 0, n: 0 };
      e.sum += b.deposits_usd - b.withdrawals_usd;
      e.n++;
      by.set(k, e);
    }
    return [...by.values()].reduce((a, e) => a + e.sum / e.n, 0);
  };
  const agg = (bs: Snapshot["series"]["flow_buckets"]) => ({ net: dayWeighted(bs), events: bs.reduce((a, b) => a + b.events, 0), n: bs.length, minutes: bs.reduce((a, b) => a + (Date.parse(b.end) - Date.parse(b.start)) / 60000, 0) });
  const w30 = agg(inWin(30));
  const w7 = agg(inWin(7));
  const first = s.series.flow_buckets.map((b) => Date.parse(b.start)).filter((t) => t >= end - 30 * 86400000).sort((a, b) => a - b)[0];
  const spanDays = first ? (end - first) / 86400000 : 0;
  const tvl = s.series.rhea_tvl.filter((d) => d.amm != null);
  const last = tvl.at(-1);
  const prior = last ? tvl.filter((d) => d.date <= addDays(last.date, -30)).at(-1) : undefined;
  const tvlChange = last && prior && prior.amm! > 0 ? last.amm! / prior.amm! - 1 : null;
  const evidence: Evidence[] = [
    { label: `Sampled net Intents flow, 30d, day-weighted (${w30.n} windows, ${w30.events.toLocaleString("en-US")} events, ${Math.round(w30.minutes)} min sampled)`, value: usd(w30.n ? w30.net : null), dir: w30.n ? (w30.net > 0 ? "for" : w30.net < 0 ? "against" : "neutral") : "neutral", source: "snapshot:series.flow_buckets" },
    { label: `Sampled net Intents flow, 7d, day-weighted (${w7.n} windows, ${w7.events.toLocaleString("en-US")} events)`, value: usd(w7.n ? w7.net : null), dir: w7.n ? (w7.net > 0 ? "for" : w7.net < 0 ? "against" : "neutral") : "neutral", source: "snapshot:series.flow_buckets" },
    { label: "RHEA AMM TVL, 30-day change (data-service daily series)", value: signedPct(tvlChange), dir: tvlChange == null ? "neutral" : tvlChange > 0 ? "for" : "against", source: "snapshot:series.rhea_tvl" },
  ];
  const window = { from: first ? new Date(first).toISOString().slice(0, 10) : day(s.as_of), to: day(s.as_of), days: Math.floor(spanDays) };
  const flip = "Supported when sampled 30d and 7d net flows are both positive and 30d TVL change is positive; Not supported when both net flows are negative.";
  const base = { metric_value: w30.n ? w30.net : null, metric_label: "sampled 30d net (USD)", flip_condition: flip, window, sample_size: w30.events, evidence };
  if (w30.events < r.minIntentsEvents) return insufficient(`${w30.events.toLocaleString("en-US")} sampled events in 30d; needs ≥ ${r.minIntentsEvents.toLocaleString("en-US")}`, base);
  if (spanDays < r.minWindowDays - 1) return insufficient(`samples span ${spanDays.toFixed(1)} days; needs ≥ ${r.minWindowDays}`, base);
  if (w7.n === 0 || tvlChange == null) return insufficient("7-day sample or 30-day TVL change missing", base);
  const sup = w30.net > 0 && w7.net > 0 && tvlChange > 0;
  const not = w30.net < 0 && w7.net < 0;
  const verdict: VerdictValue = sup ? "Supported" : not ? "Not supported" : "Mixed";
  const margin = sup ? "all three signals positive" : not ? `7d sampled net must turn positive (now ${usd(w7.net)}) to reach Mixed` : [w30.net <= 0 ? "30d net" : null, w7.net <= 0 ? "7d net" : null, tvlChange <= 0 ? "30d TVL change" : null].filter(Boolean).join(", ") + " must turn positive for Supported";
  return { ...base, verdict, margin_to_next: margin };
}

function H6({ s, r }: Ctx): Partial {
  const R = r.H6;
  const D = R.incidentDate;
  const baseFrom = addDays(D, -R.baselineDays);
  const baseTo = addDays(D, -1);
  const atDay = addDays(D, R.atDay);
  const cust = new Map(s.series.custody_constant.map((d) => [d.date, d.usd]));
  const txns = new Map(s.series.intents_txns.map((d) => [d.date, d.txns]));
  const range = (m: Map<string, number>, a: string, b: string) => [...m.entries()].filter(([d]) => d >= a && d <= b).map(([, v]) => v);
  const cBase = range(cust, baseFrom, baseTo);
  const tBase = range(txns, baseFrom, baseTo);
  const cAt = cust.get(atDay);
  const tAt = txns.get(atDay);
  const cRatio = cAt != null && cBase.length ? cAt / median(cBase) : null;
  const tRatio = tAt != null && tBase.length ? tAt / median(tBase) : null;
  const evidence: Evidence[] = [
    { label: `intents.near custody (constant prices), ${R.baselineDays}d pre-incident median`, value: usd(cBase.length ? median(cBase) : null), dir: "neutral", source: "snapshot:series.custody_constant" },
    { label: `Custody on day ${R.atDay} (${atDay}) vs baseline`, value: pct(cRatio, 0), dir: cRatio == null ? "neutral" : cRatio >= R.recoverShare ? "for" : cRatio < R.failShare ? "against" : "neutral", source: "snapshot:series.custody_constant" },
    { label: `Daily intents.near txns, ${R.baselineDays}d pre-incident median`, value: tBase.length ? Math.round(median(tBase)).toLocaleString("en-US") : "not reported", dir: "neutral", source: "snapshot:series.intents_txns" },
    { label: `Txns on day ${R.atDay} (${atDay}) vs baseline`, value: pct(tRatio, 0), dir: tRatio == null ? "neutral" : tRatio >= R.recoverShare ? "for" : tRatio < R.failShare ? "against" : "neutral", source: "snapshot:series.intents_txns" },
    { label: "Incident date source", value: D, dir: "neutral", source: s.incident.sources[0] },
  ];
  const window = { from: baseFrom, to: atDay, days: R.baselineDays + R.atDay + 1 };
  const flip = `Supported when custody and daily txns are both ≥ ${pct(R.recoverShare, 0)} of the pre-incident ${R.baselineDays}d median on day ${R.atDay}; Not supported when either is < ${pct(R.failShare, 0)}.`;
  const base = { metric_value: cRatio == null || tRatio == null ? null : Math.min(cRatio, tRatio), metric_label: "lower of the two recovery ratios", flip_condition: flip, window, sample_size: cBase.length + tBase.length + (cAt != null ? 1 : 0) + (tAt != null ? 1 : 0), evidence };
  if (day(s.as_of) < atDay) return insufficient(`day ${R.atDay} (${atDay}) has not been reached`, base);
  if (cBase.length < R.baselineDays || tBase.length < R.baselineDays) return insufficient(`baseline needs ${R.baselineDays} pre-incident days of both series (have custody ${cBase.length}, txns ${tBase.length})`, base);
  if (cRatio == null || tRatio == null) return insufficient(`day-${R.atDay} value missing for ${cRatio == null ? "custody" : "txns"}`, base);
  const lo = Math.min(cRatio, tRatio);
  const verdict: VerdictValue = cRatio >= R.recoverShare && tRatio >= R.recoverShare ? "Supported" : lo < R.failShare ? "Not supported" : "Mixed";
  const margin = verdict === "Supported" ? `lowest ratio is ${pct(lo - R.recoverShare, 0)} above the bar` : verdict === "Not supported" ? `lowest ratio needs +${pct(R.failShare - lo, 0)} to reach Mixed` : `lowest ratio needs +${pct(R.recoverShare - lo, 0)} to flip to Supported`;
  return { ...base, verdict, margin_to_next: margin };
}

const FNS: Record<ClaimId, (c: Ctx) => Partial> = { H1, H2, H3, H4, H5, H6 };

export function computeVerdicts(s: Snapshot, r: Rules, t: Thresholds): Verdict[] {
  return (Object.keys(FNS) as ClaimId[]).map((id) => {
    const c = t.claims[id];
    const p = FNS[id]({ s, r, t });
    const { evidence_grade, snapshot_hashes, ...rest } = p;
    return {
      id,
      claim: c.text,
      metric: c.metric.replace(/\s+/g, " "),
      threshold_supported: c.supported,
      threshold_not_supported: c.not_supported,
      evidence_grade: evidence_grade ?? c.grade,
      snapshot_hashes: [...new Set([s.sha256, ...(snapshot_hashes ?? [])])],
      ...rest,
    };
  });
}
