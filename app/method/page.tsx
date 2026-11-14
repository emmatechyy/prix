import type { Metadata } from "next";
import Link from "next/link";
import { getPublished, REPO } from "@/lib/server/published";
import { CopyCommand } from "@/components/copy-command";
import { PageTitle } from "@/components/ui";
import { EvidenceGrade } from "@/components/verdict";
import { GRADE_TEXT } from "@/lib/copy";
import { MethodDefinitions, SOURCES } from "@/components/views/method-definitions";
import { utc } from "@/lib/format";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Method",
  description: "How PRIX verdicts work: pre-registered thresholds, evidence grades, data sources with fetch times, a three-command re-run, the API, limits and the neutrality note.",
};

const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="display scroll-mt-28 text-[44px] text-ink sm:text-[56px]">
    {children}
  </h2>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="measure text-[17px] leading-[1.6] text-ink">{children}</p>;

const CHANGELOG: [string, string][] = [
  ["2026-11-14", "Frontend: four destinations (Verdicts, Tokens, Capital, Method), threshold rails, evidence panels, light and dark themes. Old addresses redirect permanently."],
  ["2026-11-14", "Methodology 2.1: H4 measures volume share from verified pools out of all live pools, with wash flags; H5 needs 80% coverage of both windows before any verdict; 1Click slippage is net of the flat app fee; every depth row names its router and version; snapshots move to the data branch."],
  ["2026-11-13", "Thresholds v1 written down as a DRAFT (not locked). First self-contained daily snapshot with sha256, verdict engine for H1–H6, depth matrix, public API with source_hash."],
];

