import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseThresholds } from "../lib/thresholds/load";

const text = readFileSync("thresholds/v1.yaml", "utf8");
describe("thresholds/v1.yaml", () => {
  it("validates and compiles", () => {
    const l = parseThresholds(text);
    expect(l.t.version).toBe(1);
    expect(l.rules.H1.maxAbsRho).toBe(0.3);
    expect(l.rules.H3.sizeUsd).toBe(100_000);
    expect(l.rules.H6.incidentDate).toBe("2026-10-01");
    expect(l.rules.index.max_price_impact_10k).toBe(0.1);
  });
  it("is DRAFT until locked_at_commit is a SHA", () => expect(parseThresholds(text).locked).toBe(false));
  it("rejects a reworded rule (no silent defaults)", () => expect(() => parseThresholds(text.replace("abs(rho) < 0.30", "rho small"))).toThrow(/H1.supported/));
  it("rejects weights that do not sum to 1", () => expect(() => parseThresholds(text.replace("depth: 0.30", "depth: 0.50"))).toThrow());
});
