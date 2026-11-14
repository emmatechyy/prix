/**
 * PRIX verdict engine. Pure and deterministic: (snapshot, rules) → verdicts. No network, no clock
 * (the "now" is the snapshot's as_of). Every threshold comes from thresholds/v1.yaml via compileRules.
 */
import type { Snapshot } from "../snapshot/schema";
import type { Rules } from "../thresholds/rules";
import type { Thresholds, ClaimId } from "../thresholds/schema";
import { addDays, mean, median, movingAverage, spearman } from "./stats";
import { nonOverlapping, observedCoverage } from "../history/coverage";

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
  /** Share of the window actually observed (H5: contiguous event pages). Shown on the claim card. */
  coverage?: { share: number; hours: number; window_hours: number; min: number };
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

export type WashFlag = "turnover" | "concentration";
export type H4Pool = { id: string; pair: string; kind: string; tvl_usd: number; rejected: boolean; token_flagged: boolean; volume_usd: number; share: number; tvl_share: number | null; turnover: number | null; wash: WashFlag[]; organic: boolean };
export type H4Breakdown = {
  dates: string[];
  total: number;
  organic: number;
  rejected: number;
  flagged: number;
  share: number | null;
  shareWithoutWashFlags: number | null;
  top3Share: number | null;
  pools: H4Pool[];
  daily: { date: string; total: number; organic: number }[];
};

/**
 * H4 numerator/denominator from the all-pool table. Denominator = volume of every live pool that
 * traded (rejected and flagged included). Numerator = pools that are not rejected, carry no token
 * wash flag and trip neither wash signal from the thresholds file.
 */
export function h4Breakdown(pva: Snapshot["series"]["pool_volume_all"], cleanTvl: number | null, R: Rules["H4"]): H4Breakdown | null {
  if (!pva || !pva.rows.length) return null;
  const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0);
  const total = sum(pva.rows.map((p) => sum(p.daily)));
  const pools: H4Pool[] = pva.rows.map((p) => {
    const v = sum(p.daily);
    const share = total > 0 ? v / total : 0;
    const tvlShare = !p.rejected && cleanTvl ? p.tvl_usd / cleanTvl : null;
    const turnover = p.tvl_usd > 0 ? v / p.daily.length / p.tvl_usd : null;
    const wash: WashFlag[] = [];
    if (!p.rejected) {
      if (turnover != null && turnover > R.maxTurnover) wash.push("turnover");
      if (tvlShare != null && share >= R.concMinShare && share > R.concTvlMultiple * tvlShare) wash.push("concentration");
    }
    return { id: p.id, pair: p.pair, kind: p.kind, tvl_usd: p.tvl_usd, rejected: p.rejected, token_flagged: p.token_flagged, volume_usd: v, share, tvl_share: tvlShare, turnover, wash, organic: !p.rejected && !p.token_flagged && wash.length === 0 };
  });
  const organic = sum(pools.filter((p) => p.organic).map((p) => p.volume_usd));
  const rejected = sum(pools.filter((p) => p.rejected).map((p) => p.volume_usd));
  const noWash = sum(pools.filter((p) => !p.rejected && !p.token_flagged).map((p) => p.volume_usd));
  const sorted = [...pools].sort((x, y) => y.volume_usd - x.volume_usd);
  const daily = pva.dates.map((date, i) => ({ date, total: sum(pva.rows.map((p) => p.daily[i])), organic: sum(pva.rows.filter((_, j) => pools[j].organic).map((p) => p.daily[i])) }));
  return {
    dates: pva.dates,
    total,
    organic,
    rejected,
    flagged: total - organic - rejected,
    share: total > 0 ? organic / total : null,
    shareWithoutWashFlags: total > 0 ? noWash / total : null,
    top3Share: total > 0 ? sum(sorted.slice(0, 3).map((p) => p.volume_usd)) / total : null,
    pools: sorted,
    daily,
  };
}

