import type { Metadata } from "next";
import { Badge, Card, CardHeader, Empty, PageHeader, SourceError, Sources } from "@/components/ui";
import { getWhales, WHALE_USD } from "@/lib/model/whales";
import { ago, explorer, num, shortId, usd, utc } from "@/lib/format";
import { safe } from "@/lib/safe";

export const revalidate = 600;
export const metadata: Metadata = { title: "Whale tracking" };

function Account({ id }: { id: string | null }) {
  if (!id) return <span className="text-faint">not resolved</span>;
  return (
    <a href={explorer.account(id)} target="_blank" rel="noreferrer" className="num text-text hover:text-info" title={id}>
      {shortId(id, 16)}
    </a>
  );
}
function Tx({ hash, receipt }: { hash: string | null; receipt: string }) {
  if (hash)
    return (
      <a href={explorer.tx(hash)} target="_blank" rel="noreferrer" className="num text-info hover:underline" title={hash}>
        {shortId(hash, 8)} ↗
      </a>
    );
  return <span className="num text-faint" title={`Receipt ${receipt} — transaction not resolved`}>rcpt {shortId(receipt, 6)}</span>;
}

export default async function Whales() {
  const w = await safe(getWhales);
  return (
    <>
      <PageHeader eyebrow="Whale tracking" title={`Moves of ${usd(WHALE_USD)} or more on RHEA`}>
        PRIX samples the latest 50 swaps in the busiest verified pools and the latest liquidity events in the deepest ones, values them at RHEA prices, and keeps every move of {usd(WHALE_USD)}+. The largest are traced from receipt to transaction to signer on NearBlocks so each row links to the chain.
      </PageHeader>
      {!w.ok ? (
        <SourceError what="Whale data" error={w.e} />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-faint">
            Snapshot {utc(w.v.asOf)} · {num(w.v.sampled.swaps)} swaps from {w.v.sampled.swapPools} pools (oldest {ago(w.v.sampled.oldestSwapTs)}) · {num(w.v.sampled.lpEvents)} liquidity events from {w.v.sampled.lpPools} pools{w.v.unresolved ? ` · ${w.v.unresolved} of the traced events could not be resolved to a transaction` : ""}
          </p>
          <Card>
            <CardHeader title={`Whale swaps (${w.v.swaps.length})`} subtitle="USD value uses the smaller of the two legs, so a mispriced token cannot inflate the size." />
            {w.v.swaps.length ? (
              <div className="scroll-x">
                <table className="data">
                  <thead><tr><th>When</th><th>Sold → Bought</th><th className="r">Size</th><th>Signer</th><th>Transaction</th><th>Pool</th></tr></thead>
                  <tbody>
                    {w.v.swaps.slice(0, 40).map((s) => (
                      <tr key={s.receipt_id}>
                        <td className="num text-muted" title={new Date(s.ts).toISOString()}>{ago(s.ts)}</td>
                        <td><span className="text-danger">{s.symbols[0]}</span> <span className="text-faint">→</span> <span className="text-accent">{s.symbols[1]}</span></td>
                        <td className="r num">{usd(s.usd)}</td>
                        <td><Account id={s.signer} /></td>
                        <td><Tx hash={s.txHash} receipt={s.receipt_id} /></td>
                        <td><a className="num text-faint hover:text-info" href={explorer.rheaPool(s.poolId)} target="_blank" rel="noreferrer" title={s.poolId}>{shortId(s.poolId, 8)}</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={`No swaps of ${usd(WHALE_USD)}+ in the current sample`}>The sampled window had only smaller trades. This is a real result, not missing data.</Empty>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader title={`Large liquidity moves (${w.v.lps.length})`} subtitle="Adds and removals of liquidity in the deepest verified pools, newest first." />
              {w.v.lps.length ? (
                <div className="scroll-x">
                  <table className="data">
                    <thead><tr><th>When</th><th>Action</th><th>Pool</th><th className="r">Value</th><th>Signer</th><th>Tx</th></tr></thead>
                    <tbody>
                      {w.v.lps.slice(0, 25).map((l) => (
                        <tr key={l.receipt_id}>
                          <td className="num text-muted">{ago(l.ts)}</td>
                          <td><Badge tone={l.method === "add" ? "accent" : "danger"}>{l.method === "add" ? "add" : "remove"}</Badge></td>
                          <td>{l.symbols.join(" / ")}</td>
                          <td className="r num">{usd(l.usd)}</td>
                          <td><Account id={l.signer} /></td>
                          <td><Tx hash={l.txHash} receipt={l.receipt_id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No liquidity moves above the threshold in the sample" />
              )}
            </Card>
            <Card>
              <CardHeader title="Most active large accounts" subtitle="Only events traced to a signer are counted." />
              {w.v.accounts.length ? (
                <div className="scroll-x">
                  <table className="data">
                    <thead><tr><th>Account</th><th className="r">Swapped</th><th className="r">LP added</th><th className="r">LP removed</th><th className="r">Events</th></tr></thead>
                    <tbody>
                      {w.v.accounts.slice(0, 15).map((a) => (
                        <tr key={a.account}>
                          <td><Account id={a.account} /></td>
                          <td className="r num">{a.swapUsd ? usd(a.swapUsd) : "—"}</td>
                          <td className="r num text-accent">{a.lpAddUsd ? usd(a.lpAddUsd) : "—"}</td>
                          <td className="r num text-danger">{a.lpRemoveUsd ? usd(a.lpRemoveUsd) : "—"}</td>
                          <td className="r num text-muted">{a.events}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No signers resolved yet" />
              )}
            </Card>
          </div>
          <Card><Sources urls={["https://api.rhea.finance/get-recent-transaction-dcl-swap", "https://api.rhea.finance/get-recent-transaction-liquidity", "https://api.nearblocks.io/v3/search/receipts", "https://api.nearblocks.io/v3/txns/<hash>"]} /></Card>
        </div>
      )}
    </>
  );
}
