import "server-only";
import { cache } from "react";
import { latestSnapshot, listSnapshotDates, readSnapshot } from "../snapshot/io";
import { loadThresholds } from "../thresholds/load";
import { computeVerdicts } from "../thesis/engine";
import type { Snapshot } from "../snapshot/schema";

/** The published snapshot (data/snapshots, committed by the daily job) and the verdicts derived from it. */
export const getPublished = cache(() => {
  const snapshot = latestSnapshot();
  const th = loadThresholds();
  const verdicts = snapshot ? computeVerdicts(snapshot, th.rules, th.t) : [];
  return { snapshot, thresholds: th, verdicts, dates: listSnapshotDates() };
});
export const getSnapshotByDate = cache((date: string): Snapshot | null => readSnapshot(date));

export const REPO = "https://github.com/emmatechyy/prix";
/** Public link to a snapshot file (the integration branch until merged; main after). */
export function snapshotUrl(date: string) {
  const ref = process.env.VERCEL_GIT_COMMIT_REF || "main";
  return `${REPO}/blob/${ref}/data/snapshots/${date}.json`;
}
export function thresholdsLabel(locked: boolean) {
  return locked ? "locked" : "DRAFT, not locked";
}