function H4({ s, r }: Ctx): Partial {
  const R = r.H4;
  const pva = s.series.pool_volume_all;
  const b = h4Breakdown(pva, s.rhea.clean_tvl_usd, R);
  const dates = pva?.dates ?? [];
  const window = { from: dates[0] ?? day(s.as_of), to: dates.at(-1) ?? day(s.as_of), days: dates.length };
  const share = b?.share ?? null;
  const flip = `Supported at ≥ ${pct(R.supported, 0)} of ${R.windowDays}-day volume from pools that are neither rejected nor wash-flagged, out of volume across ALL live pools; Not supported below ${pct(R.notSupported, 0)}. Wash flags: mean daily volume > ${R.maxTurnover}× pool TVL, or ≥ ${pct(R.concMinShare, 0)} of all volume while > ${R.concTvlMultiple}× its share of clean TVL.`;
  const flaggedPools = (b?.pools ?? []).filter((p) => !p.rejected && (p.wash.length || p.token_flagged));
  const cover = pva?.protocol_volume_24h_usd && pva.all_pool_volume_last_day_usd != null ? pva.all_pool_volume_last_day_usd / pva.protocol_volume_24h_usd : null;
  const evidence: Evidence[] = [
    { label: `Denominator: volume across all ${pva?.pools_live ?? "?"} live pools (${b?.pools.length ?? 0} traded), ${window.days}d, rejected and flagged included`, value: usd(b?.total), dir: "neutral", source: "snapshot:series.pool_volume_all" },
    { label: `Of which from ${s.rhea.rejected_count} rejected pools`, value: `${usd(b?.rejected)} (${pct(b && b.total ? b.rejected / b.total : null, 2)})`, dir: "neutral", source: "snapshot:series.pool_volume_all" },
    { label: `Of which from ${flaggedPools.length} wash-flagged pools`, value: `${usd(b?.flagged)} (${pct(b && b.total ? b.flagged / b.total : null, 1)})`, dir: b && b.flagged > 0 ? "against" : "neutral", source: "snapshot:series.pool_volume_all" },
    ...flaggedPools.slice(0, 5).map<Evidence>((p) => ({ label: `Flagged: ${p.pair} (${p.kind}) · ${[p.wash.includes("turnover") ? `turnover ${fx(p.turnover)}×/day` : null, p.wash.includes("concentration") ? `${pct(p.share, 1)} of volume vs ${pct(p.tvl_share, 2)} of clean TVL` : null, p.token_flagged ? "token wash flag" : null].filter(Boolean).join(" · ")}`, value: usd(p.volume_usd), dir: "against", source: "snapshot:series.pool_volume_all" })),
    { label: "Volume from verified pools (not rejected, not flagged)", value: pct(share), dir: share == null ? "neutral" : share >= R.supported ? "for" : share < R.notSupported ? "against" : "neutral", source: "snapshot:series.pool_volume_all" },
    { label: "Same share without the wash flags (rejected pools only removed)", value: pct(b?.shareWithoutWashFlags), dir: "neutral", source: "snapshot:series.pool_volume_all" },
    { label: "Concentration: top 3 pools' share of volume", value: pct(b?.top3Share), dir: "neutral", source: "snapshot:series.pool_volume_all" },
    { label: "Denominator check: all-pool volume on the last full UTC day ÷ RHEA's reported rolling 24h volume", value: cover == null ? "not reported" : `${pct(cover, 0)} (${usd(pva?.all_pool_volume_last_day_usd)} vs ${usd(pva?.protocol_volume_24h_usd)})`, dir: "neutral", source: "snapshot:rhea.volume_24h_usd" },
  ];
  const base = { metric_value: share, metric_label: "volume share from verified pools", flip_condition: flip, window, sample_size: b?.pools.length ?? 0, evidence };
  if (!b || dates.length < Math.min(r.minWindowDays, R.windowDays) || share == null) return insufficient(`${dates.length} days of all-pool volume; needs ≥ ${Math.min(r.minWindowDays, R.windowDays)}`, base);
  if (pva && pva.pools_unreported > 0.05 * pva.pools_live) return insufficient(`${pva.pools_unreported} of ${pva.pools_live} pool volume histories not reported; the denominator would be incomplete`, base);
  const verdict: VerdictValue = share >= R.supported ? "Supported" : share < R.notSupported ? "Not supported" : "Mixed";
  const margin = verdict === "Supported" ? `${pct(share - R.supported)} above the bar` : verdict === "Not supported" ? `needs +${pct(R.notSupported - share)} to reach Mixed` : `needs +${pct(R.supported - share)} to flip to Supported`;
  return { ...base, verdict, margin_to_next: margin };
}

