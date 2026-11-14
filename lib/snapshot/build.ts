import "server-only";
import { fetchJson, mapLimit } from "../http";
import { getIndex } from "../model/index-model";
import { getIntentsCustody, getIntentsFlows } from "../model/network";
import { getNetworkCharts, nearblocksUrls } from "../sources/near";
import { getHistoricalTvl, getPoolVolume, rheaUrls } from "../sources/rhea";
import { compileRules } from "../thresholds/rules";
import { h4Breakdown } from "../thesis/engine";
import { NEARBLOCKS, RHEA_API } from "../sources/endpoints";
import { archivalSource } from "../sources/archival";
import { getIntentsDepth } from "../depth/intents-depth";
import { aggregatorAuth, getRheaDepth } from "../depth/rhea-router";
import { bestImpact } from "../depth/slippage";
import { applyIndexRules } from "../model/index-rules";
import { updateCustodyHistory, type CustodyHistory } from "../history/custody";
import { readHistory } from "../history/store";
import { FLOWS_FILE, type FlowHistory } from "../history/flows";
import { addDays, median } from "../thesis/stats";
import type { Thresholds } from "../thresholds/schema";
import { canonical, sha256, snapshotHash } from "./hash";
import { SnapshotSchema, type DepthRow, type Snapshot } from "./schema";
import { latestSnapshotRaw } from "./io";

export const METHODOLOGY_VERSION = "2.1";
/**
 * H6 incident sources (read 2026-11-14). The incident date is "reported": it is the day the
 * incident was disclosed and only sets the H6 baseline. Where sources differ, both ends are shown.
 */
export const INCIDENT: Omit<Snapshot["incident"], "date"> = {
  date_basis: "reported",
  sources: [
    { kind: "official", publisher: "NEAR Intents (@near_intents) on X", url: "https://x.com/near_intents/status/2105642219357241796", published: "2026-10-01T12:53:20Z", amount_usd: 3.8e6, timing: "services stopped 1 Oct after an incident was detected; preliminary loss ≈ $3.8M" },
    { kind: "official", publisher: "Alex Shevchenko (NEAR Intents GM), postmortem on X", url: "https://x.com/AlexAuroraDev/status/2111124226962870770", published: "2026-10-16T15:56:53Z", amount_usd: 3.8e6, timing: "withdrawals 29 Sep 16:14 – 1 Oct 05:54 UTC; detected 1 Oct 08:04 UTC; contract paused 08:33 UTC; funds returned 2 Oct" },
    { kind: "press", publisher: "CoinDesk", url: "https://www.coindesk.com/tech/2026/10/01/near-intents-hit-by-usd3-8-million-exploit-as-crypto-s-rough-year-of-hacks-continues", published: "2026-10-01", amount_usd: 3.8e6, timing: "reported 1 Oct" },
    { kind: "press", publisher: "The Block", url: "https://www.theblock.co/news/ecosystems/2026-10-01-near-intents-halts-services-after-3-8-million-exploit-promises-full-compensation-417404", published: "2026-10-01", amount_usd: 3.8e6, timing: "reported 1 Oct; services halted" },
  ],
  amount_usd_range: { low: 3.8e6, high: 3.8e6 },
  timing_range: { from: "2026-09-29T16:14:00Z", to: "2026-10-01T08:04:00Z", note: "first exploit withdrawal (postmortem) to detection (postmortem); press and the official 1 Oct post date it 1 Oct" },
};
export const CUSTODY_ASSETS = 8;
export const INTENTS_DEPTH_TOKENS = 8;

