import { createHash } from "node:crypto";

/** Canonical JSON: object keys sorted recursively, no whitespace. Arrays keep their order. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Hash of the canonical JSON of a snapshot, excluding its own `sha256` field. */
export function snapshotHash(s: { sha256?: string } & Record<string, unknown>): string {
  const { sha256: _omit, ...rest } = s;
  void _omit;
  return sha256(canonical(rest));
}