function H5({ s, r }: Ctx): Partial {
  const end = Date.parse(s.as_of);
  const R = r.H5;
  const pages = nonOverlapping(s.series.flow_buckets);
  const inWin = (days: number) => pages.filter((b) => Date.parse(b.end) <= end && Date.parse(b.start) >= end - days * 86400000);
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
  const cov30 = observedCoverage(pages, end, 30);
  const cov7 = observedCoverage(pages, end, 7);
  const first = s.series.flow_buckets.map((b) => Date.parse(b.start)).filter((t) => t >= end - 30 * 86400000).sort((a, b) => a - b)[0];
  const spanDays = first ? (end - first) / 86400000 : 0;
  const tvl = s.series.rhea_tvl.filter((d) => d.amm != null);
  const last = tvl.at(-1);
  const prior = last ? tvl.filter((d) => d.date <= addDays(last.date, -30)).at(-1) : undefined;
  const tvlChange = last && prior && prior.amm! > 0 ? last.amm! / prior.amm! - 1 : null;
  const evidence: Evidence[] = [
    { label: `Observed net Intents flow, 30d, day-weighted (${w30.n} windows, ${w30.events.toLocaleString("en-US")} events, ${Math.round(w30.minutes)} min observed)`, value: usd(w30.n ? w30.net : null), dir: w30.n ? (w30.net > 0 ? "for" : w30.net < 0 ? "against" : "neutral") : "neutral", source: "snapshot:series.flow_buckets" },
    { label: `Observed net Intents flow, 7d, day-weighted (${w7.n} windows, ${w7.events.toLocaleString("en-US")} events)`, value: usd(w7.n ? w7.net : null), dir: w7.n ? (w7.net > 0 ? "for" : w7.net < 0 ? "against" : "neutral") : "neutral", source: "snapshot:series.flow_buckets" },
    { label: `Coverage: hours of the 30d window actually observed (needs ≥ ${pct(R.minCoverage, 0)})`, value: `${pct(cov30.share, 2)} (${cov30.hours.toFixed(1)} of ${cov30.windowHours} h)`, dir: cov30.share >= R.minCoverage ? "neutral" : "against", source: "snapshot:series.flow_buckets" },
    { label: `Coverage: 7d window (needs ≥ ${pct(R.minCoverage, 0)})`, value: `${pct(cov7.share, 2)} (${cov7.hours.toFixed(1)} of ${cov7.windowHours} h)`, dir: cov7.share >= R.minCoverage ? "neutral" : "against", source: "snapshot:series.flow_buckets" },
    { label: "RHEA AMM TVL, 30-day change (data-service daily series)", value: signedPct(tvlChange), dir: tvlChange == null ? "neutral" : tvlChange > 0 ? "for" : "against", source: "snapshot:series.rhea_tvl" },
  ];
  const window = { from: first ? new Date(first).toISOString().slice(0, 10) : day(s.as_of), to: day(s.as_of), days: Math.floor(spanDays) };
  const flip = `Needs ≥ ${pct(R.minCoverage, 0)} of the 7d and 30d windows observed before any verdict. Then: Supported when observed 30d and 7d net flows are both positive and 30d TVL change is positive; Not supported when both net flows are negative.`;
  const coverage = { share: Math.min(cov30.share, cov7.share), hours: cov30.hours, window_hours: cov30.windowHours, min: R.minCoverage };
  const base = { metric_value: w30.n ? w30.net : null, metric_label: "observed 30d net (USD)", flip_condition: flip, window, sample_size: w30.events, evidence, coverage };
  if (cov30.share < R.minCoverage || cov7.share < R.minCoverage)
    return insufficient(`coverage ${pct(cov30.share, 2)} of the 30-day window (${cov30.hours.toFixed(1)} of ${cov30.windowHours} h) and ${pct(cov7.share, 2)} of the 7-day window were observed; needs ≥ ${pct(R.minCoverage, 0)} of each. Nothing is extrapolated.`, base);
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
    { label: `Incident date (reported; ${s.incident.sources.length} sources, exploit activity ${s.incident.timing_range.from.slice(0, 10)} – ${s.incident.timing_range.to.slice(0, 10)})`, value: D, dir: "neutral", source: s.incident.sources.find((x) => x.kind === "official")?.url ?? s.incident.sources[0]?.url },
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
