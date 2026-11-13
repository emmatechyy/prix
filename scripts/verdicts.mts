/**
 * Offline verdicts from a snapshot file. No network.
 *   pnpm verdicts                                   → latest data/snapshots/*.json
 *   pnpm verdicts --snapshot data/snapshots/2026-11-13.json [--json]
 */
import { listSnapshotDates, readSnapshotFile, snapshotPath } from "../lib/snapshot/io.ts";
import { loadThresholds } from "../lib/thresholds/load.ts";
import { computeVerdicts } from "../lib/thesis/engine.ts";

const i = process.argv.indexOf("--snapshot");
const file = i > 0 ? process.argv[i + 1] : listSnapshotDates().map((d) => snapshotPath(d)).at(-1);
if (!file) {
  console.error("no snapshot found in data/snapshots/");
  process.exit(2);
}
const { snapshot, hashOk } = readSnapshotFile(file);
const th = loadThresholds();
if (snapshot.thresholds_sha256 !== th.sha256) console.error(`warning: snapshot was built with thresholds sha256 ${snapshot.thresholds_sha256.slice(0, 12)}, current file is ${th.sha256.slice(0, 12)}`);
const v = computeVerdicts(snapshot, th.rules, th.t);
if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ snapshot: file, sha256: snapshot.sha256, hash_ok: hashOk, thresholds: th.locked ? "locked" : "DRAFT, not locked", verdicts: v }, null, 1) + "\n");
} else {
  console.log(`snapshot ${file} · sha256 ${snapshot.sha256.slice(0, 12)} ${hashOk ? "(hash OK)" : "(HASH MISMATCH)"} · thresholds v${th.t.version} ${th.locked ? "locked" : "DRAFT, not locked"}`);
  for (const x of v) console.log(`${x.id}  ${x.verdict.padEnd(17)} ${x.metric_label}${x.insufficient_reason ? `  — ${x.insufficient_reason}` : ""}`);
}
process.exit(hashOk ? 0 : 1);
