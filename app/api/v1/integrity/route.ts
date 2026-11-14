import { getPublished, snapshotUrl } from "@/lib/server/published";
import { apiError, apiJson, envelope, options } from "@/lib/envelope";

export const revalidate = 600;
export const OPTIONS = options;

/** RHEA TVL with and without the pools PRIX rejects, and why each was rejected. */
export async function GET() {
  const { snapshot, thresholds } = await getPublished();
  if (!snapshot) return apiError(503, "no_snapshot", "No published snapshot yet.");
  const r = snapshot.rhea;
  return apiJson(
    envelope(snapshot, thresholds, {
      clean_tvl_usd: r.clean_tvl_usd,
      unfiltered_tvl_usd: r.unfiltered_tvl_usd,
      rejected_tvl_usd: r.unfiltered_tvl_usd != null && r.clean_tvl_usd != null ? r.unfiltered_tvl_usd - r.clean_tvl_usd : null,
      reported_tvl_usd: r.reported_tvl_usd,
      rejected_count: r.rejected_count,
      rejected_pools: r.rejected_pools,
      volume_organic_share: r.volume_organic_share,
    }, snapshotUrl(snapshot.date)),
  );
}
