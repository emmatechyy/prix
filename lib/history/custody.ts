import "server-only";
import { mapLimit } from "../http";
import { blockAtTime, ftBalanceAt, latestBlock } from "../sources/archival";
import { INTENTS_CONTRACT } from "../sources/endpoints";
import { addDays } from "../thesis/stats";
import { readHistory, writeHistory } from "./store";

/**
 * intents.near token balances at the first block of each UTC day, read from archival RPC.
 * Stored raw (integer strings) so any later pricing is reproducible.
 */
/** balances: raw integer strings, or "absent" when the token contract did not exist at that block. */
export type CustodyDay = { date: string; block: number; block_ts: string; balances: Record<string, string> };
export type CustodyHistory = { account: string; days: CustodyDay[] };
export const CUSTODY_FILE = "intents-custody-daily.json";

export async function updateCustodyHistory(assets: string[], fromDate: string, toDate: string, log = console.error, persist = true) {
  const h = readHistory<CustodyHistory>(CUSTODY_FILE, { account: INTENTS_CONTRACT, days: [] });
  const byDate = new Map(h.days.map((d) => [d.date, d]));
  const ref = await latestBlock();
  const dates: string[] = [];
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) dates.push(d);
  let calls = 0;
  await mapLimit(dates, 2, async (date) => {
    let day = byDate.get(date);
    if (!day) {
      const b = await blockAtTime(Date.parse(date + "T00:00:00Z"), ref);
      day = { date, block: b.height, block_ts: new Date(b.timestamp).toISOString(), balances: {} };
      byDate.set(date, day);
    }
    for (const a of assets) {
      if (day.balances[a] != null) continue;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          calls++;
          day.balances[a] = await ftBalanceAt(a, INTENTS_CONTRACT, day.block);
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // The token contract did not exist yet at this block. Recorded as "absent" (not 0) so the
          // snapshot builder can drop assets that did not exist over the whole window.
          if (/UNKNOWN_ACCOUNT/.test(msg)) {
            day.balances[a] = "absent";
            break;
          }
          if (/429|5\d\d|timeout|abort/i.test(msg) && attempt < 4) {
            await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
            continue;
          }
          log(`custody ${date} ${a}: ${msg}`);
          break;
        }
      }
    }
  });
  h.days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (persist) writeHistory(CUSTODY_FILE, h);
  log(`custody history: ${h.days.length} days, ${calls} archival calls`);
  return h;
}
