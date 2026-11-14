import { getPublished, getSnapshotByDate, snapshotUrl } from "@/lib/server/published";
import { computeVerdicts } from "@/lib/thesis/engine";

export const revalidate = 600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Atom feed: an entry whenever a claim's verdict differs from the previous published snapshot. */
export async function GET(req: Request) {
  const { thresholds, dates } = await getPublished();
  const base = new URL(req.url).origin;
  const entries: { id: string; title: string; updated: string; link: string; body: string }[] = [];
  let prev = new Map<string, string>();
  for (const d of dates) {
    const s = await getSnapshotByDate(d);
    if (!s) continue;
    const v = computeVerdicts(s, thresholds.rules, thresholds.t);
    for (const x of v) {
      const before = prev.get(x.id);
      if (before !== x.verdict)
        entries.push({
          id: `prix:${x.id}:${d}`,
          title: `${x.id}: ${before ? `${before} → ` : ""}${x.verdict}`,
          updated: s.as_of,
          link: snapshotUrl(d),
          body: `${x.claim} Metric: ${x.metric_label}. Snapshot sha256 ${s.sha256}. Thresholds v${thresholds.t.version} (${thresholds.locked ? "locked" : "DRAFT, not locked"}).`,
        });
    }
    prev = new Map(v.map((x) => [x.id, x.verdict]));
  }
  entries.reverse();
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>PRIX — NEAR thesis verdict changes</title>
<id>${base}/feed.xml</id>
<link href="${base}/thesis"/>
<link rel="self" href="${base}/feed.xml"/>
<updated>${entries[0]?.updated ?? new Date(0).toISOString()}</updated>
${entries.map((e) => `<entry><id>${esc(e.id)}</id><title>${esc(e.title)}</title><updated>${e.updated}</updated><link href="${esc(e.link)}"/><summary>${esc(e.body)}</summary></entry>`).join("\n")}
</feed>
`;
  return new Response(xml, { headers: { "content-type": "application/atom+xml; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, s-maxage=600" } });
}
