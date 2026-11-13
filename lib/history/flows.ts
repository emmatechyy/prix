import "server-only";
import { fetchJson } from "../http";
import { NEARBLOCKS } from "../sources/endpoints";
import type { IntentsEvent } from "../sources/near";
import type { FlowBucket } from "../snapshot/schema";
import { units } from "../format";
import { readHistory, writeHistory } from "./store";

/**
 * Sampled NEAR Intents flow buckets. Each bucket is one page (≤100 events) of intents.near token
 * events read at a fixed anchor time; MINT = deposit, BURN = withdrawal, valued at the event's price.
 * Buckets are samples, not totals: PRIX sums them and states the sampled minutes, never extrapolates.
 */
export const FLOWS_FILE = "intents-flow-buckets.json";
const nbHeaders = (): Record<string, string> => (process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {});
export const flowsUrl = (beforeNs?: string) => `${NEARBLOCKS}/v3/intents/txns?limit=100${beforeNs ? `&before_ts=${beforeNs}` : ""}`;

export function bucketFromEvents(ev: IntentsEvent[], source: string): FlowBucket | null {
  if (!ev.length) return null;
  let first = Infinity, last = 0, dep = 0, wd = 0, mints = 0, burns = 0, unpriced = 0;
  for (const e of ev) {
    const ts = Number(e.block_timestamp) / 1e6;
    first = Math.min(first, ts);
    last = Math.max(last, ts);
    if (e.cause !== "MINT" && e.cause !== "BURN") continue;
    if (e.cause === "MINT") mints++;
    else burns++;
    const dec = e.base_meta?.decimals;
    const px = e.price == null ? NaN : Number(e.price);
    if (dec == null || !Number.isFinite(px)) {
      unpriced++;
      continue;
    }
    const v = Math.abs(units(e.delta_amount.replace("-", ""), dec)) * px;
    if (e.cause === "MINT") dep += v;
    else wd += v;
  }
  return { start: new Date(first).toISOString(), end: new Date(last).toISOString(), events: ev.length, deposits_usd: dep, withdrawals_usd: wd, mints, burns, unpriced, source };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sample one bucket ending at `anchorMs` (or now). */
export async function sampleBucket(anchorMs?: number): Promise<FlowBucket | null> {
  const url = flowsUrl(anchorMs ? `${BigInt(Math.floor(anchorMs)) * 1_000_000n}` : undefined);
  const r = await fetchJson<{ data: IntentsEvent[] }>(url, { revalidate: 0, headers: nbHeaders(), timeoutMs: 25000 });
  return bucketFromEvents(r.data, url.replace(/&?before_ts=\d+/, "") + (anchorMs ? `&before_ts=${BigInt(Math.floor(anchorMs)) * 1_000_000n}` : ""));
}

export type FlowHistory = { buckets: FlowBucket[] };
/**
 * Fill buckets on a fixed grid (every `stepHours`) over the last `days`, plus one at now.
 * Existing grid slots are skipped, so the job is incremental and resumable.
 */
export async function updateFlowBuckets({ days = 31, stepHours = 3, nowMs = Date.now(), maxCalls = 400, pauseMs = 1200, log = console.error } = {}) {
  const h = readHistory<FlowHistory>(FLOWS_FILE, { buckets: [] });
  const have = (t: number) => h.buckets.some((b) => Math.abs(Date.parse(b.end) - t) < 30 * 60000);
  const slots: number[] = [];
  const step = stepHours * 3600000;
  const gridEnd = Math.floor(nowMs / step) * step;
  for (let t = gridEnd; t > nowMs - days * 86400000; t -= step) if (!have(t)) slots.push(t);
  let calls = 0, ok = 0, filled = 0;
  const tryOnce = async (t?: number) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        calls++;
        return await sampleBucket(t);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/429/.test(msg)) await sleep(15000 * (attempt + 1));
        else throw e;
      }
    }
    return null;
  };
  const live = await tryOnce().catch(() => null);
  if (live && !h.buckets.some((b) => b.end === live.end)) {
    h.buckets.push(live);
    ok++;
  }
  for (const t of slots) {
    if (calls >= maxCalls) break;
    try {
      const b = await tryOnce(t);
      if (b) filled++;
      if (b) {
        h.buckets.push(b);
        ok++;
      }
    } catch (e) {
      log(`flows slot ${new Date(t).toISOString()}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(pauseMs);
  }
  h.buckets.sort((a, b) => a.end.localeCompare(b.end));
  writeHistory(FLOWS_FILE, h);
  log(`flow buckets: +${ok} (${calls} calls), total ${h.buckets.length}, ${slots.length - filled} grid slots still empty`);
  return h;
}
