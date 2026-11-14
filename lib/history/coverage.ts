import type { FlowBucket } from "../snapshot/schema";

/** Union of the buckets' observed intervals inside [end − days, end]. Pure; used by the engine and the job. */
export function observedCoverage(buckets: Pick<FlowBucket, "start" | "end">[], endMs: number, days: number) {
  const from = endMs - days * 86400000;
  const iv = buckets
    .map((b) => [Math.max(Date.parse(b.start), from), Math.min(Date.parse(b.end), endMs)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let ms = 0, curA = -Infinity, curB = -Infinity;
  for (const [a, b] of iv) {
    if (a > curB) {
      if (curB > curA) ms += curB - curA;
      curA = a;
      curB = b;
    } else curB = Math.max(curB, b);
  }
  if (curB > curA) ms += curB - curA;
  return { hours: ms / 3600000, windowHours: days * 24, share: ms / (days * 86400000) };
}

/** Drop buckets whose interval overlaps one already kept (newest first), so no event is counted twice. */
export function nonOverlapping<T extends Pick<FlowBucket, "start" | "end">>(buckets: T[]): T[] {
  const sorted = [...buckets].sort((a, b) => b.end.localeCompare(a.end));
  const kept: T[] = [];
  let floor = Infinity;
  for (const b of sorted) {
    if (Date.parse(b.end) <= floor) {
      kept.push(b);
      floor = Date.parse(b.start);
    }
  }
  return kept.reverse();
}
