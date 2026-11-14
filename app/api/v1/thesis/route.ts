import { getPublished, snapshotUrl } from "@/lib/server/published";
import { apiError, apiJson, envelope, options } from "@/lib/envelope";

export const revalidate = 600;
export const OPTIONS = options;

/** Verdicts H1–H6 computed by lib/thesis/engine.ts from the latest published snapshot. */
export async function GET() {
  const { snapshot, thresholds, verdicts } = await getPublished();
  if (!snapshot) return apiError(503, "no_snapshot", "No published snapshot yet (data/snapshots is empty).");
  return apiJson(envelope(snapshot, thresholds, { verdicts, claims: thresholds.t.claims, global: thresholds.t.global }, snapshotUrl(snapshot.date)));
}
