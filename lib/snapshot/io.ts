import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { SnapshotSchema, type Snapshot } from "./schema";
import { snapshotHash } from "./hash";

/** Published daily snapshots: data/snapshots/YYYY-MM-DD.json (committed by the daily GitHub Action). */
export const SNAPSHOT_DIR = "data/snapshots";
const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export function listSnapshotDates(root = process.cwd()): string[] {
  const dir = path.join(root, SNAPSHOT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => DATE_FILE.exec(f)?.[1])
    .filter((d): d is string => !!d)
    .sort();
}
export function snapshotPath(date: string, root = process.cwd()) {
  return path.join(root, SNAPSHOT_DIR, `${date}.json`);
}
/** Parse + schema-validate a snapshot file and check its embedded sha256. */
export function parseSnapshot(text: string): { snapshot: Snapshot; hashOk: boolean } {
  const snapshot = SnapshotSchema.parse(JSON.parse(text));
  return { snapshot, hashOk: snapshotHash(snapshot) === snapshot.sha256 };
}
export function readSnapshotFile(file: string) {
  return parseSnapshot(readFileSync(file, "utf8"));
}
export function readSnapshot(date: string, root = process.cwd()): Snapshot | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const p = snapshotPath(date, root);
  if (!existsSync(p)) return null;
  try {
    return readSnapshotFile(p).snapshot;
  } catch {
    return null; // written under an older schema
  }
}
/** Newest snapshot that parses under the current schema. */
export function latestSnapshot(root = process.cwd()): Snapshot | null {
  for (const d of listSnapshotDates(root).reverse()) {
    const s = readSnapshot(d, root);
    if (s) return s;
  }
  return null;
}
/** Raw JSON of the newest snapshot file, schema-agnostic (used to carry H2 days forward across schema changes). */
export function latestSnapshotRaw(root = process.cwd()): Record<string, unknown> | null {
  const d = listSnapshotDates(root).at(-1);
  if (!d) return null;
  try {
    return JSON.parse(readFileSync(snapshotPath(d, root), "utf8"));
  } catch {
    return null;
  }
}
/** data/snapshots/index.json: the manifest the app reads from the data branch. */
export function writeManifest(root = process.cwd()) {
  const dates = listSnapshotDates(root);
  const sha256: Record<string, string> = {};
  for (const d of dates) {
    try {
      sha256[d] = (JSON.parse(readFileSync(snapshotPath(d, root), "utf8")) as { sha256: string }).sha256;
    } catch {}
  }
  const p = path.join(root, SNAPSHOT_DIR, "index.json");
  writeFileSync(p, JSON.stringify({ dates, latest: dates.at(-1) ?? null, sha256 }, null, 1) + "\n");
  return p;
}
export function writeSnapshot(s: Snapshot, root = process.cwd()) {
  mkdirSync(path.join(root, SNAPSHOT_DIR), { recursive: true });
  const p = snapshotPath(s.date, root);
  writeFileSync(p, JSON.stringify(s, null, 1) + "\n");
  writeManifest(root);
  return p;
}
