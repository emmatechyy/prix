import { NextResponse } from "next/server";
import type { Snapshot } from "./snapshot/schema";
import type { LoadedThresholds } from "./thresholds/load";

/** Common API envelope (spec §7). source_hash = sha256 of the snapshot every number came from. */
export type Envelope<T> = {
  as_of: string | null;
  methodology_version: string | null;
  thresholds_version: number;
  thresholds_status: "locked" | "DRAFT, not locked";
  thresholds_sha256: string;
  source_hash: string | null;
  snapshot: string | null;
  data: T;
};
export function envelope<T>(s: Snapshot | null, th: LoadedThresholds, data: T, snapshotUrl?: string): Envelope<T> {
  return {
    as_of: s?.as_of ?? null,
    methodology_version: s?.methodology_version ?? null,
    thresholds_version: th.t.version,
    thresholds_status: th.locked ? "locked" : "DRAFT, not locked",
    thresholds_sha256: th.sha256,
    source_hash: s?.sha256 ?? null,
    snapshot: snapshotUrl ?? null,
    data,
  };
}
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
export function apiJson(body: unknown, { status = 200, maxAge = 600 } = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, "cache-control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` } });
}
export function apiError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: { ...CORS, "cache-control": "no-store" } });
}
export function options() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
