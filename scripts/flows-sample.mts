/**
 * Page NEAR Intents events into data/history/intents-flow-buckets.json with a stored cursor.
 *   pnpm flows                 → page back from now to the high-water mark, then into open gaps
 *   pnpm flows --max-calls 30  → cap NearBlocks calls per run (the 30-minute GitHub Action uses this)
 */
import { updateFlowBuckets } from "../lib/history/flows.ts";
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
await updateFlowBuckets({ maxCalls: Number(arg("--max-calls") ?? 30), pauseMs: Number(arg("--pause-ms") ?? 2500) });
process.exit(0);
