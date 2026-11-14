import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "./ui";

/** Small pieces shared by the snapshot-backed pages (thesis, depth, integrity, methodology). */
export function snapshotApi(date: string) {
  return `/api/v1/snapshots/${date}`;
}

/** Link for an evidence source: an external URL, or a field of the published snapshot. */
export function EvidenceSource({ source, date }: { source?: string; date: string }) {
  if (!source) return <span className="text-[13px] text-faint">derived</span>;
  if (source.startsWith("snapshot:")) {
    const field = source.slice("snapshot:".length);
    return (
      <a href={snapshotApi(date)} className="text-[13px] whitespace-nowrap text-faint underline-offset-4 hover:text-text hover:underline" title={`Field ${field} of the published snapshot ${date}`}>
        snapshot ↗
      </a>
    );
  }
  if (/^https?:\/\//.test(source))
    return (
      <a href={source} target="_blank" rel="noreferrer" title={source} className="text-[13px] whitespace-nowrap text-faint underline-offset-4 hover:text-text hover:underline">
        src ↗
      </a>
    );
  return <span className="text-[13px] text-faint">{source}</span>;
}

export function ThresholdsBadge({ version, locked }: { version: number; locked: boolean }) {
  return (
    <Link href="/method#thresholds" className="inline-flex">
      <Badge tone={locked ? "up" : "warn"} title="Pre-registered thresholds: thresholds/v1.yaml">
        thresholds v{version}: {locked ? "locked" : "DRAFT, not locked"}
      </Badge>
    </Link>
  );
}

/** Snapshot provenance line: date, sha256 (linked to the file), thresholds status. */
export function Provenance({ date, sha, asOf, version, locked, extra }: { date: string; sha: string; asOf: string; version: number; locked: boolean; extra?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-muted">
      <span>
        Snapshot <a href={snapshotApi(date)} className="num text-ink underline-offset-4 hover:underline">{date}</a> · built {asOf.slice(11, 16)} UTC
      </span>
      <span className="num text-[13px] text-faint" title={sha}>
        sha256 {sha.slice(0, 12)}…
      </span>
      <ThresholdsBadge version={version} locked={locked} />
      {extra}
    </div>
  );
}

export function NoSnapshot() {
  return (
    <div role="alert" className="rounded-lg border border-rule px-5 py-4 text-[14.5px]">
      <p className="font-medium text-ink">No published snapshot yet</p>
      <p className="mt-1 text-[13.5px] text-muted">Run <code className="num">pnpm snapshot:daily</code>. The daily GitHub Action commits one to data/snapshots/.</p>
    </div>
  );
}
