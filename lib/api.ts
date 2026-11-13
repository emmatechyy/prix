import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "access-control-allow-origin": "*", "cache-control": "public, s-maxage=600, stale-while-revalidate=1200" },
  });
}
export function fail(e: unknown) {
  return json({ error: "upstream_unavailable", message: e instanceof Error ? e.message : "error" }, 503);
}
