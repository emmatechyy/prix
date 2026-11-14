import type { NextRequest } from "next/server";
import { getPublished, snapshotUrl } from "@/lib/server/published";
import { apiError, apiJson, envelope, options } from "@/lib/envelope";
import { DEPTH_SIZES } from "@/lib/depth/slippage";

export const OPTIONS = options;

/** Depth matrix from the latest snapshot. ?token=<NEP-141 id or symbol>&size=1000|10000|100000|1000000 */
export async function GET(req: NextRequest) {
  const { snapshot, thresholds } = await getPublished();
  if (!snapshot) return apiError(503, "no_snapshot", "No published snapshot yet.");
  const token = req.nextUrl.searchParams.get("token");
  const sizeRaw = req.nextUrl.searchParams.get("size");
  const size = sizeRaw == null ? null : Number(sizeRaw);
  if (size != null && !DEPTH_SIZES.includes(size as (typeof DEPTH_SIZES)[number])) return apiError(400, "bad_size", `size must be one of ${DEPTH_SIZES.join(", ")}`);
  const sym = token?.toLowerCase();
  const ids = token ? new Set(snapshot.index.filter((r) => r.token_id === token || r.symbol.toLowerCase() === sym).map((r) => r.token_id).concat(token)) : null;
  const rows = snapshot.depth.filter((r) => (!ids || ids.has(r.token_id)) && (size == null || r.size_usd === size));
  if (token && rows.length === 0) return apiError(404, "unknown_token", `No depth rows for ${token}.`);
  return apiJson(envelope(snapshot, thresholds, { meta: snapshot.depth_meta, sizes: DEPTH_SIZES, rows }, snapshotUrl(snapshot.date)));
}
