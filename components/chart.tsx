"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, HistogramSeries, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

export type ChartSeries = {
  name: string;
  type?: "area" | "line" | "histogram";
  color: string;
  data: { time: string; value: number }[];
  scale?: "left" | "right";
  format?: "usd" | "num" | "price";
};

function fmt(kind: ChartSeries["format"]) {
  return (v: number) => {
    const a = Math.abs(v);
    const c = a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : kind === "price" ? v.toFixed(3) : v.toFixed(0);
    return kind === "usd" || kind === "price" ? "$" + c : c;
  };
}

export function TimeChart({ series, height = 240, label }: { series: ChartSeries[]; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const hasLeft = series.some((s) => s.scale === "left");
    const chart: IChartApi = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b95a5", fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#141a22" }, horzLines: { color: "#141a22" } },
      rightPriceScale: { borderColor: "#1b222c" },
      leftPriceScale: { visible: hasLeft, borderColor: "#1b222c" },
      timeScale: { borderColor: "#1b222c" },
      crosshair: { horzLine: { color: "#273140" }, vertLine: { color: "#273140" } },
      handleScroll: false,
      handleScale: false,
    });
    for (const s of series) {
      const opts = { priceScaleId: s.scale ?? "right", priceFormat: { type: "custom" as const, formatter: fmt(s.format), minMove: 0.0001 }, lastValueVisible: true, priceLineVisible: false };
      const seen = new Set<number>();
      const data = s.data
        .map((d) => {
          const [y, m, dd] = d.time.slice(0, 10).split("-").map(Number);
          return { t: Date.UTC(y, (m ?? 1) - 1, dd ?? 1) / 1000, value: d.value };
        })
        .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.value))
        .sort((a, b) => a.t - b.t)
        .filter((d) => (seen.has(d.t) ? false : (seen.add(d.t), true)))
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.value }));
      if (s.type === "histogram") chart.addSeries(HistogramSeries, { ...opts, color: s.color }).setData(data);
      else if (s.type === "line") chart.addSeries(LineSeries, { ...opts, color: s.color, lineWidth: 2 }).setData(data);
      else chart.addSeries(AreaSeries, { ...opts, lineColor: s.color, topColor: s.color + "33", bottomColor: s.color + "00", lineWidth: 2 }).setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, height]);
  return (
    <figure>
      <div ref={ref} role="img" aria-label={label} style={{ height }} />
      <figcaption className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
