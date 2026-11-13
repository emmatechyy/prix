import { cache } from "react";

/**
 * Per-request memoisation in the app (React cache). In the snapshot CLI (PRIX_CLI=1) React's cache
 * is inactive outside a request, so a process-level memo is used instead to avoid duplicate upstream calls.
 */
export function memo<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  if (process.env.PRIX_CLI !== "1") return cache(fn);
  const m = new Map<string, Promise<R>>();
  return (...args: A) => {
    const k = JSON.stringify(args);
    let p = m.get(k);
    if (!p) m.set(k, (p = fn(...args)));
    return p;
  };
}
