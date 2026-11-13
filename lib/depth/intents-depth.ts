import "server-only";
import { mapLimit } from "../http";
import { ONECLICK } from "../sources/endpoints";
import { getOneClickTokens, type OneClickToken } from "../sources/near";
import type { DepthRow } from "../snapshot/schema";
import { applyBaselines, DEPTH_SIZES, statusFromError, usdToBaseUnits } from "./slippage";
export { usdToBaseUnits };

/**
 * NEAR Intents depth via 1Click *dry-run* quotes (POST /v0/quote with dry:true).
 * Dry quotes return no deposit address, so nothing can be sent: PRIX never deposits and never signs.
 * Auth is optional and server-side only: ONECLICK_API_KEY (X-API-Key) or ONECLICK_JWT (Bearer).
 * Without a key the API adds a 20 bps app fee; it is identical at every size and cancels out of
 * relative slippage, and is recorded in fee_usd.
 */
export const ORIGINS = [
  { symbol: "BTC", assetId: "nep141:btc.omft.near" },
  { symbol: "ETH", assetId: "nep141:eth.omft.near" },
  { symbol: "SOL", assetId: "nep141:sol.omft.near" },
] as const;
export const QUOTE_CAP = 96;
export const QUOTE_URL = `${ONECLICK}/v0/quote`;
const READONLY_ACCOUNT = "prix-readonly.near"; // recipient/refund placeholder; dry quotes never execute

export function oneClickAuth(): { mode: "api-key" | "jwt" | "none"; headers: Record<string, string> } {
  if (process.env.ONECLICK_API_KEY) return { mode: "api-key", headers: { "x-api-key": process.env.ONECLICK_API_KEY } };
  if (process.env.ONECLICK_JWT) return { mode: "jwt", headers: { authorization: `Bearer ${process.env.ONECLICK_JWT}` } };
  return { mode: "none", headers: {} };
}

type QuoteOk = { quote: { amountInUsd?: string; amountOutUsd?: string }; quoteRequest?: { appFees?: { fee: number }[] } };

async function dryQuote(origin: string, destination: string, amount: string, headers: Record<string, string>) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(QUOTE_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify({
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset: origin,
        depositType: "INTENTS",
        destinationAsset: destination,
        amount,
        refundTo: READONLY_ACCOUNT,
        refundType: "INTENTS",
        recipient: READONLY_ACCOUNT,
        recipientType: "INTENTS",
        deadline: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as QuoteOk & { message?: string };
    return { http: res.status, ok: res.ok, body, ms: Date.now() - t0 };
  } catch (e) {
    return { http: null, ok: false, body: { message: e instanceof Error ? e.message : String(e) } as QuoteOk & { message?: string }, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

export type IntentsDepthResult = { rows: DepthRow[]; attempted: number; ok: number; auth: "api-key" | "jwt" | "none"; tokensSource: string };

/**
 * Quote every (origin × token × size) for the given index tokens, buying the token with BTC/ETH/SOL.
 * Concurrency 3, hard cap of 96 quotes per run. Tokens 1Click does not list get status no-route without a call.
 */
export async function getIntentsDepth(candidates: string[], { maxTokens = 8, cap = QUOTE_CAP, concurrency = 3, log = ((m: string) => void m) as (m: string) => void } = {}): Promise<IntentsDepthResult> {
  const auth = oneClickAuth();
  const tokens = await getOneClickTokens();
  const byId = new Map<string, OneClickToken>(tokens.map((t) => [t.assetId, t]));
  // The top `maxTokens` candidates (in index order) that 1Click lists are quoted; candidates it does
  // not list get one no-route row per size without a call, so the gap stays visible.
  const listed = candidates.filter((t) => byId.has(`nep141:${t}`)).slice(0, maxTokens);
  const unlisted = candidates.filter((t) => !byId.has(`nep141:${t}`));
  const fetched_at0 = new Date().toISOString();
  const unlistedRows: DepthRow[] = unlisted.flatMap((token) =>
    DEPTH_SIZES.map((size) => ({ route: "intents" as const, router: "1click-dry", origin: "any", destination_token: `nep141:${token}`, token_id: token, size_usd: size, amount_in_usd: null, amount_out_usd: null, fee_usd: null, relative_slippage: null, quote_ms: null, fetched_at: fetched_at0, status: "no-route" as const, error: "token not listed by 1Click /v0/tokens (no quote requested)" })),
  );
  const jobs: { origin: (typeof ORIGINS)[number]; token: string; size: number }[] = [];
  for (const token of listed) for (const origin of ORIGINS) for (const size of DEPTH_SIZES) jobs.push({ origin, token, size });
  let attempted = 0;
  const fetched_at = new Date().toISOString();
  const settled = await mapLimit(jobs, concurrency, async ({ origin, token, size }): Promise<DepthRow> => {
    const dest = `nep141:${token}`;
    const base: Omit<DepthRow, "status"> = { route: "intents", router: "1click-dry", origin: origin.symbol, destination_token: dest, token_id: token, size_usd: size, amount_in_usd: null, amount_out_usd: null, fee_usd: null, relative_slippage: null, quote_ms: null, fetched_at };
    const o = byId.get(origin.assetId);
    if (!o || !(o.price > 0)) return { ...base, status: "error", error: `origin ${origin.symbol} has no 1Click price` };
    if (!byId.has(dest)) return { ...base, status: "no-route", error: "token not listed by 1Click /v0/tokens" };
    if (attempted >= cap) return { ...base, status: "error", error: `quote cap ${cap} reached` };
    attempted++;
    const q = await dryQuote(origin.assetId, dest, usdToBaseUnits(size, o.price, o.decimals), auth.headers);
    if (!q.ok) return { ...base, quote_ms: q.ms, status: statusFromError(q.http, q.body.message ?? `HTTP ${q.http}`), error: (q.body.message ?? `HTTP ${q.http}`).slice(0, 160) };
    const inUsd = Number(q.body.quote.amountInUsd);
    const outUsd = Number(q.body.quote.amountOutUsd);
    const feeBps = (q.body.quoteRequest?.appFees ?? []).reduce((a, f) => a + f.fee, 0);
    return { ...base, quote_ms: q.ms, amount_in_usd: Number.isFinite(inUsd) ? inUsd : null, amount_out_usd: Number.isFinite(outUsd) ? outUsd : null, fee_usd: Number.isFinite(inUsd) ? (inUsd * feeBps) / 10000 : null, status: "ok" };
  });
  const rows = settled.filter((r): r is DepthRow => r != null);
  const out = [...applyBaselines(rows), ...unlistedRows];
  const ok = out.filter((r) => r.status === "ok").length;
  const counts = out.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  log(`intents depth: ${attempted} quotes attempted (cap ${cap}), ${JSON.stringify(counts)}, auth ${auth.mode}`);
  return { rows: out, attempted, ok, auth: auth.mode, tokensSource: `${ONECLICK}/v0/tokens` };
}
