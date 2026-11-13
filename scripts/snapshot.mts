/**
 * Re-run every PRIX model from raw public data and write a dated JSON snapshot.
 *   pnpm snapshot            → data/snapshots/prix-<UTC timestamp>.json
 * Uses exactly the same code as the web app (lib/model/*), so a snapshot is a reproducible audit trail.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getIndex, WEIGHTS } from "../lib/model/index-model.ts";
import { getThesis } from "../lib/model/thesis.ts";
import { getWhales } from "../lib/model/whales.ts";
import { getLaunches } from "../lib/model/launches.ts";
import { getIntentsCustody, getIntentsFlows, getNetwork } from "../lib/model/network.ts";
import { sectorBreakdown } from "../lib/model/sectors.ts";

const settle = async <T,>(name: string, f: () => Promise<T>) => {
  const t = Date.now();
  try {
    const v = await f();
    console.error(`✓ ${name} (${Date.now() - t} ms)`);
    return v;
  } catch (e) {
    console.error(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
};

const idx = await settle("index", getIndex);
const [thesis, whales, launches, network, flows, custody] = [
  await settle("thesis", getThesis),
  await settle("whales", getWhales),
  await settle("launches", getLaunches),
  await settle("network", getNetwork),
  await settle("intents flows", getIntentsFlows),
  await settle("intents custody", getIntentsCustody),
];

const out = {
  generatedAt: new Date().toISOString(),
  weights: WEIGHTS,
  index: idx && {
    asOf: idx.asOf,
    rows: idx.rows.map(({ trend, ...r }) => ({ ...r, trend: { tvl7d: trend.tvl7d, volume7vs30: trend.volume7vs30 } })),
    integrity: idx.market.rejected,
    sectors: sectorBreakdown(idx.market),
    sources: idx.market.sources,
  },
  thesis,
  whales,
  launches,
  network: network && { ...network, days: network.days.slice(-90) },
  intents: { flows, custody },
};
mkdirSync("data/snapshots", { recursive: true });
const file = `data/snapshots/prix-${out.generatedAt.replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(out, null, 2));
console.error(`wrote ${file}`);
if (thesis) for (const h of thesis.hypotheses) console.log(`${h.id}  ${h.verdict.padEnd(18)} ${h.claim}`);
