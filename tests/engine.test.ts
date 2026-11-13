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
  const row = (token: string, slip: number | null, status: DepthRow["status"] = "ok"): DepthRow => ({ route: "intents", router: "1click-dry", origin: "BTC", destination_token: token, token_id: token, size_usd: 100_000, amount_in_usd: 1e5, amount_out_usd: 1e5, fee_usd: 0, relative_slippage: slip, quote_ms: 100, status, fetched_at: AS_OF });
  const s = (rows: DepthRow[]) => baseSnapshot({ depth: rows });
  it("Supported: ≥5 tokens ≤1%", () => expectV(s(["a", "b", "c", "d", "e"].map((x) => row(x, 0.005))), "H3", "Supported"));
  it("Not supported: ≤1 token", () => expectV(s([row("a", 0.005), row("b", 0.05)]), "H3", "Not supported"));
  it("Mixed: 3 tokens", () => expectV(s(["a", "b", "c", "d"].map((x, i) => row(x, i < 3 ? 0.005 : 0.2))), "H3", "Mixed"));
  it("Insufficient: every quote failed", () => expectV(s([row("a", null, "error"), row("b", null, "paused")]), "H3", "Insufficient data"));
  it("wNEAR never counts", () => expectV(s(["wrap.near", "a"].map((x) => row(x, 0.001))), "H3", "Not supported"));
});

describe("H4 organic volume", () => {
  const pv = (share: number, n = 30) => days(n).map((date) => ({ date, total_usd: 100, organic_usd: 100 * share, pools: 5 }));
  it("Supported", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, pool_volume: pv(0.9) } }), "H4", "Supported"));
  it("Not supported", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, pool_volume: pv(0.5) } }), "H4", "Not supported"));
  it("Mixed", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, pool_volume: pv(0.7) } }), "H4", "Mixed"));
  it("Insufficient", () => expectV(baseSnapshot({ series: { ...baseSnapshot().series, pool_volume: pv(0.9, 10) } }), "H4", "Insufficient data"));
});

describe("H5 fresh capital", () => {
  const end = Date.parse(AS_OF);
  const buckets = (net7: number, netOld: number, events = 300, span = 30) =>
    Array.from({ length: span * 2 }, (_, i) => {
      const t = end - (i + 0.5) * 12 * 3600000;
      const recent = i < 14;
      const net = recent ? net7 : netOld;
      return { start: new Date(t).toISOString(), end: new Date(t + 60000).toISOString(), events, deposits_usd: Math.max(net, 0), withdrawals_usd: Math.max(-net, 0), mints: 1, burns: 1, unpriced: 0, source: "x" };
    }).filter((b) => Date.parse(b.start) >= end - span * 86400000);
  const tvl = (chg: number) => [{ date: addDays("2026-11-13", -31), amm: 100, lending: 0 }, { date: "2026-11-13", amm: 100 * (1 + chg), lending: 0 }];
  const s = (b: ReturnType<typeof buckets>, chg: number) => baseSnapshot({ series: { ...baseSnapshot().series, flow_buckets: b, rhea_tvl: tvl(chg) } });
  it("Supported", () => expectV(s(buckets(10, 10), 0.1), "H5", "Supported"));
  it("Not supported", () => expectV(s(buckets(-10, -10), 0.1), "H5", "Not supported"));
  it("Mixed", () => expectV(s(buckets(-10, 50), 0.1), "H5", "Mixed"));
  it("Insufficient: too few events", () => expectV(s(buckets(10, 10, 10), 0.1), "H5", "Insufficient data"));
  it("Insufficient: window shorter than 30 days", () => expectV(s(buckets(10, 10, 1000, 5), 0.1), "H5", "Insufficient data"));
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
