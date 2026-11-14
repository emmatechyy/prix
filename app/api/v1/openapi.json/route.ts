import { apiJson, options } from "@/lib/envelope";

export const dynamic = "force-static";
export const OPTIONS = options;

const envelope = (data: object) => ({
  type: "object",
  required: ["as_of", "methodology_version", "thresholds_version", "source_hash", "data"],
  properties: {
    as_of: { type: "string", format: "date-time", nullable: true },
    methodology_version: { type: "string", nullable: true },
    thresholds_version: { type: "integer" },
    thresholds_status: { type: "string", enum: ["locked", "DRAFT, not locked"] },
    thresholds_sha256: { type: "string" },
    source_hash: { type: "string", nullable: true, description: "sha256 of the published snapshot every number came from (data/snapshots/YYYY-MM-DD.json → sha256)" },
    snapshot: { type: "string", nullable: true, description: "Link to the snapshot file" },
    data,
  },
});
const ok = (description: string, data: object) => ({ "200": { description, content: { "application/json": { schema: envelope(data) } } } });
const err = { description: "Error", content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" }, message: { type: "string" } } } } } };

const spec = {
  openapi: "3.1.0",
  info: {
    title: "PRIX public API",
    version: "1.0.0",
    description: "Read-only NEAR investment-thesis data. Every number is taken from a published daily snapshot (sha256 in source_hash) or a linked upstream source. Missing data is null ('not reported'); nothing is estimated. CORS: *.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/api/v1/thesis": { get: { summary: "Verdicts H1–H6 from the latest snapshot", responses: { ...ok("Verdicts", { type: "object", properties: { verdicts: { type: "array", items: { type: "object" } }, claims: { type: "object" } } }), "503": err } } },
    "/api/v1/depth": {
      get: {
        summary: "Depth matrix (1Click dry quotes + RHEA router)",
        parameters: [
          { name: "token", in: "query", schema: { type: "string" }, description: "NEP-141 id or symbol" },
          { name: "size", in: "query", schema: { type: "integer", enum: [1000, 10000, 100000, 1000000] } },
        ],
        responses: { ...ok("Depth rows", { type: "object", properties: { meta: { type: "object" }, rows: { type: "array", items: { type: "object" } } } }), "400": err, "404": err },
      },
    },
    "/api/v1/integrity": { get: { summary: "RHEA TVL with and without rejected pools", responses: ok("Integrity", { type: "object" }) } },
    "/api/v1/history": { get: { summary: "One claim across all snapshots", parameters: [{ name: "claim", in: "query", required: true, schema: { type: "string", enum: ["H1", "H2", "H3", "H4", "H5", "H6"] } }], responses: { ...ok("History", { type: "object" }), "400": err } } },
    "/api/v1/snapshots": { get: { summary: "List published snapshots", responses: ok("Dates", { type: "object" }) } },
    "/api/v1/snapshots/{date}": { get: { summary: "One published snapshot file", parameters: [{ name: "date", in: "path", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } }], responses: { "200": { description: "Snapshot (its sha256 field = canonical hash of the rest)" }, "404": err } } },
    "/api/v1/index": { get: { summary: "Live index rows (legacy fields) + snapshot index in data", responses: { "200": { description: "Index" } } } },
    "/api/v1/flows": { get: { summary: "Live flows (legacy)", responses: { "200": { description: "Flows" } } } },
    "/api/v1/whales": { get: { summary: "Live whales (legacy)", responses: { "200": { description: "Whales" } } } },
    "/api/v1/launches": { get: { summary: "Live launches (legacy)", responses: { "200": { description: "Launches" } } } },
    "/api/v1/token/{id}": { get: { summary: "One token's evidence (legacy)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Token" } } } },
    "/feed.xml": { get: { summary: "Atom feed: one entry per verdict change", responses: { "200": { description: "Atom XML" } } } },
  },
};

export async function GET() {
  return apiJson(spec, { maxAge: 3600 });
}
