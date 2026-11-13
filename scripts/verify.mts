/**
 * pnpm verify — re-derive the published snapshot and its verdicts.
 *
 *  1. Offline: schema-validate the latest published snapshot, recompute its sha256, recompute the
 *     verdicts twice (determinism).
 *  2. Online (skipped with --offline): refetch every source, rebuild a snapshot in memory (nothing is
 *     written), and diff it against the published one:
 *       - immutable history (days before the snapshot date): relative tolerance --history-tolerance (default 0.01)
 *       - point-in-time values (custody, TVL, price, depth): --tolerance (default 0.10; live data moves)
 *       - verdicts: must be identical unless --allow-verdict-drift
 *  Prints PASS or the diff; exits 1 on mismatch.
 */
import { listSnapshotDates, readSnapshotFile, snapshotPath } from "../lib/snapshot/io.ts";
import { snapshotHash } from "../lib/snapshot/hash.ts";
import { loadThresholds } from "../lib/thresholds/load.ts";
import { computeVerdicts } from "../lib/thesis/engine.ts";
import type { Snapshot } from "../lib/snapshot/schema.ts";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const tol = Number(arg("--tolerance", "0.10"));
const htol = Number(arg("--history-tolerance", "0.01"));
const offline = process.argv.includes("--offline");
const allowDrift = process.argv.includes("--allow-verdict-drift");
const file = arg("--snapshot", listSnapshotDates().map((d) => snapshotPath(d)).at(-1) ?? "");
const out: string[] = [];
const fail: string[] = [];
const ok = (m: string) => out.push(`  ok    ${m}`);
const bad = (m: string) => (fail.push(m), out.push(`  FAIL  ${m}`));

if (!file) {
  console.log("FAIL: no published snapshot in data/snapshots/");
  process.exit(1);
}
const { snapshot: pub, hashOk } = readSnapshotFile(file);
console.log(`verify ${file}\n  published sha256 ${pub.sha256}`);
if (hashOk) ok("schema valid, sha256 matches content");
else bad(`sha256 mismatch: file says ${pub.sha256}, content hashes to ${snapshotHash(pub)}`);
const th = loadThresholds();
if (pub.thresholds_sha256 === th.sha256) ok(`thresholds sha256 ${th.sha256.slice(0, 12)} matches thresholds/v1.yaml`);
else bad(`thresholds changed since snapshot (${pub.thresholds_sha256.slice(0, 12)} → ${th.sha256.slice(0, 12)})`);
const v1 = computeVerdicts(pub, th.rules, th.t);
const v2 = computeVerdicts(JSON.parse(JSON.stringify(pub)) as Snapshot, th.rules, th.t);
if (JSON.stringify(v1) === JSON.stringify(v2)) ok("verdicts deterministic: " + v1.map((v) => `${v.id}=${v.verdict}`).join(" "));
else bad("verdicts not deterministic");

const rel = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? (a == b ? 0 : Infinity) : a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9));
function cmp(label: string, a: number | null | undefined, b: number | null | undefined, t: number) {
  const r = rel(a, b);
  if (r <= t) ok(`${label}: ${a} vs ${b}`);
  else bad(`${label}: published ${a}, rebuilt ${b} (Δ ${(r * 100).toFixed(2)}% > ${(t * 100).toFixed(1)}%)`);
}
function cmpSeries<T extends { date: string }>(label: string, a: T[], b: T[], key: (x: T) => number | null, before: string) {
  const m = new Map(b.map((x) => [x.date, x]));
  let n = 0, worst = 0, worstDate = "", missing = 0;
  for (const x of a) {
    if (x.date >= before) continue;
    const y = m.get(x.date);
    if (!y) {
      missing++;
      continue;
    }
    n++;
    const r = rel(key(x), key(y));
    if (r > worst) {
      worst = r;
      worstDate = x.date;
    }
  }
  if (n === 0) return ok(`${label}: no overlapping history to compare (${missing} published days not in rebuild window)`);
  if (worst <= htol) ok(`${label}: ${n} historical days match (max Δ ${(worst * 100).toFixed(3)}%)`);
  else bad(`${label}: ${n} days compared, max Δ ${(worst * 100).toFixed(2)}% on ${worstDate} > ${(htol * 100).toFixed(1)}%`);
}

if (!offline) {
  const { buildSnapshot } = await import("../lib/snapshot/build.ts");
  console.log("  rebuilding from live sources (nothing is written)…");
  const fresh = await buildSnapshot({ thresholds: th.t, thresholdsSha: th.sha256, persistHistory: false, log: () => {} });
  console.log(`  rebuilt sha256 ${fresh.sha256} at ${fresh.as_of}`);
  cmpSeries("network active accounts", pub.series.network, fresh.series.network, (x) => x.active, pub.date);
  cmpSeries("NEAR price history", pub.series.network, fresh.series.network, (x) => x.price, pub.date);
  cmpSeries("intents.near daily txns", pub.series.intents_txns, fresh.series.intents_txns, (x) => x.txns, pub.date);
  cmpSeries("custody quantity index (archival)", pub.series.custody_constant, fresh.series.custody_constant.map((x) => ({ ...x })), (x) => x.block, pub.date);
  cmpSeries("RHEA AMM TVL history", pub.series.rhea_tvl, fresh.series.rhea_tvl, (x) => x.amm, addDaysLocal(pub.date, -2));
  cmp("intents custody USD", pub.intents.custody_usd, fresh.intents.custody_usd, tol);
  cmp("RHEA clean TVL USD", pub.rhea.clean_tvl_usd, fresh.rhea.clean_tvl_usd, tol);
  cmp("RHEA rejected pools", pub.rhea.rejected_count, fresh.rhea.rejected_count, tol);
  const vf = computeVerdicts(fresh, th.rules, th.t);
  for (const a of v1) {
    const b = vf.find((x) => x.id === a.id)!;
    if (a.verdict === b.verdict) ok(`${a.id} verdict ${a.verdict} reproduced (metric ${a.metric_label} → ${b.metric_label})`);
    else if (allowDrift) ok(`${a.id} verdict drifted ${a.verdict} → ${b.verdict} (allowed by --allow-verdict-drift)`);
    else bad(`${a.id} verdict ${a.verdict} → ${b.verdict} (metric ${a.metric_label} → ${b.metric_label})`);
  }
}
function addDaysLocal(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
console.log(out.join("\n"));
console.log(fail.length ? `\nFAIL (${fail.length} mismatch${fail.length > 1 ? "es" : ""})` : "\nPASS");
process.exit(fail.length ? 1 : 0);
