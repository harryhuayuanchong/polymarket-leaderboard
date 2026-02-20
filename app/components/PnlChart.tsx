"use client";

import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

type Point = {
  time: number;
  value: number;
};

export default function PnlChart({ data }: { data: Point[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 260,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(159, 176, 191, 0.95)",
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(93, 242, 178, 0.35)" },
        horzLine: { color: "rgba(93, 242, 178, 0.2)" },
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#5df2b2",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    if (data.length === 0) {
      seriesRef.current.setData([]);
      return;
    }

    const bySecond = new Map<number, number>();
    const sorted = [...data].sort((a, b) => a.time - b.time);
    for (const point of sorted) {
      bySecond.set(Math.floor(point.time / 1000), point.value);
    }

    const normalized = Array.from(bySecond.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({
        time: time as Time,
        value,
      }));

    seriesRef.current.setData(normalized);
    chartRef.current.timeScale().fitContent();
  }, [data]);

  return <div ref={containerRef} style={{ width: "100%", height: "260px" }} />;
}
