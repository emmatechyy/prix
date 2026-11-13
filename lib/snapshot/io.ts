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
  return readSnapshotFile(p).snapshot;
}
export function latestSnapshot(root = process.cwd()): Snapshot | null {
  const d = listSnapshotDates(root).at(-1);
  return d ? readSnapshot(d, root) : null;
}
export function writeSnapshot(s: Snapshot, root = process.cwd()) {
  mkdirSync(path.join(root, SNAPSHOT_DIR), { recursive: true });
  const p = snapshotPath(s.date, root);
  writeFileSync(p, JSON.stringify(s, null, 1) + "\n");
  return p;
}
