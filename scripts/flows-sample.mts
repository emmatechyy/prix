/**
 * Sample NEAR Intents flow buckets into data/history/intents-flow-buckets.json.
 *   pnpm flows                 → one live bucket + any empty 3-hourly grid slots in the last 31 days
 *   pnpm flows --max-calls 20  → cap NearBlocks calls (the 30-minute GitHub Action uses a small cap)
 */
import { updateFlowBuckets } from "../lib/history/flows.ts";
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
await updateFlowBuckets({ maxCalls: Number(arg("--max-calls") ?? 400), days: Number(arg("--days") ?? 31) });
