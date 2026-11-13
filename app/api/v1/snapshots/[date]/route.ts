import { getSnapshotByDate } from "@/lib/server/published";
import { apiError, CORS, options } from "@/lib/envelope";
import { NextResponse } from "next/server";

export const OPTIONS = options;

/** A published snapshot file, byte-for-byte equivalent JSON. Its `sha256` is the canonical hash of everything else. */
export async function GET(_: Request, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  const s = getSnapshotByDate(date.replace(/\.json$/, ""));
  if (!s) return apiError(404, "not_found", `No snapshot for ${date}. List: /api/v1/snapshots`);
  return NextResponse.json(s, { headers: { ...CORS, "cache-control": "public, s-maxage=86400, immutable", etag: `"${s.sha256}"` } });
}
