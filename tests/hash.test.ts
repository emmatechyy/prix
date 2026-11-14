import { describe, expect, it } from "vitest";
import { canonical, snapshotHash } from "../lib/snapshot/hash";
describe("canonical hashing", () => {
  it("is key-order independent", () => expect(canonical({ b: 1, a: { d: 2, c: [3, 1] } })).toBe(canonical({ a: { c: [3, 1], d: 2 }, b: 1 })));
  it("excludes the sha256 field", () => expect(snapshotHash({ a: 1, sha256: "x" })).toBe(snapshotHash({ a: 1, sha256: "y" })));
});
