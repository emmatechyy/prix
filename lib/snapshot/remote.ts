import { latestSnapshot, listSnapshotDates, parseSnapshot, readSnapshot } from "./io";
import type { Snapshot } from "./schema";

/**
 * Published snapshots live on the `data` branch (committed by the scheduled workflows on main).
 * The app and `pnpm verify` read them from the raw GitHub URL (ISR: revalidated every 30 min) and
 * fall back to the last good snapshot bundled in the repo when the fetch fails or does not verify.
 */
export const DATA_REPO = process.env.PRIX_DATA_REPO ?? "emmatechyy/prix";
export const DATA_BRANCH = process.env.PRIX_DATA_BRANCH ?? "data";
export const DATA_RAW = process.env.PRIX_DATA_RAW_URL ?? `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/data`;
export const DATA_REVALIDATE_S = 1800;
export type Manifest = { dates: string[]; latest: string | null; sha256: Record<string, string> };
export type Origin = "data-branch" | "bundled";

async function getText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init: RequestInit & { next?: { revalidate: number } } = { signal: ctrl.signal, next: { revalidate: DATA_REVALIDATE_S } };
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchManifest(): Promise<Manifest | null> {
  try {
    const m = JSON.parse(await getText(`${DATA_RAW}/snapshots/index.json`)) as Manifest;
    return Array.isArray(m.dates) ? m : null;
  } catch {
    return null;
  }
}

/** A data-branch snapshot, or null when it cannot be fetched, parsed, or its sha256 does not match. */
export async function fetchRemoteSnapshot(date: string): Promise<Snapshot | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try {
    const { snapshot, hashOk } = parseSnapshot(await getText(`${DATA_RAW}/snapshots/${date}.json`, 20000));
    return hashOk ? snapshot : null;
  } catch {
    return null;
  }
}

export async function loadLatest(): Promise<{ snapshot: Snapshot | null; dates: string[]; origin: Origin; note?: string }> {
  const bundledDates = listSnapshotDates();
  if (process.env.PRIX_DATA_OFFLINE === "1") return { snapshot: latestSnapshot(), dates: bundledDates, origin: "bundled", note: "offline mode" };
  const m = await fetchManifest();
  const bundled = latestSnapshot();
  if (m?.latest && (!bundled || m.latest >= bundled.date)) {
    const s = await fetchRemoteSnapshot(m.latest);
    if (s) return { snapshot: s, dates: [...new Set([...bundledDates, ...m.dates])].sort(), origin: "data-branch" };
  }
  return { snapshot: bundled, dates: [...new Set([...bundledDates, ...(m?.dates ?? [])])].sort(), origin: "bundled", note: m ? "data-branch snapshot missing or failed its hash check" : "data branch unreachable" };
}

export async function loadByDate(date: string): Promise<Snapshot | null> {
  return readSnapshot(date) ?? (process.env.PRIX_DATA_OFFLINE === "1" ? null : await fetchRemoteSnapshot(date));
}
