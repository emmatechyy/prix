/**
 * pnpm verify — re-derive the published snapshot and its verdicts.
 *
 *  Source: the latest snapshot on the `data` branch (raw GitHub URL), falling back to the newest
 *  snapshot bundled in data/snapshots/ if the data branch cannot be read. --snapshot <file> or
 *  --bundled pins a local file.
 *
 *  1. Offline: schema-validate the latest published snapshot, recompute its sha256, recompute the
 *     verdicts twice (determinism).
 *  2. Online (skipped with --offline): refetch every source, rebuild a snapshot in memory (nothing is
 *     written), and diff it against the published one:
 *       - immutable history (days before the snapshot date): relative tolerance --history-tolerance (default 0.01)
 *       - point-in-time values (custody, TVL, price, depth): --tolerance (default 0.10; live data moves)
 *       - verdicts: must be identical unless --allow-verdict-drift
 *  --claim H4 also prints the re-derived figures for one claim.
 *  Prints PASS or the diff; exits 1 on mismatch.
 */
import { listSnapshotDates, parseSnapshot, readSnapshotFile, snapshotPath } from "../lib/snapshot/io.ts";
import { DATA_RAW, fetchManifest } from "../lib/snapshot/remote.ts";
import { h4Breakdown } from "../lib/thesis/engine.ts";
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
const bundledFile = listSnapshotDates().map((d) => snapshotPath(d)).reverse().find((f) => {
  try {
    readSnapshotFile(f);
    return true;
  } catch {
    return false;
  }
});
let file = arg("--snapshot", "");
let loaded: ReturnType<typeof readSnapshotFile> | null = null;
if (!file && !process.argv.includes("--bundled")) {
  const m = await fetchManifest();
  if (m?.latest) {
    try {
      const url = `${DATA_RAW}/snapshots/${m.latest}.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loaded = parseSnapshot(await res.text());
      file = url;
    } catch (e) {
      console.log(`  data branch snapshot unreadable (${e instanceof Error ? e.message : e}); falling back to the bundled copy`);
    }
  } else console.log("  data branch manifest unreadable; falling back to the bundled copy");
}
if (!file) file = bundledFile ?? "";
const out: string[] = [];
const fail: string[] = [];
const ok = (m: string) => out.push(`  ok    ${m}`);
const bad = (m: string) => (fail.push(m), out.push(`  FAIL  ${m}`));

if (!file) {
  console.log("FAIL: no published snapshot in data/snapshots/");
  process.exit(1);
}
const { snapshot: pub, hashOk } = loaded ?? readSnapshotFile(file);
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
// --claim H4: print the re-derived figures for one claim (the command shown in each evidence panel).
const only = arg("--claim", "").toUpperCase();
if (only) {
  const v = v1.find((x) => x.id === only);
  if (!v) bad(`--claim ${only}: no such claim (H1–H6)`);
  else {
    out.push(`  ${v.id}  ${v.claim}`, `        verdict ${v.verdict} · ${v.metric_label} = ${v.metric_value ?? "not reported"} · window ${v.window.from}..${v.window.to} (${v.window.days}d) · n=${v.sample_size}`);
    if (v.coverage) out.push(`        coverage ${(v.coverage.share * 100).toFixed(2)}% (${v.coverage.hours.toFixed(1)} of ${v.coverage.window_hours} h; needs ${(v.coverage.min * 100).toFixed(0)}%)`);
    for (const e of v.evidence) out.push(`        - ${e.label}: ${e.value}`);
  }
}

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
  const hp = h4Breakdown(pub.series.pool_volume_all, pub.rhea.clean_tvl_usd, th.rules.H4);
  const hf = h4Breakdown(fresh.series.pool_volume_all, fresh.rhea.clean_tvl_usd, th.rules.H4);
  cmp("H4 all-pool window volume (denominator)", hp?.total, hf?.total, tol);
  cmp("H4 verified-pool share", hp?.share, hf?.share, tol);
  const vf = computeVerdicts(fresh, th.rules, th.t);
  for (const a of v1) {
    const b = vf.find((x) => x.id === a.id)!;
    if (a.verdict === b.verdict) ok(`${a.id} verdict ${a.verdict} reproduced (${a.metric_label}: ${fmtv(a.metric_value)} → ${fmtv(b.metric_value)})`);
    else if (allowDrift) ok(`${a.id} verdict drifted ${a.verdict} → ${b.verdict} (allowed by --allow-verdict-drift)`);
    else bad(`${a.id} verdict ${a.verdict} → ${b.verdict} (${a.metric_label}: ${fmtv(a.metric_value)} → ${fmtv(b.metric_value)})`);
  }
}
function fmtv(v: number | null) {
  return v == null ? "not reported" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(4);
}
function addDaysLocal(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
console.log(out.join("\n"));
console.log(fail.length ? `\nFAIL (${fail.length} mismatch${fail.length > 1 ? "es" : ""})` : "\nPASS");
process.exit(fail.length ? 1 : 0);
