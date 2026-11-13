export function Sparkline({ values, width = 96, height = 24, className = "" }: { values: number[]; width?: number; height?: number; className?: string }) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return <span className="text-[11px] text-faint">—</span>;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * width).toFixed(1)},${(height - ((x - min) / span) * (height - 2) - 1).toFixed(1)}`).join(" ");
  const up = v[v.length - 1] >= v[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "var(--accent)" : "var(--danger)"} strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}