type Log = (m: string) => void;
const nbHeaders = (): Record<string, string> => (process.env.NEARBLOCKS_API_KEY ? { authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {});
export const intentsTxnsUrl = `${NEARBLOCKS}/v3/accounts/intents.near/stats/txns?limit=365`;

async function step<T>(name: string, errors: Snapshot["errors"], log: Log, f: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const v = await f();
    log(`✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return v;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push({ step: name, message });
    log(`✗ ${name}: ${message}`);
    return null;
  }
}

/**
 * Build today's self-contained snapshot. Every series the verdict engine reads is embedded, so
 * `pnpm verdicts --snapshot <file>` needs no network. Nothing is estimated: a failed step leaves
 * its fields null and is listed in `errors`.
 */
export async function buildSnapshot(opts: { thresholds: Thresholds; thresholdsSha: string; log?: Log; now?: Date; custodyFrom?: string; persistHistory?: boolean }): Promise<Snapshot> {
  const log = opts.log ?? ((m: string) => console.error(m));
  const now = opts.now ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const errors: Snapshot["errors"] = [];
  const sources: Snapshot["sources"] = [];
  const src = (url: string, section: unknown) => sources.push({ url, fetched_at: now.toISOString(), sha256: sha256(canonical(section ?? null)) });
  const rules = opts.thresholds.index_rules;

  const [idx, net, custody, flows, tvl, txns] = await Promise.all([
    step("RHEA market + index", errors, log, getIndex),
    step("NEAR network charts", errors, log, getNetworkCharts),
    step("NEAR Intents custody", errors, log, getIntentsCustody),
    step("NEAR Intents latest events", errors, log, getIntentsFlows),
    step("RHEA historical TVL", errors, log, () => getHistoricalTvl(120)),
    step("NEAR Intents daily txns", errors, log, () => fetchJson<{ data: { date: string; txns: string }[] }>(intentsTxnsUrl, { revalidate: 0, headers: nbHeaders(), timeoutMs: 30000 })),
  ]);
  const m = idx?.market ?? null;

  // ---- RHEA integrity
  const live = m ? m.pools.filter((p) => p.tvl >= 1000) : [];
  const clean = live.filter((p) => p.clean);
  const rejected = live.filter((p) => !p.clean).sort((a, b) => b.tvl - a.tvl);
  const lastTvl = tvl?.filter((p) => p.amm > 0).at(-1) ?? null;
  const rhea: Snapshot["rhea"] = {
    clean_tvl_usd: m ? clean.reduce((a, p) => a + p.tvl, 0) : null,
    unfiltered_tvl_usd: m ? live.reduce((a, p) => a + p.tvl, 0) : null,
    reported_tvl_usd: m && Number.isFinite(m.protocol.tvl) ? m.protocol.tvl : null,
    amm_tvl_usd: lastTvl?.amm ?? null,
    lending_tvl_usd: lastTvl?.lending ?? null,
    volume_24h_usd: m && Number.isFinite(m.protocol.volume24h) ? m.protocol.volume24h : null,
    rejected_pools: rejected.map((p) => ({ id: p.id, pair: p.symbols.join("/"), claimed_usd: p.tvl, reasons: p.flags.filter((f) => f !== "dust") })),
    rejected_count: rejected.length,
    volume_organic_share: null,
  };
  if (m) src(rheaUrls.topPools, rhea);

  // ---- Depth (Intents dry quotes for the top tokens; RHEA router for the whole universe)
  const universe = idx?.rows ?? [];
  const intentsTokens = universe.filter((r) => r.id !== "wrap.near").map((r) => r.id);
  const [intentsDepth, rheaDepth] = await Promise.all([
    step("Intents depth (1Click dry quotes)", errors, log, () => getIntentsDepth(intentsTokens, { maxTokens: INTENTS_DEPTH_TOKENS, log })),
    m ? step("RHEA router depth", errors, log, () => getRheaDepth(m, universe.map((r) => r.id), { log })) : Promise.resolve(null),
  ]);
  const depth: DepthRow[] = [...(intentsDepth?.rows ?? []), ...(rheaDepth?.rows ?? [])];
  if (intentsDepth) src(`${intentsDepth.tokensSource.replace("/tokens", "/quote")} (dry:true)`, intentsDepth.rows);
  if (rheaDepth) src(`${rheaUrls.findPathBase}`, rheaDepth.rows);

  // ---- Index with the thresholds' universe rules
  const extra = new Map<string, { impact: number; route: string }>();
  for (const r of universe) {
    const best = bestImpact(depth, r.id, 10_000);
    if (best) extra.set(r.id, { impact: best.impact, route: `${best.row.route}:${best.row.router}${best.row.route === "intents" ? ` from ${best.row.origin}` : ""}` });
  }
  // Every measurement comes from this snapshot's depth rows (router quotes or AMM math rows).
  const applied = applyIndexRules(
    universe.map((r) => ({ id: r.id, score: r.score, liquidity: r.liquidity, impact10k: null, impactRoute: null })),
    rules,
    extra,
  );
  const index: Snapshot["index"] = universe.map((r, i) => {
    const a = applied[i];
    const derived = a.bestRoute?.includes("amm-math") ?? false;
    return {
      token_id: r.id,
      symbol: r.symbol,
      score: r.score,
      rank: a.rank,
      liquidity_usd: r.liquidity,
      impact_10k: r.depth.impact,
      best_impact_10k: a.bestImpact10k,
      best_impact_route: a.bestRoute,
      flags: r.flags,
      confidence: a.confidence,
      low_confidence_reasons: derived ? [...a.reasons, "depth from AMM reserve math, not a router quote"] : a.reasons,
    };
  });
  if (idx) src("PRIX index model (see /methodology)", index);

  // ---- Network series
  const network = (net ?? []).slice(-400).map((d) => ({ date: d.date, active: d.active, txns: d.txns, price: d.price }));
  if (net) src(`${nearblocksUrls.addressStats} · ${nearblocksUrls.txnStats} · ${nearblocksUrls.priceStats}`, network);
  const intents_txns = (txns?.data ?? []).map((d) => ({ date: d.date, txns: Number(d.txns) })).filter((d) => Number.isFinite(d.txns)).sort((a, b) => a.date.localeCompare(b.date));
  if (txns) src(intentsTxnsUrl, intents_txns);

  // RHEA TVL series, with the disclosed outlier filter (> 3× the median AMM TVL is excluded).
  const tvlMed = median((tvl ?? []).map((p) => p.amm).filter((x) => x > 0));
  const rhea_tvl = (tvl ?? []).filter((p) => p.amm > 0 && p.amm <= 3 * tvlMed).map((p) => ({ date: p.date, amm: p.amm, lending: p.lending }));
  const excluded = (tvl ?? []).length - rhea_tvl.length;
  if (excluded) errors.push({ step: "RHEA historical TVL", message: `${excluded} day(s) excluded by the >3× median outlier filter (not an error; disclosed)` });
  if (tvl) src(rheaUrls.historicalTvl(120), rhea_tvl);

  // ---- Custody at constant prices (archival RPC)
  const custody_constant: Snapshot["series"]["custody_constant"] = [];
  let custody_constant_meta: Snapshot["series"]["custody_constant_meta"] = { assets: [], coverage: 0, price_as_of: now.toISOString() };
  if (custody && m) {
    const top = custody.rows.slice(0, CUSTODY_ASSETS);
    const hist = await step("Custody history (archival RPC)", errors, log, () =>
      updateCustodyHistory(top.map((r) => r.id), opts.custodyFrom ?? addDays(opts.thresholds.claims.H6.incident_date!, -12), date, log, opts.persistHistory ?? true),
    );
    const h: CustodyHistory | null = hist ?? readHistory<CustodyHistory | null>("intents-custody-daily.json", null);
    // Only assets whose contract existed on every day of the series: a token launched after the
    // incident would otherwise read as "recovery". Excluded assets are listed in errors.
    const days = h?.days ?? [];
    const assets = top.filter((r) => days.length > 0 && days.every((d) => d.balances[r.id] != null && d.balances[r.id] !== "absent"));
    const dropped = top.filter((r) => !assets.includes(r));
    if (dropped.length) errors.push({ step: "Custody history (archival RPC)", message: `excluded from the constant-price custody series (contract missing or unread on some day): ${dropped.map((r) => r.symbol).join(", ")}` });
    custody_constant_meta = {
      assets: assets.map((r) => ({ id: r.id, symbol: r.symbol, price_usd: m.tokens.get(r.id)!.price!, share_of_custody: custody.total > 0 ? r.usd / custody.total : 0 })),
      coverage: custody.total > 0 ? assets.reduce((a, r) => a + r.usd, 0) / custody.total : 0,
      price_as_of: m.asOf,
    };
    for (const d of days) {
      if (!assets.length) break;
      const usd = assets.reduce((a, r) => a + (Number(BigInt(d.balances[r.id])) / 10 ** m.tokens.get(r.id)!.decimals) * m.tokens.get(r.id)!.price!, 0);
      custody_constant.push({ date: d.date, usd, block: d.block, assets: assets.length });
    }
    src(archivalSource("<top assets>", custody_constant.at(-1)?.block ?? 0), custody_constant);
  }

  // ---- H2 daily: carry forward previous snapshots' entries and add today's
  // Read schema-agnostically so H2 days survive snapshot schema changes.
  const prev = latestSnapshotRaw() as null | { date: string; sha256: string; intents: { custody_usd: number | null }; rhea: { clean_tvl_usd: number | null }; series?: { h2_daily?: Snapshot["series"]["h2_daily"] } };
  const h2_prev = (prev?.series?.h2_daily ?? []).filter((d) => d.date < date);
  if (prev && prev.date < date && !h2_prev.some((d) => d.date === prev.date) && prev.intents?.custody_usd != null && prev.rhea?.clean_tvl_usd)
    h2_prev.push({ date: prev.date, custody_usd: prev.intents.custody_usd, clean_tvl_usd: prev.rhea.clean_tvl_usd, ratio: prev.intents.custody_usd / prev.rhea.clean_tvl_usd, snapshot_sha256: prev.sha256 });
  const h2_daily = [...h2_prev];
  if (custody && rhea.clean_tvl_usd) h2_daily.push({ date, custody_usd: custody.total, clean_tvl_usd: rhea.clean_tvl_usd, ratio: custody.total / rhea.clean_tvl_usd, snapshot_sha256: "this-snapshot" });

  // ---- Flow buckets (sampled history)
  const fh = readHistory<FlowHistory>(FLOWS_FILE, { buckets: [] });
  const cutoff = new Date(now.getTime() - 35 * 86400000).toISOString();
  const flow_buckets = fh.buckets.filter((b) => b.end >= cutoff && b.end <= now.toISOString());
  src(`${NEARBLOCKS}/v3/intents/txns?limit=100&before_ts=… (sampled; data/history/${FLOWS_FILE})`, flow_buckets);

  // ---- Pool volume, ALL live pools (H4). Denominator = every pool with >= $1k TVL, rejected and
  // flagged included; the engine applies the thresholds' wash flags to these per-pool rows.
  let pool_volume_all: Snapshot["series"]["pool_volume_all"] = null;
  if (m && idx) {
    const washy = new Set(idx.rows.filter((r) => r.flags.some((f) => /round-trip|abnormal turnover/.test(f))).map((r) => r.id));
    const winDays = compileRules(opts.thresholds).H4.windowDays;
    const dates = Array.from({ length: winDays }, (_, i) => addDays(date, -winDays + i));
    const hist = await step(`Pool volume histories (all ${live.length} live pools)`, errors, log, () => mapLimit(live, 12, (p) => getPoolVolume(p.id)));
    if (hist) {
      const rows: NonNullable<Snapshot["series"]["pool_volume_all"]>["rows"] = [];
      let unreported = 0;
      live.forEach((p, i) => {
        const h = hist[i];
        if (!h) return void unreported++;
        const by = new Map(h.filter((v) => v.value >= 0).map((v) => [v.date, v.value]));
        const daily = dates.map((d) => Math.round((by.get(d) ?? 0) * 100) / 100);
        if (!daily.some((v) => v > 0)) return;
        rows.push({ id: p.id, pair: p.symbols.join("/"), kind: p.kind, tvl_usd: Math.round(p.tvl), rejected: !p.clean, token_flagged: p.tokens.some((t) => washy.has(t)), daily });
      });
      if (unreported) errors.push({ step: "Pool volume histories", message: `${unreported} of ${live.length} pool volume histories not reported (left out of numerator and denominator)` });
      const lastDay = rows.reduce((a, r) => a + r.daily[r.daily.length - 1], 0);
      pool_volume_all = {
        dates,
        pools_live: live.length,
        pools_unreported: unreported,
        protocol_volume_24h_usd: rhea.volume_24h_usd,
        all_pool_volume_last_day_usd: lastDay,
        rows: rows.sort((x, y) => y.daily.reduce((a, v) => a + v, 0) - x.daily.reduce((a, v) => a + v, 0)),
      };
      rhea.volume_organic_share = h4Breakdown(pool_volume_all, rhea.clean_tvl_usd, compileRules(opts.thresholds).H4)?.share ?? null;
      src(`${rheaUrls.poolVolumeBase} + ${RHEA_API}/get-dcl-pools-volume?pool_id=<id> (${live.length} live pools)`, pool_volume_all);
    }
  }

  const s: Omit<Snapshot, "sha256"> = {
    as_of: now.toISOString(),
    date,
    methodology_version: METHODOLOGY_VERSION,
    thresholds_version: opts.thresholds.version,
    thresholds_sha256: opts.thresholdsSha,
    near_price_usd: network.at(-1)?.price ?? null,
    active_accounts_daily: network.at(-1)?.active ?? null,
    rhea,
    intents: {
      custody_usd: custody?.total ?? null,
      priced_assets: custody ? custody.rows.length : null,
      deposits_usd: flows?.inUsd ?? null,
      withdrawals_usd: flows?.outUsd ?? null,
      events_sampled: flows?.events ?? 0,
      window_minutes: flows?.windowMs != null ? flows.windowMs / 60000 : 0,
    },
    depth,
    depth_meta: {
      quotes_attempted: (intentsDepth?.attempted ?? 0) + (rheaDepth?.attempted ?? 0),
      quotes_ok: depth.filter((r) => r.status === "ok").length,
      cap: 96,
      oneclick_auth: intentsDepth?.auth ?? "none",
      aggregator_auth: aggregatorAuth(),
    },
    index: index.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)),
    series: { network, rhea_tvl, intents_txns, custody_constant, custody_constant_meta, h2_daily, flow_buckets, pool_volume_all },
    incident: { date: opts.thresholds.claims.H6.incident_date!, ...INCIDENT },
    sources,
    errors: [...errors, ...(m?.errors ?? []).map((message) => ({ step: "RHEA market", message }))],
  };
  const full = { ...s, sha256: snapshotHash(s as Snapshot) } as Snapshot;
  return SnapshotSchema.parse(full);
}
