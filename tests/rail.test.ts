import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseThresholds } from "../lib/thresholds/load";
import type { Verdict } from "../lib/thesis/engine";
import { railFor, verdictSummary } from "../lib/thesis/rail";
import { flagText, plain } from "../lib/copy";

const { rules } = parseThresholds(readFileSync("thresholds/v1.yaml", "utf8"));
const base: Verdict = {
  id: "H4", claim: "", metric: "", verdict: "Not supported", metric_value: 0.406, metric_label: "volume share from verified pools",
  threshold_supported: ">= 80%", threshold_not_supported: "< 60%", margin_to_next: "", flip_condition: "", evidence_grade: "B",
  window: { from: "2026-10-15", to: "2026-11-13", days: 30 }, sample_size: 1, snapshot_hashes: ["x"], evidence: [],
};

describe("threshold rail model", () => {
  it("H4: zones come from thresholds, marker sits in the Not supported zone", () => {
    const m = railFor(base, rules);
    if (m.kind !== "rail") throw new Error("expected rail");
    expect(m.zones.map((z) => [z.kind, z.from, z.to])).toEqual([["Not supported", 0, 0.6], ["Mixed", 0.6, 0.8], ["Supported", 0.8, 1]]);
    expect(m.pos).toBeCloseTo(0.406);
    expect(m.sentence).toBe("41% of volume from verified pools, below the 80% needed and under the 60% floor.");
  });
  it("H5 with low coverage shows a coverage bar, not a rail", () => {
    const m = railFor({ ...base, id: "H5", verdict: "Insufficient data", coverage: { share: 0.005, hours: 4.2, window_hours: 720, min: 0.8 } }, rules);
    expect(m.kind).toBe("coverage");
    expect(m.sentence).toMatch(/Needs 80% of .* observed; has 0\.5%/);
  });
  it("H2 window shortfall reports days", () => {
    const m = railFor({ ...base, id: "H2", verdict: "Insufficient data", window: { from: "a", to: "b", days: 2 } }, rules);
    expect(m.kind === "coverage" && m.sentence).toBe("Needs 30 days of data; has 2 (7%).");
  });
  it("marker is clamped to the track", () => {
    const m = railFor({ ...base, id: "H6", verdict: "Supported", metric_value: 3 }, rules);
    expect(m.kind === "rail" && m.pos).toBe(1);
  });
  it("summary and copy terms", () => {
    expect(verdictSummary([{ verdict: "Supported" }, { verdict: "Mixed" }, { verdict: "Mixed" }, { verdict: "Insufficient data" }])).toBe("1 supported, 2 mixed, 1 not enough data");
    expect(plain("RHEA clean TVL")).toBe("RHEA TVL (verified pools)");
    expect(flagText("unanchored-pair")).toBe("Priced against a token with no reliable price");
  });
});
