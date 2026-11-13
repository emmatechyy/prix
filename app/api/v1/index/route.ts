import { getIndex, WEIGHTS } from "@/lib/model/index-model";
import { fail, json } from "@/lib/api";

export const revalidate = 600;

export async function GET() {
  try {
    const r = await getIndex();
    return json({
      asOf: r.asOf,
      weights: WEIGHTS,
      universe: r.universe,
      rows: r.rows.map(({ trend, ...x }) => ({ ...x, trend: { tvl7d: trend.tvl7d, volume7vs30: trend.volume7vs30, sources: trend.sources } })),
      integrity: { rejectedPools: r.market.rejected.pools, rejectedTvl: r.market.rejected.tvl },
      sources: r.market.sources,
    });
  } catch (e) {
    return fail(e);
  }
}
