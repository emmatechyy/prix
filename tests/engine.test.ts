import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseThresholds } from "../lib/thresholds/load";
import { computeVerdicts, type VerdictValue } from "../lib/thesis/engine";
import type { Snapshot, DepthRow } from "../lib/snapshot/schema";
import { baseSnapshot, days, AS_OF } from "./fixtures";
import { addDays } from "../lib/thesis/stats";

const { t, rules } = parseThresholds(readFileSync("thresholds/v1.yaml", "utf8"));
const v = (s: Snapshot, id: string) => computeVerdicts(s, rules, t).find((x) => x.id === id)!;
const expectV = (s: Snapshot, id: string, want: VerdictValue) => expect(v(s, id).verdict).toBe(want);

// Deterministic pseudo-random noise so fixtures are stable.
const noise = (i: number) => Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453);

describe("H1 usage vs price", () => {
  const net = (active: (i: number) => number, price: (i: number) => number, n = 180) => days(n).map((date, i) => ({ date, active: active(i), txns: 1, price: price(i) }));
  it("Supported: independent series, usage growing", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, network: net((i) => 1000 + i * 2 + noise(i) * 50, (i) => 3 + Math.sin(i / 9) * 0.5) } }), "H1", "Supported"));
  it("Not supported: usage tracks price", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, network: net((i) => 1000 + i * 5, (i) => 2 + i * 0.01) } }), "H1", "Not supported"));
  it("Mixed: independent but usage falling", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, network: net((i) => 2000 - i * 3 + noise(i) * 50, (i) => 3 + Math.sin(i / 9) * 0.5) } }), "H1", "Mixed"));
  it("Insufficient: fewer days than min_window_days", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, network: net((i) => 1000 + i, () => 3, 20) } }), "H1", "Insufficient data"));
});

describe("H2 custody vs clean TVL", () => {
  const h2 = (ratio: (i: number) => number, n = 30) => days(n).map((date, i) => ({ date, custody_usd: ratio(i) * 40e6, clean_tvl_usd: 40e6, ratio: ratio(i), snapshot_sha256: "h" + i }));
  it("Supported: ≥2× on ≥80% of days", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, h2_daily: h2((i) => (i < 3 ? 1.5 : 2.5)) } }), "H2", "Supported"));
  it("Not supported: <1× on >50% of days", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, h2_daily: h2((i) => (i < 20 ? 0.8 : 2.5)) } }), "H2", "Not supported"));
  it("Mixed: in between", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, h2_daily: h2(() => 1.5) } }), "H2", "Mixed"));
  it("Insufficient: window not filled", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, h2_daily: h2(() => 3, 5) } }), "H2", "Insufficient data"));
  it("lists every day's snapshot hash", () => expect(v(baseSnapshot({ series: { ...baseSnapshot().series, h2_daily: h2(() => 3) } }), "H2").snapshot_hashes.length).toBe(31));
});

describe("H3 depth", () => {
  const row = (token: string, slip: number | null, status: DepthRow["status"] = "ok"): DepthRow => ({ route: "intents", router: "1click-dry", router_version: "1Click API v0 · dry quote", app_fee_bps: 20, origin: "BTC", destination_token: token, token_id: token, size_usd: 100_000, amount_in_usd: 1e5, amount_out_usd: 1e5, fee_usd: 0, relative_slippage: slip, quote_ms: 100, status, fetched_at: AS_OF });
  const s = (rows: DepthRow[]) => baseSnapshot({ depth: rows });
  it("Supported: ≥5 tokens ≤1%", () => expectV(s(["a", "b", "c", "d", "e"].map((x) => row(x, 0.005))), "H3", "Supported"));
  it("Not supported: ≤1 token", () => expectV(s([row("a", 0.005), row("b", 0.05)]), "H3", "Not supported"));
  it("Mixed: 3 tokens", () => expectV(s(["a", "b", "c", "d"].map((x, i) => row(x, i < 3 ? 0.005 : 0.2))), "H3", "Mixed"));
  it("Insufficient: every quote failed", () => expectV(s([row("a", null, "error"), row("b", null, "paused")]), "H3", "Insufficient data"));
  it("wNEAR never counts", () => expectV(s(["wrap.near", "a"].map((x) => row(x, 0.001))), "H3", "Not supported"));
});

describe("H4 volume from verified pools, all-pool denominator", () => {
  type Row = NonNullable<Snapshot["series"]["pool_volume_all"]>["rows"][number];
  const row = (id: string, perDay: number, tvl: number, rejected = false, n = 30): Row => ({ id, pair: id, kind: "AMM", tvl_usd: tvl, rejected, token_flagged: false, daily: Array(n).fill(perDay) });
  const pva = (rows: Row[], n = 30) => ({ dates: days(n), pools_live: rows.length + 10, pools_unreported: 0, protocol_volume_24h_usd: null, all_pool_volume_last_day_usd: null, rows });
  // clean TVL in the fixture is $40M; pools below are far from the wash thresholds unless stated.
  const many = (k: number, perDay: number) => Array.from({ length: k }, (_, i) => row(`c${i}`, perDay, 4e6));
  const s = (rows: Row[], n = 30) => baseSnapshot({ series: { ...baseSnapshot().series, pool_volume_all: pva(rows, n) } });
  it("Supported: rejected pools carry little volume", () => expectV(s([...many(10, 1e5), row("r", 1e4, 1e6, true)]), "H4", "Supported"));
  it("Not supported: rejected pools carry most volume (denominator includes them)", () => expectV(s([...many(10, 1e4), row("r", 2e5, 1e6, true)]), "H4", "Not supported"));
  it("turnover flag removes a pool from the numerator", () => {
    const vv = v(s([...many(10, 1e5), row("hot", 5e5, 1e5)]), "H4"); // 5× daily turnover, > max 2.0
    expect(vv.metric_value).toBeCloseTo(1e6 / 1.5e6, 5);
    expect(vv.verdict).toBe("Mixed");
  });
  it("concentration flag: big volume share on a small TVL share", () => {
    const vv = v(s([...many(10, 1e5), row("conc", 9e5, 5e5)]), "H4"); // 47% of volume, 1.25% of clean TVL, turnover 1.8
    expect(vv.metric_value).toBeCloseTo(1e6 / 1.9e6, 5);
    expect(vv.verdict).toBe("Not supported");
  });
  it("Insufficient: window shorter than 30 days", () => expectV(s(many(10, 1e5).map((r) => ({ ...r, daily: r.daily.slice(0, 10) })), 10), "H4", "Insufficient data"));
  it("Insufficient: no table", () => expectV(baseSnapshot(), "H4", "Insufficient data"));
});

