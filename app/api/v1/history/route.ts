import type { NextRequest } from "next/server";
import { getPublished, getSnapshotByDate, snapshotUrl } from "@/lib/server/published";
import { apiError, apiJson, envelope, options } from "@/lib/envelope";
import { computeVerdicts } from "@/lib/thesis/engine";
import { CLAIM_IDS, type ClaimId } from "@/lib/thresholds/schema";

export const OPTIONS = options;

/** One claim's verdict in every published snapshot, plus the series it is computed from. ?claim=H1..H6 */
export async function GET(req: NextRequest) {
  const claim = (req.nextUrl.searchParams.get("claim") ?? "").toUpperCase() as ClaimId;
  if (!CLAIM_IDS.includes(claim)) return apiError(400, "bad_claim", `claim must be one of ${CLAIM_IDS.join(", ")}`);
  const { snapshot, thresholds, dates } = getPublished();
  if (!snapshot) return apiError(503, "no_snapshot", "No published snapshot yet.");
  const history = dates.map((d) => {
    const s = getSnapshotByDate(d)!;
    const v = computeVerdicts(s, thresholds.rules, thresholds.t).find((x) => x.id === claim)!;
    return { date: d, snapshot_sha256: s.sha256, snapshot: snapshotUrl(d), verdict: v.verdict, metric_value: v.metric_value, metric_label: v.metric_label };
  });
  const S = snapshot.series;
  const series =
    claim === "H1" ? { network: S.network.slice(-200) }
    : claim === "H2" ? { h2_daily: S.h2_daily }
    : claim === "H3" ? { depth_100k: snapshot.depth.filter((r) => r.size_usd === 100_000) }
    : claim === "H4" ? { pool_volume: S.pool_volume }
    : claim === "H5" ? { flow_buckets: S.flow_buckets, rhea_tvl: S.rhea_tvl }
    : { custody_constant: S.custody_constant, custody_constant_meta: S.custody_constant_meta, intents_txns: S.intents_txns.slice(-90), incident: snapshot.incident };
  return apiJson(envelope(snapshot, thresholds, { claim, history, series }, snapshotUrl(snapshot.date)));
}
