import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { parse } from "yaml";
import { ThresholdsSchema, isLocked, type Thresholds } from "./schema";
import { compileRules, type Rules } from "./rules";

export const THRESHOLDS_PATH = "thresholds/v1.yaml";

export type LoadedThresholds = { t: Thresholds; rules: Rules; sha256: string; locked: boolean; path: string };

export function parseThresholds(text: string): Omit<LoadedThresholds, "path"> {
  const t = ThresholdsSchema.parse(parse(text));
  return { t, rules: compileRules(t), sha256: createHash("sha256").update(text).digest("hex"), locked: isLocked(t) };
}

let cached: LoadedThresholds | null = null;
/** Load and validate /thresholds/v1.yaml (throws on any schema or rule-parse error). */
export function loadThresholds(root = process.cwd()): LoadedThresholds {
  if (cached) return cached;
  const p = path.join(root, THRESHOLDS_PATH);
  cached = { ...parseThresholds(readFileSync(p, "utf8")), path: THRESHOLDS_PATH };
  return cached;
}