export default async function Method() {
  const { thresholds: th, snapshot: s } = await getPublished();
  const fetched = new Map<string, string>();
  for (const x of s?.sources ?? []) {
    const host = /^https?:\/\/([^/\s?#]+)/.exec(x.url)?.[1];
    if (!host) continue;
    const prev = fetched.get(host);
    if (!prev || x.fetched_at > prev) fetched.set(host, x.fetched_at);
  }
  const example = s ? `curl -s https://prix-orcin.vercel.app/api/v1/thesis` : "";
  return (
    <article className="grid gap-16 sm:gap-20 [&>*]:min-w-0">
      <header>
        <PageTitle title="Method">How PRIX reaches a verdict, and how to check it yourself.</PageTitle>
        <nav aria-label="On this page" className="-mt-4 flex flex-wrap gap-2 text-[15px]">
          {[
            ["how", "How verdicts work"],
            ["thresholds", "Thresholds"],
            ["grades", "Evidence grades"],
            ["sources", "Data sources"],
            ["rerun", "Re-run it"],
            ["api", "API"],
            ["limits", "Limits and neutrality"],
            ["changelog", "Changelog"],
          ].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-rule-strong px-4 font-medium text-ink transition-colors duration-300 hover:bg-wash">
              {l}
            </a>
          ))}
        </nav>
      </header>

      <section aria-labelledby="how" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="how">How verdicts work</H2>
        <P>PRIX tests six claims about NEAR. Each claim has one metric and two thresholds, written in a public file before the data was read: one for Supported, one for Not supported. Anything between them is Mixed.</P>
        <P>Once a day, a job reads public sources (RHEA, NEAR RPC, NearBlocks, FastNEAR, NEAR Intents), writes everything it read into one snapshot file and hashes it with sha256. The verdicts are computed from that file alone, by plain code with no language model involved, so anyone with the file gets the same answer.</P>
        <P>If a claim does not have enough data, PRIX says “Not enough data yet” and shows how much is missing. Missing values read “Not reported” and are never estimated.</P>
      </section>

      <section aria-labelledby="thresholds" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="thresholds">Thresholds</H2>
        <P>
          Version {th.t.version}, <strong>{th.locked ? "locked" : "DRAFT, not locked"}</strong>. Lock commit: {th.locked ? <code className="num">{th.t.locked_at_commit}</code> : "not set yet"}. Once locked, any change becomes a new version and old and new verdicts are shown side by side.
        </P>
        <p className="text-[15px] text-slate">
          <a href={`${REPO}/blob/main/thresholds/v1.yaml`} className="text-ink underline underline-offset-4" target="_blank" rel="noreferrer">
            thresholds/v1.yaml
          </a>{" "}
          · sha256 <span className="num">{th.sha256.slice(0, 16)}…</span> ·{" "}
          <a href={`${REPO}/blob/main/docs/threshold-diff.md`} className="text-ink underline underline-offset-4" target="_blank" rel="noreferrer">
            what changed from earlier rules
          </a>
        </p>
        <div tabIndex={0} className="scroll-x rounded-[20px] bg-surface py-1">
          <table className="data">
            <caption className="sr-only">Pre-registered thresholds for each claim</caption>
            <thead>
              <tr>
                <th scope="col">Claim</th>
                <th scope="col">Metric</th>
                <th scope="col">Supported</th>
                <th scope="col">Not supported</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(th.t.claims).map(([id, c]) => (
                <tr key={id}>
                  <td className="num align-top">
                    <Link href={`/#${id.toLowerCase()}`} className="underline underline-offset-4">
                      {id}
                    </Link>
                  </td>
                  <td className="align-top">
                    <div className="min-w-[220px] whitespace-normal">{c.metric.replace(/\s+/g, " ")}</div>
                  </td>
                  <td className="align-top">
                    <code className="block min-w-[160px] text-[13px] whitespace-normal">{c.supported}</code>
                  </td>
                  <td className="align-top">
                    <code className="block min-w-[140px] text-[13px] whitespace-normal">{c.not_supported}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="grades" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="grades">Evidence grades</H2>
        <ul className="grid gap-2">
          {(["A", "B", "C"] as const).map((g) => (
            <li key={g} className="measure flex flex-wrap items-baseline gap-2 text-[17px]">
              <EvidenceGrade g={g} />
              <span>{GRADE_TEXT[g].replace(/^Grade [ABC]: /, "")}</span>
            </li>
          ))}
        </ul>
        <P>H3 drops to grade C when a passing token’s depth comes only from pool reserve math rather than a router quote.</P>
      </section>

      <section aria-labelledby="sources" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="sources">Data sources</H2>
        <div tabIndex={0} className="scroll-x rounded-[20px] bg-surface py-1">
          <table className="data">
            <caption className="sr-only">Data sources and when the published snapshot last fetched them</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Used for</th>
                <th scope="col">Last fetched</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map(([name, url, what]) => {
                const host = new URL(url).host;
                const f = fetched.get(host);
                return (
                  <tr key={name}>
                    <td className="align-top">
                      <a href={url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-4">
                        {name}
                      </a>
                    </td>
                    <td className="align-top">
                      <div className="min-w-[240px] whitespace-normal text-slate">{what}</div>
                    </td>
                    <td className="num align-top text-slate">{f ? utc(f) : host.endsWith("theblock.co") ? "cited, not fetched" : "live (cached 10 min)"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s && <p className="text-[15px] text-slate">Fetch times are from snapshot {s.date}; live pages (Tokens, Capital) refetch every 10 minutes.</p>}
      </section>

      <section aria-labelledby="rerun" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="rerun">Re-run it yourself</H2>
        <P>Three commands. The last one refetches every source, rebuilds the snapshot in memory and compares it with the published one.</P>
        <div className="grid max-w-[640px] gap-2">
          <CopyCommand text="git clone https://github.com/emmatechyy/prix && cd prix" />
          <CopyCommand text="pnpm install --frozen-lockfile" />
          <CopyCommand text="pnpm verify" />
        </div>
        <p className="text-[15px] text-slate">
          Add <code className="num">--claim H4</code> to print one claim’s figures, or <code className="num">--offline</code> to check only the hash and the verdicts.
        </p>
      </section>

      <section aria-labelledby="api" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="api">API</H2>
        <P>
          Public, read-only, CORS open. Every snapshot-backed response carries <code className="num">source_hash</code>, the sha256 of the snapshot it came from. Full description:{" "}
          <a href="/api/v1/openapi.json" className="underline underline-offset-4">
            /api/v1/openapi.json
          </a>
          .
        </P>
        <div className="max-w-[640px]">{example && <CopyCommand text={example} />}</div>
        <ul className="measure grid gap-1 text-[15px] text-slate">
          <li><code className="num text-ink">/api/v1/thesis</code> verdicts H1–H6</li>
          <li><code className="num text-ink">/api/v1/history?claim=H4</code> one claim across all snapshots</li>
          <li><code className="num text-ink">/api/v1/depth</code> depth matrix rows</li>
          <li><code className="num text-ink">/api/v1/integrity</code> TVL with and without the pools we didn’t count</li>
          <li><code className="num text-ink">/api/v1/snapshots/&lt;date&gt;</code> a published snapshot file</li>
          <li><code className="num text-ink">/api/v1/index</code>, <code className="num text-ink">/flows</code>, <code className="num text-ink">/whales</code>, <code className="num text-ink">/launches</code> live views</li>
        </ul>
      </section>

      <section aria-labelledby="limits" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="limits">Limits and neutrality</H2>
        <P>RHEA is both a data source and a subject of the thesis. PRIX therefore never takes RHEA’s headline numbers on trust: it recomputes TVL pool by pool, leaves out pools it cannot price, and checks RHEA prices against NEAR Intents. PRIX has no commercial relationship with RHEA or NEAR Intents.</P>
        <P>
          The 2026-10-01 NEAR Intents incident date comes from the team’s own statement and press reports
          {s ? ` (${s.incident.sources.map((x) => x.publisher).join(", ")})` : ""}; where they disagree on timing or amount, PRIX shows the range.
        </P>
        <ul className="measure grid list-disc gap-1 pl-5 text-[15px] text-slate">
          <li>H2 needs 30 daily snapshots; there is no honest backfill, so it reads “Not enough data yet” until the window fills.</li>
          <li>H5 flows are read page by page from NearBlocks; only hours actually read count as coverage, and nothing is scaled up.</li>
          <li>1Click quotes without a partner key carry a flat 0.2% app fee, reported on its own; slippage is measured net of it.</li>
          <li>Holdings outside RHEA (other exchanges) are not covered. FastNEAR returns the top 100 holders only.</li>
        </ul>
      </section>

      <section aria-labelledby="changelog" className="grid min-w-0 gap-3 [&>*]:min-w-0">
        <H2 id="changelog">Changelog</H2>
        <ol className="measure grid gap-3">
          {CHANGELOG.map(([d, t]) => (
            <li key={t} className="text-[15px]">
              <span className="num font-semibold text-ink">{d}</span> <span className="text-slate">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="definitions" className="grid min-w-0 grid-cols-1 gap-3 [&>*]:min-w-0">
        <H2 id="definitions">Definitions behind the index</H2>
        <P>The rules behind Tokens and Capital: what PRIX refuses to count, how the score is built, and the curated labels.</P>
        <MethodDefinitions th={th} />
      </section>
    </article>
  );
}
