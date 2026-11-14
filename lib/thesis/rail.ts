import type { Rules } from "../thresholds/rules";
import type { Verdict, VerdictValue } from "./engine";

/**
 * Threshold rail model (frontend spec §5). Pure: turns a verdict plus the compiled thresholds into
 * the zones, ticks, marker position and the one-line sentence the rail and its text equivalent show.
 * Zones come only from thresholds/v1.yaml (via Rules); nothing here decides a verdict.
 */
export type ZoneKind = "Supported" | "Mixed" | "Not supported";
export type Zone = { from: number; to: number; kind: ZoneKind; note?: string };
export type RailModel =
  | {
      kind: "rail";
      domain: [number, number];
      zones: Zone[];
      ticks: { at: number; label: string }[];
      value: number | null;
      /** 0–1 position of the marker on the track, clamped. */
      pos: number | null;
      valueText: string;
      needsText: string;
      sentence: string;
      lowerIsBetter: boolean;
    }
  | { kind: "coverage"; share: number; min: number; sentence: string; valueText: string; needsText: string };

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const fmtPct = (x: number) => (x < 0.1 && x > 0 ? pct(x, 1) : pct(x));
const sign = (x: number) => (x < 0 ? "−" : "");
const usdShort = (x: number) => {
  const a = Math.abs(x);
  return `${sign(x)}$${a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : a.toFixed(0)}`;
};

function rail(domain: [number, number], zones: Zone[], ticks: { at: number; label: string }[], value: number | null, valueText: string, needsText: string, sentence: string, lowerIsBetter = false): RailModel {
  const [a, b] = domain;
  const pos = value == null ? null : Math.min(1, Math.max(0, (value - a) / (b - a)));
  return { kind: "rail", domain, zones, ticks, value, pos, valueText, needsText, sentence, lowerIsBetter };
}

