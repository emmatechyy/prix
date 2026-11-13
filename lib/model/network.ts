import "server-only";
import { memo } from "../memo";
import { getAccountFts, getIntentsEvents, getNetworkCharts, getNetworkStats, fastnearUrls, nearblocksUrls, type ChartDay } from "../sources/near";
import { getHistoricalTvl, getVolumeVariation, rheaUrls, type TvlPoint } from "../sources/rhea";
import { INTENTS_CONTRACT } from "../sources/endpoints";
import { units } from "../format";
import { getMarket } from "./market";

export type Series = { time: string; value: number }[];

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}
/** Pearson correlation of daily % changes. */
function corr(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const ma = avg(a.slice(0, n));
  const mb = avg(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}
const pctChanges = (xs: number[]) => xs.slice(1).map((v, i) => (xs[i] > 0 ? v / xs[i] - 1 : 0));

export const getNetwork = memo(async () => {
  const days = (await getNetworkCharts()).filter((d) => d.txns > 0);
  const last365 = days.slice(-365);
  type K = "txns" | "active" | "newContracts" | "price" | "fees";
  const vals = (xs: ChartDay[], key: K) => xs.map((d) => d[key]).filter((v): v is number => v != null && Number.isFinite(v));
  const window = (n: number, off = 0) => last365.slice(last365.length - n - off, last365.length - off);
  const cmp = (key: K, n: number) => {
    const a = avg(vals(window(n), key));
    const b = avg(vals(window(n, n), key));
    return { current: a, previous: b, change: b > 0 ? a / b - 1 : null };
  };
  const yoy = (key: K) => {
    const a = avg(vals(window(30), key));
    const b = avg(vals(last365.slice(0, 30), key));
    return b > 0 ? a / b - 1 : null;
  };
  const w180 = window(180).filter((d) => d.price != null);
  return {
    asOf: new Date().toISOString(),
    lastDate: last365.at(-1)?.date ?? null,
    days: last365,
    d30: { txns: cmp("txns", 30), active: cmp("active", 30), newContracts: cmp("newContracts", 30), price: cmp("price", 30), fees: cmp("fees", 30) },
    yoy: { txns: yoy("txns"), active: yoy("active"), price: yoy("price") },
    corrActivePrice180: corr(pctChanges(w180.map((d) => d.active)), pctChanges(w180.map((d) => d.price!))),
    corrTxnsPrice180: corr(pctChanges(w180.map((d) => d.txns)), pctChanges(w180.map((d) => d.price!))),
    sources: [nearblocksUrls.txnStats, nearblocksUrls.addressStats, nearblocksUrls.priceStats],
  };
});

export const getStats = memo(async () => getNetworkStats());

/** RHEA protocol TVL history with a disclosed outlier filter (points > 3× the series median are excluded). */
export const getProtocolHistory = memo(async () => {
  const raw: TvlPoint[] = await getHistoricalTvl(90);
  const med = median(raw.map((p) => p.amm));
  const kept = raw.filter((p) => p.amm > 0 && p.amm <= 3 * med);
  const excluded = raw.filter((p) => !(p.amm > 0 && p.amm <= 3 * med));
  const variation = await getVolumeVariation().catch(() => null);
  return { points: kept, excluded, volume: variation, source: rheaUrls.historicalTvl(90), volumeSource: rheaUrls.volumeVariation };
});

/** Value of assets custodied by the NEAR Intents contract (intents.near), priced with RHEA prices. */
export const getIntentsCustody = memo(async () => {
  const [m, fts] = await Promise.all([getMarket(), getAccountFts(INTENTS_CONTRACT)]);
  const rows: { id: string; symbol: string; amount: number; usd: number; sector: string }[] = [];
  let unpriced = 0;
  for (const f of fts) {
    const t = m.tokens.get(f.contract_id);
    if (!t || t.price == null) {
      if (f.balance !== "0") unpriced++;
      continue;
    }
    const amount = units(f.balance, t.decimals);
    const usd = amount * t.price;
    if (usd > 0) rows.push({ id: t.id, symbol: t.symbol, amount, usd, sector: t.sector });
  }
  rows.sort((a, b) => b.usd - a.usd);
  // Integrity: drop any single asset whose value exceeds 10× the next largest (likely a mispriced token).
  const flagged: typeof rows = [];
  while (rows.length > 1 && rows[0].usd > 10 * rows[1].usd) flagged.push(rows.shift()!);
  return {
    total: rows.reduce((a, r) => a + r.usd, 0),
    rows,
    flagged,
    unpriced,
    tokenCount: fts.length,
    source: fastnearUrls.ft(INTENTS_CONTRACT),
  };
});

export const INTENTS_PAGES = 6;

/** Net deposits (MINT) minus withdrawals (BURN) into NEAR Intents per asset, over the most recent events. */
export const getIntentsFlows = memo(async () => {
  const ev = await getIntentsEvents(INTENTS_PAGES);
  const by = new Map<string, { asset: string; symbol: string; inUsd: number; outUsd: number; events: number; unpriced: number }>();
  let first = Infinity;
  let last = 0;
  for (const e of ev) {
    const ts = Number(e.block_timestamp) / 1e6;
    first = Math.min(first, ts);
    last = Math.max(last, ts);
    if (e.cause !== "MINT" && e.cause !== "BURN") continue;
    const asset = e.token_id;
    const sym = e.base_meta?.symbol ?? asset.replace(/^nep\d+:/, "").slice(0, 12);
    let r = by.get(asset);
    if (!r) by.set(asset, (r = { asset, symbol: sym, inUsd: 0, outUsd: 0, events: 0, unpriced: 0 }));
    r.events++;
    const dec = e.base_meta?.decimals;
    const px = e.price == null ? NaN : Number(e.price);
    if (dec == null || !Number.isFinite(px)) {
      r.unpriced++;
      continue;
    }
    const usd = Math.abs(units(e.delta_amount.replace("-", ""), dec)) * px;
    if (e.cause === "MINT") r.inUsd += usd;
    else r.outUsd += usd;
  }
  const rows = [...by.values()].map((r) => ({ ...r, netUsd: r.inUsd - r.outUsd })).sort((a, b) => b.inUsd + b.outUsd - (a.inUsd + a.outUsd));
  return {
    events: ev.length,
    windowMs: Number.isFinite(first) ? last - first : null,
    from: Number.isFinite(first) ? new Date(first).toISOString() : null,
    to: last ? new Date(last).toISOString() : null,
    rows,
    inUsd: rows.reduce((a, r) => a + r.inUsd, 0),
    outUsd: rows.reduce((a, r) => a + r.outUsd, 0),
    source: nearblocksUrls.intents(),
  };
});
