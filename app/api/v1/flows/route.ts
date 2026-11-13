import { getIndex } from "@/lib/model/index-model";
import { getIntentsCustody, getIntentsFlows } from "@/lib/model/network";
import { sectorBreakdown } from "@/lib/model/sectors";
import { fail, json } from "@/lib/api";

export const revalidate = 600;

export async function GET() {
  try {
    const [idx, flows, custody] = await Promise.all([getIndex(), getIntentsFlows().catch(() => null), getIntentsCustody().catch(() => null)]);
    return json({
      asOf: idx.asOf,
      sectors: sectorBreakdown(idx.market),
      tokens: idx.rows.filter((r) => r.flow).map((r) => ({ id: r.id, symbol: r.symbol, ...r.flow, poolTvl7d: r.trend.tvl7d })),
      intents: { flows, custody },
    });
  } catch (e) {
    return fail(e);
  }
}
