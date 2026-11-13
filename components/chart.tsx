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
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#4f5fc2", fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(42, 63, 214, 0.08)" } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      leftPriceScale: { visible: hasLeft, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: "rgba(42, 63, 214, 0.2)" },
      crosshair: { horzLine: { color: "rgba(42, 63, 214, 0.35)", labelBackgroundColor: "#2a3fd6" }, vertLine: { color: "rgba(42, 63, 214, 0.35)", labelBackgroundColor: "#2a3fd6" } },
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
      if (s.type === "histogram") chart.addSeries(HistogramSeries, { ...opts, color: s.color + "b3" }).setData(data);
      else if (s.type === "line") chart.addSeries(LineSeries, { ...opts, color: s.color, lineWidth: 2 }).setData(data);
      else chart.addSeries(AreaSeries, { ...opts, lineColor: s.color, topColor: s.color + "2e", bottomColor: s.color + "03", lineWidth: 2 }).setData(data);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series, height]);
  return (
    <figure>
      <div ref={ref} role="img" aria-label={label} style={{ height }} />
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