describe("H5 fresh capital", () => {
  const end = Date.parse(AS_OF);
  // Contiguous 12-hour pages (full coverage) unless `lenMs` makes each page shorter.
  const buckets = (net7: number, netOld: number, events = 300, span = 30, lenMs = 12 * 3600000) =>
    Array.from({ length: span * 2 }, (_, i) => {
      const t = end - (i + 1) * 12 * 3600000;
      const recent = i < 14;
      const net = recent ? net7 : netOld;
      return { start: new Date(t).toISOString(), end: new Date(t + lenMs).toISOString(), events, deposits_usd: Math.max(net, 0), withdrawals_usd: Math.max(-net, 0), mints: 1, burns: 1, unpriced: 0, source: "x" };
    }).filter((b) => Date.parse(b.start) >= end - span * 86400000);
  const tvl = (chg: number) => [{ date: addDays("2026-11-13", -31), amm: 100, lending: 0 }, { date: "2026-11-13", amm: 100 * (1 + chg), lending: 0 }];
  const s = (b: ReturnType<typeof buckets>, chg: number) => baseSnapshot({ series: { ...baseSnapshot().series, flow_buckets: b, rhea_tvl: tvl(chg) } });
  it("Supported", () => expectV(s(buckets(10, 10), 0.1), "H5", "Supported"));
  it("Not supported", () => expectV(s(buckets(-10, -10), 0.1), "H5", "Not supported"));
  it("Mixed", () => expectV(s(buckets(-10, 50), 0.1), "H5", "Mixed"));
  it("Insufficient: too few events", () => expectV(s(buckets(10, 10, 10), 0.1), "H5", "Insufficient data"));
  it("Insufficient: window shorter than 30 days", () => expectV(s(buckets(10, 10, 1000, 5), 0.1), "H5", "Insufficient data"));
  it("Insufficient: ~4 hours observed over 30 days (coverage < min_coverage), however many events", () => {
    const vv = v(s(buckets(10, 10, 5000, 30, 4 * 60000), 0.1), "H5"); // 60 pages × 4 min = 4 h
    expect(vv.verdict).toBe("Insufficient data");
    expect(vv.coverage!.share).toBeCloseTo(4 / 720, 3);
    expect(vv.insufficient_reason).toMatch(/coverage/);
  });
  it("Insufficient: 7-day window under-covered even when 30d is covered", () => {
    const b = buckets(10, 10).filter((x) => Date.parse(x.end) < end - 3 * 86400000 || Date.parse(x.end) > end - 1 * 86400000);
    expectV(s(b, 0.1), "H5", "Insufficient data");
  });
});

describe("coverage helpers", () => {
  it("union of overlapping intervals", async () => {
    const { observedCoverage, nonOverlapping } = await import("../lib/history/coverage");
    const e = Date.parse("2026-11-02T00:00:00Z");
    const iso = (h: number) => new Date(e - h * 3600000).toISOString();
    const b = [{ start: iso(10), end: iso(8) }, { start: iso(9), end: iso(6) }, { start: iso(3), end: iso(2) }];
    expect(observedCoverage(b, e, 1).hours).toBeCloseTo(5, 6);
    expect(nonOverlapping(b).length).toBe(2);
  });
});

describe("H6 incident recovery", () => {
  const series = (cAt: number, tAt: number) => {
    const ds = days(60, "2026-11-10");
    return {
      ...baseSnapshot().series,
      custody_constant: ds.map((date) => ({ date, usd: date === "2026-10-31" ? cAt : 100, block: 1, assets: 5 })),
      intents_txns: ds.map((date) => ({ date, txns: date === "2026-10-31" ? tAt : 1000 })),
    };
  };
  it("Supported", () => expectV(baseSnapshot({ series: series(95, 950) }), "H6", "Supported"));
  it("Not supported", () => expectV(baseSnapshot({ series: series(60, 950) }), "H6", "Not supported"));
  it("Mixed", () => expectV(baseSnapshot({ series: series(80, 950) }), "H6", "Mixed"));
  it("Insufficient: no pre-incident baseline", () => expectV(baseSnapshot({ series: { ...series(95, 950), custody_constant: [] } }), "H6", "Insufficient data"));
});

describe("engine is deterministic", () => {
  it("same input → same output", () => {
    const s = baseSnapshot();
    expect(JSON.stringify(computeVerdicts(s, rules, t))).toBe(JSON.stringify(computeVerdicts(s, rules, t)));
  });
});
