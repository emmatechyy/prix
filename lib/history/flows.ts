import "server-only";
import { fetchJson } from "../http";
import { NEARBLOCKS } from "../sources/endpoints";
import type { IntentsEvent } from "../sources/near";
import type { FlowBucket } from "../snapshot/schema";
import { units } from "../format";
import { readHistory, writeHistory } from "./store";
import { observedCoverage } from "./coverage";

/**
 * NEAR Intents flow pages with a stored cursor.
 *
 * NearBlocks returns intents.near events newest-first, 100 per page, with an exact `next` cursor.
 * One page covers every event between its oldest event and the point where the previous page (or
 * "now") ended, so each page is a fully observed interval. Each run pages back from now until it
 * reaches the newest instant already observed (the high-water mark). If the call budget runs out
 * first, the unread stretch is stored as a gap with the cursor to resume from, and later runs keep
 * paging into the oldest-first open gaps. Coverage = observed hours ÷ window hours; nothing is
 * scaled up to fill what was not read.
 */
export const FLOWS_FILE = "intents-flow-buckets.json";
const nbHeaders = (): Record<string, string> => (process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {});
export const flowsUrl = (next?: string) => `${NEARBLOCKS}/v3/intents/txns?limit=100${next ? `&next=${encodeURIComponent(next)}` : ""}`;

const nsToIso = (ns: bigint) => new Date(Number(ns / 1_000_000n)).toISOString();

/** Deposit/withdrawal totals for events strictly newer than `floorNs` (if given). */
export function bucketFromEvents(ev: IntentsEvent[], source: string, upperNs?: bigint, floorNs?: bigint): FlowBucket | null {
  const kept = floorNs == null ? ev : ev.filter((e) => BigInt(e.block_timestamp) > floorNs);
  if (!ev.length) return null;
  const tss = ev.map((e) => BigInt(e.block_timestamp));
  const oldest = tss.reduce((a, b) => (b < a ? b : a));
  const newest = tss.reduce((a, b) => (b > a ? b : a));
  let dep = 0, wd = 0, mints = 0, burns = 0, unpriced = 0;
  for (const e of kept) {
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
  const start = floorNs != null && floorNs > oldest ? floorNs : oldest;
  const end = upperNs ?? newest;
  return { start: nsToIso(start), end: nsToIso(end), events: kept.length, deposits_usd: dep, withdrawals_usd: wd, mints, burns, unpriced, source };
}

export type FlowGap = { /** newest unread instant (ns) */ upper_ns: string; /** oldest unread instant = the older observed edge (ns) */ lower_ns: string; /** cursor that resumes paging at upper_ns */ next: string };
export type FlowHistory = { buckets: FlowBucket[]; high_ns?: string; gaps?: FlowGap[]; updated_at?: string };

type Page = { data: IntentsEvent[]; meta?: { next_page?: string } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function updateFlowBuckets({ maxCalls = 30, pauseMs = 2500, nowMs = Date.now(), keepDays = 35, log = console.error, fetchPage }: { maxCalls?: number; pauseMs?: number; nowMs?: number; keepDays?: number; log?: (m: string) => void; fetchPage?: (next?: string) => Promise<Page> } = {}) {
  const h = readHistory<FlowHistory>(FLOWS_FILE, { buckets: [] });
  h.gaps ??= [];
  let calls = 0;
  const get =
    fetchPage ??
    (async (next?: string) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetchJson<Page>(flowsUrl(next), { revalidate: 0, headers: nbHeaders(), timeoutMs: 25000 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/429/.test(msg) && attempt < 3) await sleep(15000 * (attempt + 1));
          else throw e;
        }
      }
    });
  const page = async (next?: string) => {
    calls++;
    const r = await get(next);
    if (pauseMs) await sleep(pauseMs);
    return r;
  };

  // Walk back from `upper` (cursor `next`) until reaching `floor`; returns the open gap if the budget ran out.
  const walk = async (next: string | undefined, upper: bigint | undefined, floor: bigint | undefined, label: string): Promise<{ newest?: bigint; gap?: FlowGap }> => {
    let newest: bigint | undefined;
    let cur = next, up = upper;
    while (calls < maxCalls) {
      let r: Page;
      try {
        r = await page(cur);
      } catch (e) {
        log(`flows ${label}: ${e instanceof Error ? e.message : e}`);
        break;
      }
      if (!r.data.length) return { newest };
      const tss = r.data.map((e) => BigInt(e.block_timestamp));
      const oldest = tss.reduce((a, b) => (b < a ? b : a));
      newest ??= tss.reduce((a, b) => (b > a ? b : a));
      const b = bucketFromEvents(r.data, flowsUrl(cur ? "<cursor>" : undefined), up, floor);
      if (b) h.buckets.push(b);
      if (floor != null && oldest <= floor) return { newest };
      cur = r.meta?.next_page;
      up = oldest;
      if (!cur) return { newest };
    }
    if (floor != null && up != null && cur) return { newest, gap: { upper_ns: up.toString(), lower_ns: floor.toString(), next: cur } };
    return { newest };
  };

  // 1) From now back to the high-water mark.
  // First run after the move to cursors: walk back to the newest legacy sampled page.
  const legacyEnd = h.buckets.map((b) => Date.parse(b.end)).reduce((a, b) => Math.max(a, b), 0);
  const high = h.high_ns ? BigInt(h.high_ns) : legacyEnd ? BigInt(legacyEnd) * 1_000_000n : undefined;
  const live = await walk(undefined, undefined, high, "live");
  if (live.newest != null) h.high_ns = live.newest.toString();
  if (live.gap) h.gaps.push(live.gap);
  // 2) Spend what is left of the budget on open gaps, newest first (the 7-day window fills first).
  h.gaps.sort((a, b) => (BigInt(b.upper_ns) > BigInt(a.upper_ns) ? 1 : -1));
  const still: FlowGap[] = [];
  for (const g of h.gaps) {
    if (calls >= maxCalls) {
      still.push(g);
      continue;
    }
    const r = await walk(g.next, BigInt(g.upper_ns), BigInt(g.lower_ns), "gap");
    if (r.gap) still.push(r.gap);
  }
  const cutoff = new Date(nowMs - keepDays * 86400000).toISOString();
  h.gaps = still.filter((g) => nsToIso(BigInt(g.upper_ns)) >= cutoff);
  h.buckets = h.buckets.filter((b) => b.end >= cutoff).sort((a, b) => a.end.localeCompare(b.end));
  h.updated_at = new Date(nowMs).toISOString();
  writeHistory(FLOWS_FILE, h);
  const cov = observedCoverage(h.buckets, nowMs, 30);
  log(`flows: ${calls} calls, ${h.buckets.length} pages stored, ${h.gaps.length} open gap(s); 30d coverage ${(cov.share * 100).toFixed(2)}% (${cov.hours.toFixed(1)} h observed)`);
  return h;
}
