import "server-only";
import { cache } from "react";
import { loadByDate, loadLatest, DATA_REPO, DATA_BRANCH } from "../snapshot/remote";
import { loadThresholds } from "../thresholds/load";
import { computeVerdicts } from "../thesis/engine";

/** The published snapshot (data branch, falling back to the bundled copy) and the verdicts derived from it. */
export const getPublished = cache(async () => {
  const { snapshot, dates, origin, note } = await loadLatest();
  const th = loadThresholds();
  const verdicts = snapshot ? computeVerdicts(snapshot, th.rules, th.t) : [];
  return { snapshot, thresholds: th, verdicts, dates, origin, originNote: note };
});
export const getSnapshotByDate = cache((date: string) => loadByDate(date));

export const REPO = `https://github.com/${DATA_REPO}`;
/** Public link to a snapshot file on the data branch. */
export function snapshotUrl(date: string) {
  return `${REPO}/blob/${DATA_BRANCH}/data/snapshots/${date}.json`;
}
export function thresholdsLabel(locked: boolean) {
  return locked ? "locked" : "DRAFT, not locked";
}
