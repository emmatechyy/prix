import type { CSSProperties } from "react";
import type { Verdict, VerdictValue } from "@/lib/thesis/engine";
import type { RailModel, ZoneKind } from "@/lib/thesis/rail";
import { VERDICT_WORD } from "@/lib/thesis/rail";
import { GRADE_TEXT, plain } from "@/lib/copy";
import { CopyCommand } from "./copy-command";
import { EvidenceSource } from "./snapshot-ui";

/* Colour means evidence: these are the only places verdict colours are used. Every verdict also
   carries an icon and a word, and every zone an edge pattern, so nothing relies on colour alone. */
const VAR: Record<VerdictValue, string> = {
  Supported: "var(--supported)",
  Mixed: "var(--mixed)",
  "Not supported": "var(--not-supported)",
  "Insufficient data": "var(--no-data)",
};
const EDGE: Record<ZoneKind, string> = { Supported: "solid", Mixed: "dashed", "Not supported": "dotted" };

export function VerdictIcon({ v, size = 16, color = "currentColor" }: { v: VerdictValue; size?: number; color?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (v === "Supported") return <svg {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>;
  if (v === "Mixed") return <svg {...p}><path d="M4 14c2.5-4 5-4 8-2s5.5 2 8-2" /></svg>;
  if (v === "Not supported") return <svg {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>;
  return <svg {...p} strokeWidth={2.2}><circle cx="12" cy="12" r="8" strokeDasharray="3.2 3" /></svg>;
}

export function VerdictBadge({ v }: { v: VerdictValue }) {
  const c = VAR[v];
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 self-start rounded-full border-[1.5px] px-3 text-[15px] font-semibold whitespace-nowrap ${v === "Insufficient data" ? "hatch border-dashed" : ""}`}
      style={{ color: c, borderColor: c, background: v === "Insufficient data" ? undefined : `color-mix(in srgb, ${c} 10%, transparent)` }}
    >
      <VerdictIcon v={v} />
      {VERDICT_WORD[v]}
    </span>
  );
}

export function EvidenceGrade({ g }: { g: "A" | "B" | "C" }) {
  return (
    <abbr title={GRADE_TEXT[g]} className="inline-flex items-center rounded-full border border-rule px-2 text-[13px] font-medium text-ink no-underline">
      Grade {g}
    </abbr>
  );
}

/** Signature component (spec §5): measured value against the pre-registered thresholds. */
export function ThresholdRail({ m, verdict }: { m: RailModel; verdict: VerdictValue }) {
  if (m.kind === "coverage") return <CoverageBar share={m.share} min={m.min} sentence={m.sentence} />;
  const [a, b] = m.domain;
  const at = (x: number) => ((x - a) / (b - a)) * 100;
  const flip = (x: number) => (m.lowerIsBetter ? 100 - x : x);
  return (
    <div className="w-full">
      <div role="img" aria-label={m.sentence} className="relative pt-1">
        <div className="relative h-3 w-full overflow-hidden rounded-[3px] border border-rule">
          {m.zones.map((z) => {
            const l = Math.min(flip(at(z.from)), flip(at(z.to)));
            const w = Math.abs(at(z.to) - at(z.from));
            return (
              <span
                key={`${z.kind}${z.from}`}
                className="absolute inset-y-0"
                style={{ left: `${l}%`, width: `${w}%`, background: `color-mix(in srgb, ${VAR[z.kind]} 12%, transparent)`, borderBottom: `3px ${EDGE[z.kind]} ${VAR[z.kind]}` }}
              />
            );
          })}
        </div>
        {m.pos != null && (
          <span className="rail-marker absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-[45%] place-items-center rounded-full border-2 border-surface bg-ink" style={{ left: `${flip(m.pos * 100)}%` } as CSSProperties}>
            <VerdictIcon v={verdict} size={13} color="var(--paper)" />
          </span>
        )}
      </div>
      <div className="relative mt-1 h-5 text-[13px] text-slate" aria-hidden>
        {m.ticks.map((t) => (
          <span key={t.at} className="num absolute -translate-x-1/2" style={{ left: `${flip(at(t.at))}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[15px] leading-snug text-ink">{m.sentence}</p>
    </div>
  );
}

export function CoverageBar({ share, min, sentence }: { share: number; min: number; sentence: string }) {
  const s = Math.max(0, Math.min(1, share));
  return (
    <div className="w-full">
      <div role="img" aria-label={sentence} className="relative h-3 w-full overflow-hidden rounded-[3px] border border-dashed border-no-data hatch">
        <span className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${Math.max(s * 100, s > 0 ? 0.8 : 0)}%` }} />
        <span className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: `calc(${min * 100}% - 1px)` }} />
      </div>
      <div className="relative mt-1 h-5 text-[13px] text-slate" aria-hidden>
        <span className="num absolute -translate-x-full whitespace-nowrap" style={{ left: `${min * 100}%` }}>
          needs {Math.round(min * 100)}%
        </span>
      </div>
      <p className="mt-1 text-[15px] leading-snug text-ink">{sentence}</p>
    </div>
  );
}

/** Spec §5.3, in order: metric and value, thresholds in words, what would change it, grade, window, sources + hash, verify command. */
export function EvidencePanel({ v, m, date, extra }: { v: Verdict; m: RailModel; date: string; extra?: React.ReactNode }) {
  const sources = [...new Set(v.evidence.map((e) => e.source).filter((s): s is string => !!s))];
  return (
    <div className="grid gap-5 border-t border-rule pt-5 text-[15px] leading-relaxed">
      <section>
        <h4 className="text-[13px] font-semibold text-slate">Metric and value</h4>
        <p className="measure mt-1">
          {plain(v.metric)}. <span className="num font-semibold">{m.valueText}</span>
        </p>
        <div className="scroll-x mt-3 rounded-lg border border-rule">
          <table className="data">
            <caption className="sr-only">Evidence for {v.id}</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col" className="r">Value</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {v.evidence.map((e) => (
                <tr key={e.label}>
                  <td>
                    <div className="max-w-[48ch] whitespace-normal">{plain(e.label)}</div>
                  </td>
                  <td className="r num">
                    {e.value === "not reported" ? <span className="text-slate">Not reported</span> : e.value}
                    {e.dir !== "neutral" && <span className="sr-only">{e.dir === "for" ? " (supports the claim)" : " (counts against the claim)"}</span>}
                  </td>
                  <td>
                    <EvidenceSource source={e.source} date={date} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h4 className="text-[13px] font-semibold text-slate">Thresholds</h4>
        <p className="measure mt-1">{plain(v.flip_condition)}</p>
        <p className="mt-1 text-[13px] text-slate">
          As written in thresholds/v1.yaml: Supported “{v.threshold_supported}”; Not supported “{v.threshold_not_supported}”; otherwise Mixed.
        </p>
      </section>
      <section>
        <h4 className="text-[13px] font-semibold text-slate">What would change this verdict</h4>
        <p className="measure mt-1">{plain(v.margin_to_next.charAt(0).toUpperCase() + v.margin_to_next.slice(1))}.</p>
      </section>
      <section className="flex flex-wrap items-baseline gap-2">
        <EvidenceGrade g={v.evidence_grade} />
        <span className="measure text-slate">{GRADE_TEXT[v.evidence_grade].replace(/^Grade [ABC]: /, "")}</span>
      </section>
      <section>
        <h4 className="text-[13px] font-semibold text-slate">Window and sample</h4>
        <p className="num mt-1">
          {v.window.from} to {v.window.to} ({v.window.days} {v.window.days === 1 ? "day" : "days"}) · sample {v.sample_size.toLocaleString("en-US")}
        </p>
      </section>
      {extra}
      <section>
        <h4 className="text-[13px] font-semibold text-slate">Sources</h4>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {sources.map((s) => (
            <li key={s} className="text-[15px]">
              <span className="text-slate">{s.startsWith("snapshot:") ? s.slice(9) : /^https?:\/\//.test(s) ? new URL(s).hostname : s}</span> <EvidenceSource source={s} date={date} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-slate">Snapshot hash (sha256)</p>
        <div className="mt-1 max-w-[560px]">
          <CopyCommand text={v.snapshot_hashes[0]} label="Copy" />
        </div>
      </section>
      <section>
        <h4 className="text-[13px] font-semibold text-slate">Re-run this claim</h4>
        <div className="mt-1 max-w-[560px]">
          <CopyCommand text={`pnpm verify --claim ${v.id}`} />
        </div>
      </section>
    </div>
  );
}
