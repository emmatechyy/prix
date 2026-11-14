/**
 * Build and publish today's snapshot: data/snapshots/YYYY-MM-DD.json (+ sha256 inside).
 *   pnpm snapshot:daily            → write the file
 *   pnpm snapshot:daily --stdout   → print instead of writing (used by `pnpm verify`)
 */
import { loadThresholds } from "../lib/thresholds/load.ts";
import { buildSnapshot } from "../lib/snapshot/build.ts";
import { writeSnapshot } from "../lib/snapshot/io.ts";

const { t, sha256 } = loadThresholds();
const s = await buildSnapshot({ thresholds: t, thresholdsSha: sha256 });
if (process.argv.includes("--stdout")) process.stdout.write(JSON.stringify(s, null, 1) + "\n");
else {
  const p = writeSnapshot(s);
  console.error(`wrote ${p} · sha256 ${s.sha256} · ${s.depth_meta.quotes_ok}/${s.depth.length} depth rows ok · ${s.errors.length} errors`);
}
process.exit(0);
