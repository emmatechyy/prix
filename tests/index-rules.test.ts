import { describe, expect, it } from "vitest";
import { applyIndexRules } from "@/lib/model/index-rules";

const rules = { min_liquidity_usd: 50_000, max_price_impact_10k: 0.1 };
describe("index rules", () => {
  it("marks thin, unmeasured and high-impact tokens low confidence and ranks them last", () => {
    const out = applyIndexRules(
      [
        { id: "deep", score: 50, liquidity: 1e6, impact10k: 0.01, impactRoute: "router" },
        { id: "unmeasured", score: 99, liquidity: 1e6, impact10k: null, impactRoute: null },
        { id: "thin", score: 90, liquidity: 10_000, impact10k: 0.01, impactRoute: "router" },
        { id: "slippy", score: 80, liquidity: 1e6, impact10k: 0.5, impactRoute: "router" },
        { id: "noscore", score: null, liquidity: 1e6, impact10k: 0.01, impactRoute: "router" },
      ],
      rules,
    );
    const by = Object.fromEntries(out.map((r) => [r.id, r]));
    expect(by.deep).toMatchObject({ confidence: "high", rank: 1 });
    expect(by.unmeasured.confidence).toBe("low");
    expect(by.unmeasured.rank).toBeGreaterThan(by.deep.rank!);
    expect(by.thin.reasons[0]).toMatch(/liquidity/);
    expect(by.slippy.reasons[0]).toMatch(/50\.0% > 10%/);
    expect(by.noscore.rank).toBeNull();
  });
  it("uses a better Intents measurement when one exists", () => {
    const out = applyIndexRules([{ id: "a", score: 10, liquidity: 1e6, impact10k: 0.3, impactRoute: "router" }], rules, new Map([["a", { impact: 0.02, route: "intents" }]]));
    expect(out[0]).toMatchObject({ confidence: "high", bestImpact10k: 0.02, bestRoute: "intents" });
  });
});
