import "server-only";
import { fetchJson } from "../http";
import { ARCHIVAL_RPC } from "./endpoints";

/** Read-only NEAR archival JSON-RPC: historical blocks and view calls at a past block height. */
type RpcResp<T> = { result?: T; error?: { message?: string; cause?: { name?: string } } };

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const r = await fetchJson<RpcResp<T>>(ARCHIVAL_RPC, { method: "POST", revalidate: 86400, timeoutMs: 20000, body: { jsonrpc: "2.0", id: "prix", method, params } });
  if (!r.result) throw new Error(r.error?.cause?.name ?? r.error?.message ?? "RPC error");
  return r.result;
}

type BlockHeader = { height: number; timestamp: number; hash: string };
async function blockAt(height: number): Promise<BlockHeader | null> {
  try {
    const b = await rpc<{ header: { height: number; timestamp: number; hash: string } }>("block", { block_id: height });
    return { height: b.header.height, timestamp: b.header.timestamp / 1e6, hash: b.header.hash };
  } catch (e) {
    if (e instanceof Error && /UNKNOWN_BLOCK|not found|DB Not Found/i.test(e.message)) return null;
    throw e;
  }
}
/** A produced block at or just after `h` (NEAR skips some heights). */
async function blockFrom(h: number): Promise<BlockHeader> {
  for (let i = 0; i < 20; i++) {
    const b = await blockAt(h + i);
    if (b) return b;
  }
  throw new Error(`no block found from height ${h}`);
}
export async function latestBlock(): Promise<BlockHeader> {
  const b = await rpc<{ header: { height: number; timestamp: number; hash: string } }>("block", { finality: "final" });
  return { height: b.header.height, timestamp: b.header.timestamp / 1e6, hash: b.header.hash };
}

/** First block whose timestamp is ≥ tsMs (secant search on height; exact to one block). */
export async function blockAtTime(tsMs: number, ref?: BlockHeader): Promise<BlockHeader> {
  const top = ref ?? (await latestBlock());
  if (tsMs >= top.timestamp) return top;
  let lo = await blockFrom(Math.max(1, top.height - Math.ceil((top.timestamp - tsMs) / 500) - 20000));
  let hi = top;
  if (lo.timestamp > tsMs) lo = await blockFrom(Math.max(1, lo.height - 400000));
  for (let i = 0; i < 40 && hi.height - lo.height > 1; i++) {
    const rate = (hi.timestamp - lo.timestamp) / (hi.height - lo.height);
    let guess = Math.round(lo.height + (tsMs - lo.timestamp) / rate);
    guess = Math.min(hi.height - 1, Math.max(lo.height + 1, guess));
    if (hi.height - lo.height < 64) guess = Math.floor((lo.height + hi.height) / 2);
    const b = await blockFrom(guess);
    if (b.height >= hi.height) {
      hi = b.timestamp >= tsMs ? b : hi;
      break;
    }
    if (b.timestamp < tsMs) lo = b;
    else hi = b;
  }
  return hi;
}

/** ft_balance_of(account) on `token` at a historical block height. Returns the raw integer string. */
export async function ftBalanceAt(token: string, account: string, height: number): Promise<string> {
  const r = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    block_id: height,
    account_id: token,
    method_name: "ft_balance_of",
    args_base64: Buffer.from(JSON.stringify({ account_id: account })).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString("utf8")) as string;
}
export const archivalSource = (token: string, height: number) => `${ARCHIVAL_RPC} · ${token}.ft_balance_of(intents.near) @ block ${height}`;
