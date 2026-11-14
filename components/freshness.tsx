import Link from "next/link";
import { ago, nowMs } from "@/lib/format";
import { COPY } from "@/lib/copy";

/** Daily snapshots: older than 26 hours means the daily job missed a run. */
export const STALE_MS = 26 * 3600 * 1000;

export function FreshnessLine({ asOf, version, locked, date }: { asOf: string; version: number; locked: boolean; date: string }) {
  const stale = nowMs() - Date.parse(asOf) > STALE_MS;
  return (
    <p className="text-[15px] text-slate">
      {stale ? COPY.stale(ago(asOf)) : <>Updated {ago(asOf)}</>} · Snapshot{" "}
      <a href={`/api/v1/snapshots/${date}`} className="num text-ink underline underline-offset-4">
        {date}
      </a>{" "}
      ·{" "}
      <Link href="/method#thresholds" className="text-ink underline underline-offset-4">
        Thresholds v{version} ({locked ? "locked" : "DRAFT, not locked"})
      </Link>
    </p>
  );
}
