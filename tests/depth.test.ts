import { describe, expect, it } from "vitest";
import { applyBaselines, bestImpact, relativeSlippage, statusFromError, usdToBaseUnits } from "@/lib/depth/slippage";
import type { DepthRow } from "@/lib/snapshot/schema";

const row = (p: Partial<DepthRow>): DepthRow => ({
  route: "intents", router: "1click-dry", origin: "ETH", destination_token: "nep141:x", token_id: "x", size_usd: 1000,
  amount_in_usd: 1000, amount_out_usd: 990, fee_usd: 2, relative_slippage: null, quote_ms: 400, status: "ok", fetched_at: "2026-11-13T00:00:00Z", ...p,
});

describe("relative slippage", () => {
  it("is zero when the rate matches the baseline and fixed fees cancel", () => {
    expect(relativeSlippage(10_000, 9_900, 1_000, 990)).toBeCloseTo(0, 12);
  });
  it("measures the rate loss vs the $1k quote", () => {
    expect(relativeSlippage(100_000, 97_020, 1_000, 990)).toBeCloseTo(0.02, 10);
  });
  it("reports a better-than-baseline rate as negative, not clamped", () => {
    expect(relativeSlippage(10_000, 9_950, 1_000, 990)!).toBeLessThan(0);
  });
  it("returns null on missing inputs", () => {
    expect(relativeSlippage(0, 1, 1, 1)).toBeNull();
  });
  it("fills rows from the same route's baseline only", () => {
    const rows = applyBaselines([
      row({}),
      row({ size_usd: 100_000, amount_in_usd: 100_000, amount_out_usd: 98_010 }),
      row({ origin: "BTC", size_usd: 100_000, amount_in_usd: 100_000, amount_out_usd: 98_010 }), // no BTC baseline
      row({ size_usd: 1_000_000, status: "no-route", amount_in_usd: null, amount_out_usd: null }),
    ]);
    expect(rows[0].relative_slippage).toBe(0);
    expect(rows[1].relative_slippage).toBeCloseTo(0.01, 10);
    expect(rows[2].relative_slippage).toBeNull();
    expect(rows[3].relative_slippage).toBeNull();
    expect(bestImpact(rows, "x", 100_000)!.impact).toBeCloseTo(0.01, 10);
    expect(bestImpact(rows, "x", 1_000_000)).toBeNull();
  });
});

describe("status mapping", () => {
  it.each([
    [400, "No liquidity available", "no-route"],
    [400, "tokenOut is not valid", "no-route"],
    [null, "No route", "no-route"],
    [429, "Too Many Requests", "rate-limited"],
    [503, "Service paused for maintenance", "paused"],
    [401, "Unauthorized", "not-configured"],
    [500, "Internal error", "error"],
    [null, "This operation was aborted", "error"],
  ] as const)("%s %s → %s", (code, msg, want) => {
    expect(statusFromError(code, msg)).toBe(want);
  });
});

describe("usdToBaseUnits", () => {
  it("is exact to the token decimals", () => {
    expect(usdToBaseUnits(1000, 2000, 18)).toBe("500000000000000000");
    expect(usdToBaseUnits(100_000, 50_000, 8)).toBe("200000000");
    expect(usdToBaseUnits(1, 3, 6)).toBe("333333");
  });
});