export function railFor(v: Verdict, r: Rules): RailModel {
  if (v.verdict === "Insufficient data") {
    if (v.coverage) {
      return {
        kind: "coverage",
        share: v.coverage.share,
        min: v.coverage.min,
        valueText: `${fmtPct(v.coverage.share)} observed`,
        needsText: `needs ${pct(v.coverage.min)}`,
        sentence:
          v.id === "H5"
            ? `Needs ${pct(v.coverage.min)} of both the 7- and 30-day windows observed; has ${fmtPct(v.coverage.share)} (the lower of the two).`
            : `Needs ${pct(v.coverage.min)} of ${v.window.days} days observed; has ${fmtPct(v.coverage.share)}.`,
      };
    }
    // Window-length shortfall (e.g. H2 fills one day per daily snapshot).
    const need = v.id === "H2" ? r.H2.windowDays : v.id === "H1" ? r.minWindowDays : v.id === "H4" ? r.H4.windowDays : r.minWindowDays;
    const have = Math.min(v.window.days, need);
    return {
      kind: "coverage",
      share: have / need,
      min: 1,
      valueText: `${have} of ${need} days`,
      needsText: `needs ${need}`,
      sentence: `Needs ${need} days of data; has ${have} (${pct(have / need)}).`,
    };
  }
  const x = v.metric_value;
  switch (v.id) {
    case "H1": {
      const R = r.H1;
      const t = R.maxAbsRho, n = R.notRho;
      const vt = x == null ? "not reported" : `ρ ${x < 0 ? "−" : ""}${Math.abs(x).toFixed(2)}`;
      const inBand = x != null && Math.abs(x) < t;
      return rail(
        [-1, 1],
        [
          { from: -1, to: -t, kind: "Mixed" },
          { from: -t, to: t, kind: "Supported", note: "also needs active-account growth ≥ 0%" },
          { from: t, to: n, kind: "Mixed" },
          { from: n, to: 1, kind: "Not supported" },
        ],
        [
          { at: -t, label: `−${t.toFixed(2)}` },
          { at: t, label: t.toFixed(2) },
          { at: n, label: n.toFixed(2) },
        ],
        x,
        vt,
        `needs |ρ| < ${t.toFixed(2)}`,
        x == null ? "Correlation not reported." : `${vt}, ${inBand ? "inside" : "outside"} the ±${t.toFixed(2)} band Supported needs; ρ ≥ ${n.toFixed(2)} would mean usage tracks price.`,
      );
    }
    case "H2": {
      const R = r.H2;
      const vt = x == null ? "not reported" : `${pct(x)} of days at ≥ ${R.ratio}×`;
      return rail(
        [0, 1],
        [
          { from: 0, to: R.share, kind: "Mixed", note: `Not supported if custody ÷ TVL < ${R.notRatio}× on > ${pct(R.notShare)} of days` },
          { from: R.share, to: 1, kind: "Supported" },
        ],
        [{ at: R.share, label: pct(R.share) }],
        x,
        vt,
        `needs ${pct(R.share)} of days`,
        x == null ? "Share of days not reported." : `${vt}, ${x >= R.share ? "at or above" : "below"} the ${pct(R.share)} needed.`,
      );
    }
    case "H3": {
      const R = r.H3;
      const top = Math.max(10, R.minTokens * 2);
      const vt = x == null ? "not reported" : `${x} token${x === 1 ? "" : "s"}`;
      return rail(
        [0, top],
        [
          { from: 0, to: R.maxTokensNot + 1, kind: "Not supported" },
          { from: R.maxTokensNot + 1, to: R.minTokens, kind: "Mixed" },
          { from: R.minTokens, to: top, kind: "Supported" },
        ],
        [
          { at: R.maxTokensNot + 1, label: String(R.maxTokensNot + 1) },
          { at: R.minTokens, label: String(R.minTokens) },
        ],
        x == null ? null : Math.min(x, top) + 0.5,
        vt,
        `needs ${R.minTokens}`,
        x == null ? "Token count not reported." : `${vt} absorb $${R.sizeUsd / 1000}k at ≤ ${pct(R.maxImpact)} impact; Supported needs ${R.minTokens}, ${R.maxTokensNot} or fewer is Not supported.`,
      );
    }
    case "H4": {
      const R = r.H4;
      const vt = x == null ? "not reported" : pct(x);
      return rail(
        [0, 1],
        [
          { from: 0, to: R.notSupported, kind: "Not supported" },
          { from: R.notSupported, to: R.supported, kind: "Mixed" },
          { from: R.supported, to: 1, kind: "Supported" },
        ],
        [
          { at: R.notSupported, label: pct(R.notSupported) },
          { at: R.supported, label: pct(R.supported) },
        ],
        x,
        `${vt} from verified pools`,
        `needs ${pct(R.supported)}`,
        x == null ? "Volume share not reported." : `${vt} of volume from verified pools, ${x >= R.supported ? "above" : "below"} the ${pct(R.supported)} needed${x < R.notSupported ? ` and under the ${pct(R.notSupported)} floor` : ""}.`,
      );
    }
    case "H5": {
      const m = Math.max(Math.abs(x ?? 0) * 2, 1e5);
      const vt = x == null ? "not reported" : `${usdShort(x)} net, 30 days`;
      return rail(
        [-m, m],
        [
          { from: -m, to: 0, kind: "Not supported", note: "if the 7-day net is also negative; otherwise Mixed" },
          { from: 0, to: m, kind: "Supported", note: "if the 7-day net and 30-day TVL change are also positive; otherwise Mixed" },
        ],
        [{ at: 0, label: "$0" }],
        x,
        vt,
        "needs > $0",
        x == null ? "Net flow not reported." : `${vt}, ${x > 0 ? "above" : "below"} zero.`,
      );
    }
    case "H6": {
      const R = r.H6;
      const vt = x == null ? "not reported" : `${pct(x)} of baseline`;
      return rail(
        [0.4, 1.2],
        [
          { from: 0.4, to: R.failShare, kind: "Not supported" },
          { from: R.failShare, to: R.recoverShare, kind: "Mixed" },
          { from: R.recoverShare, to: 1.2, kind: "Supported" },
        ],
        [
          { at: R.failShare, label: pct(R.failShare) },
          { at: R.recoverShare, label: pct(R.recoverShare) },
        ],
        x,
        vt,
        `needs ${pct(R.recoverShare)}`,
        x == null ? "Recovery ratio not reported." : `${vt} on day ${R.atDay} (the lower of custody and transactions), ${x >= R.recoverShare ? "at or above" : "below"} the ${pct(R.recoverShare)} needed.`,
      );
    }
  }
}

export const VERDICT_WORD: Record<VerdictValue, string> = {
  Supported: "Supported",
  Mixed: "Mixed",
  "Not supported": "Not supported",
  "Insufficient data": "Not enough data yet",
};

/** "3 supported, 2 mixed, 1 not enough data" */
export function verdictSummary(vs: Pick<Verdict, "verdict">[]): string {
  const order: [VerdictValue, string][] = [
    ["Supported", "supported"],
    ["Mixed", "mixed"],
    ["Not supported", "not supported"],
    ["Insufficient data", "not enough data"],
  ];
  return order
    .map(([k, w]) => [vs.filter((v) => v.verdict === k).length, w] as const)
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}`)
    .join(", ");
}
