import type { Thresholds } from "./schema";

/**
 * Turns the human-readable rule strings in thresholds/v1.yaml into numbers the verdict engine uses.
 * Each claim has a strict pattern; if the file's wording changes so a pattern no longer matches,
 * parsing throws and the build fails. Numbers are never defaulted.
 */
function grab(s: string, re: RegExp, what: string): number[] {
  const m = s.replace(/\s+/g, " ").trim().match(re);
  if (!m) throw new Error(`thresholds: cannot parse ${what}: "${s}"`);
  return m.slice(1).map((x) => {
    const n = Number(x);
    if (!Number.isFinite(n)) throw new Error(`thresholds: non-numeric value in ${what}: "${x}"`);
    return n;
  });
}

const N = "(-?\\d+(?:\\.\\d+)?)";

export function compileRules(t: Thresholds) {
  const c = t.claims;
  const [h1AbsRho, h1Growth] = grab(c.H1.supported, new RegExp(`^abs\\(rho\\) < ${N} AND 30d avg active accounts growth >= ${N}%$`), "H1.supported");
  const [h1NotRho] = grab(c.H1.not_supported, new RegExp(`^rho >= ${N}$`), "H1.not_supported");
  const [h1Days] = grab(c.H1.metric, /(\d+)d$/, "H1.metric window");
  const [h1Ma] = grab(c.H1.metric, /of (\d+)d-MA/, "H1.metric MA");

  const [h2Ratio, h2Share] = grab(c.H2.supported, new RegExp(`^ratio >= ${N} on >= ${N}% of days$`), "H2.supported");
  const [h2NotRatio, h2NotShare] = grab(c.H2.not_supported, new RegExp(`^ratio < ${N} on > ${N}% of days$`), "H2.not_supported");
  const [h2Days] = grab(c.H2.metric, /last (\d+)d$/, "H2.metric window");

  const [h3Size, h3Impact] = grab(c.H3.metric, new RegExp(`\\$(\\d+)k price impact <= ${N}%`), "H3.metric");
  const [h3Min] = grab(c.H3.supported, /^>= (\d+) tokens?$/, "H3.supported");
  const [h3Max] = grab(c.H3.not_supported, /^<= (\d+) tokens?$/, "H3.not_supported");

  const [h4Sup] = grab(c.H4.supported, new RegExp(`^>= ${N}%$`), "H4.supported");
  const [h4Not] = grab(c.H4.not_supported, new RegExp(`^< ${N}%$`), "H4.not_supported");
  const [h4Days] = grab(c.H4.metric, /(\d+)d$/, "H4.metric window");

  grab(c.H5.supported, /^30d net > (0) AND 7d net > (0) AND 30d clean TVL change > (0)$/, "H5.supported");
  grab(c.H5.not_supported, /^30d net < (0) AND 7d net < (0)$/, "H5.not_supported");

  const [h6Sup, h6Days] = grab(c.H6.supported, new RegExp(`^both >= ${N}% of baseline within (\\d+)d of incident_date$`), "H6.supported");
  const [h6Not, h6At] = grab(c.H6.not_supported, new RegExp(`^either < ${N}% of baseline at day (\\d+)$`), "H6.not_supported");
  const [h6Base] = grab(c.H6.metric, /pre-incident (\d+)d median/, "H6.metric baseline");

  return {
    minWindowDays: t.global.min_window_days,
    minIntentsEvents: t.global.min_intents_events,
    H1: { maDays: h1Ma, windowDays: h1Days, maxAbsRho: h1AbsRho, minGrowth: h1Growth / 100, notRho: h1NotRho },
    H2: { windowDays: h2Days, ratio: h2Ratio, share: h2Share / 100, notRatio: h2NotRatio, notShare: h2NotShare / 100 },
    H3: { sizeUsd: h3Size * 1000, maxImpact: h3Impact / 100, minTokens: h3Min, maxTokensNot: h3Max },
    H4: { windowDays: h4Days, supported: h4Sup / 100, notSupported: h4Not / 100, maxTurnover: c.H4.wash_flags.max_daily_turnover, concMinShare: c.H4.wash_flags.concentration_min_share, concTvlMultiple: c.H4.wash_flags.concentration_tvl_multiple },
    H5: { windows: [7, 30] as const, minCoverage: c.H5.min_coverage },
    H6: { incidentDate: c.H6.incident_date, baselineDays: h6Base, recoverShare: h6Sup / 100, withinDays: h6Days, failShare: h6Not / 100, atDay: h6At },
    index: t.index_rules,
  };
}
export type Rules = ReturnType<typeof compileRules>;
