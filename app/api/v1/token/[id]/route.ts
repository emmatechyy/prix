import { getTokenDetail } from "@/lib/model/index-model";
import { fail, json } from "@/lib/api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const d = await getTokenDetail(decodeURIComponent(id));
    if (!d) return json({ error: "not_found", message: "Token not found in RHEA token list or pools" }, 404);
    return json({ asOf: d.market.asOf, token: d.token, inUniverse: d.inUniverse, evidence: d.row, pools: d.pools });
  } catch (e) {
    return fail(e);
  }
}
