import type { ReactNode } from "react";

/**
 * Hand-rolled, server-rendered SVG line chart (spec §6): no chart bundle, one series in --ink and a
 * second in --slate, direct labels instead of a legend, light horizontal gridlines, slate axes, an
 * optional dated annotation, and a "View as table" alternative plus a JSON download link.
 */
export type Line = { name: string; points: { date: string; value: number | null }[]; format: (v: number) => string };

const W = 640;
const H = 220;
const PAD = { l: 8, r: 8, t: 16, b: 24 };

function path(pts: { x: number; y: number | null }[]) {
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p.y == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function LineChart({
  title,
  lines,
  annotate,
  download,
  note,
}: {
  title: string;
  lines: Line[];
  annotate?: { date: string; label: string; href: string };
  download?: string;
  note?: ReactNode;
}) {
  const dates = [...new Set(lines.flatMap((l) => l.points.map((p) => p.date)))].sort();
  if (!dates.length) return <p className="text-[15px] text-slate">No data yet.</p>;
  const x = (d: string) => PAD.l + ((W - PAD.l - PAD.r) * dates.indexOf(d)) / Math.max(1, dates.length - 1);
  // Each line gets its own vertical scale (they are different units); the labels carry the units.
  const scaled = lines.map((l, i) => {
    const vals = l.points.map((p) => p.value).filter((v): v is number => v != null && Number.isFinite(v));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || Math.abs(hi) || 1;
    const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / span);
    const pts = l.points.map((p) => ({ x: x(p.date), y: p.value == null ? null : y(p.value) }));
    const last = [...l.points].reverse().find((p) => p.value != null);
    return { l, i, pts, last, lastY: last ? y(last.value!) : null, lo, hi };
  });
  const color = (i: number) => (i === 0 ? "var(--ink)" : "var(--slate)");
  const ax = annotate && dates.includes(annotate.date) ? x(annotate.date) : null;
  const summary = scaled.map((s) => `${s.l.name}: latest ${s.last ? s.l.format(s.last.value!) : "Not reported"}, range ${s.l.format(s.lo)} to ${s.l.format(s.hi)}`).join("; ");
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}, ${dates[0]} to ${dates.at(-1)}. ${summary}.`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + (H - PAD.t - PAD.b) * f} y2={PAD.t + (H - PAD.t - PAD.b) * f} stroke="var(--rule)" strokeWidth="1" />
        ))}
        {ax != null && (
          <g>
            <line x1={ax} x2={ax} y1={PAD.t - 8} y2={H - PAD.b} stroke="var(--ink)" strokeDasharray="3 3" strokeWidth="1" />
            <text x={ax + 4} y={PAD.t} fontSize="13" fill="var(--ink)">
              {annotate!.label}
            </text>
          </g>
        )}
        {scaled.map((s) => (
          <path key={s.l.name} d={path(s.pts)} fill="none" stroke={color(s.i)} strokeWidth={s.i === 0 ? 2 : 1.5} strokeDasharray={s.i === 0 ? undefined : "5 3"} vectorEffect="non-scaling-stroke" />
        ))}
        <text x={PAD.l} y={H - 6} fontSize="13" fill="var(--slate)">
          {dates[0]}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize="13" fill="var(--slate)" textAnchor="end">
          {dates.at(-1)}
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate">
        {scaled.map((s) => (
          <span key={s.l.name} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" x2="18" y1="3" y2="3" stroke={color(s.i)} strokeWidth="2" strokeDasharray={s.i === 0 ? undefined : "5 3"} />
            </svg>
            <span className="text-ink">{s.l.name}</span> <span className="num">{s.last ? `${s.l.format(s.last.value!)} on ${s.last.date}` : "Not reported"}</span>
          </span>
        ))}
        {annotate && (
          <a href={annotate.href} className="underline underline-offset-4">
            Incident sources
          </a>
        )}
      </figcaption>
      {note && <p className="mt-1 text-[13px] text-slate">{note}</p>}
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-medium text-ink">View as table</summary>
        <div tabIndex={0} className="scroll-x mt-1 max-h-[320px] overflow-y-auto rounded-lg border border-rule">
          <table className="data">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                {lines.map((l) => (
                  <th key={l.name} scope="col" className="r">
                    {l.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...dates].reverse().map((d) => (
                <tr key={d}>
                  <td className="num">{d}</td>
                  {lines.map((l) => {
                    const v = l.points.find((p) => p.date === d)?.value;
                    return (
                      <td key={l.name} className="r num">
                        {v == null ? "Not reported" : l.format(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {download && (
        <a href={download} className="inline-flex min-h-11 items-center text-[15px] text-ink underline underline-offset-4">
          Download the data (JSON)
        </a>
      )}
    </figure>
  );
}
