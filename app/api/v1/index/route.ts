import { getIndex, WEIGHTS } from "@/lib/model/index-model";
import { fail, json } from "@/lib/api";
import { getPublished, snapshotUrl } from "@/lib/server/published";

export const revalidate = 600;

/**
 * Live index (backward compatible: asOf / weights / universe / rows / integrity / sources are unchanged)
 * plus the spec §7 envelope fields. `data` is the index as published in the latest snapshot, and
 * `source_hash` is that snapshot's sha256.
 */
export async function GET() {
  try {
    const r = await getIndex();
    const { snapshot, thresholds } = await getPublished();
    return json({
      asOf: r.asOf,
      weights: WEIGHTS,
      universe: r.universe,
      rows: r.rows.map(({ trend, ...x }) => ({ ...x, trend: { tvl7d: trend.tvl7d, volume7vs30: trend.volume7vs30, sources: trend.sources } })),
      integrity: { rejectedPools: r.market.rejected.pools, rejectedTvl: r.market.rejected.tvl },
      sources: r.market.sources,
      as_of: snapshot?.as_of ?? null,
      methodology_version: snapshot?.methodology_version ?? null,
      thresholds_version: thresholds.t.version,
      thresholds_status: thresholds.locked ? "locked" : "DRAFT, not locked",
      source_hash: snapshot?.sha256 ?? null,
      snapshot: snapshot ? snapshotUrl(snapshot.date) : null,
      data: snapshot?.index ?? null,
    });
  } catch (e) {
    return fail(e);
  }
}
