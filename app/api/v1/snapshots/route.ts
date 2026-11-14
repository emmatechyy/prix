import { getPublished, snapshotUrl } from "@/lib/server/published";
import { apiJson, envelope, options } from "@/lib/envelope";

export const revalidate = 600;
export const OPTIONS = options;

export async function GET() {
  const { snapshot, thresholds, dates } = await getPublished();
  return apiJson(envelope(snapshot, thresholds, { dates: dates.map((d) => ({ date: d, api: `/api/v1/snapshots/${d}`, file: snapshotUrl(d) })) }));
}
