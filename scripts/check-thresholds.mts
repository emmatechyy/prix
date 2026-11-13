/** Build gate: validates thresholds/v1.yaml against the zod schema and rule grammar. Exits 1 on failure. */
import { loadThresholds } from "../lib/thresholds/load.ts";
try {
  const l = loadThresholds();
  console.log(`thresholds v${l.t.version} OK · sha256 ${l.sha256.slice(0, 12)} · ${l.locked ? `locked at ${l.t.locked_at_commit}` : "DRAFT, not locked"}`);
} catch (e) {
  console.error("thresholds/v1.yaml is invalid:\n", e instanceof Error ? e.message : e);
  process.exit(1);
}
