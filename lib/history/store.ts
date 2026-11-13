import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** JSON files under data/history: append-only raw observations that snapshots are built from. */
export const HISTORY_DIR = "data/history";
export function readHistory<T>(name: string, fallback: T, root = process.cwd()): T {
  const p = path.join(root, HISTORY_DIR, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}
export function writeHistory(name: string, data: unknown, root = process.cwd()) {
  mkdirSync(path.join(root, HISTORY_DIR), { recursive: true });
  writeFileSync(path.join(root, HISTORY_DIR, name), JSON.stringify(data, null, 1) + "\n");
}
