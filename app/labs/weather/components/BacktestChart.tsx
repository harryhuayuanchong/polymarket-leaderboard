"use client";

import { createChart, LineSeries, type IChartApi, type ISeriesApi, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";

type ChartPoint = {
  time: number;
  marketPrice: number | null;
  modelProb: number | null;
};

export default function BacktestChart({ points }: { points: ChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const marketSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const modelSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
      layout: {
        background: { color: "transparent" },
        textColor: "#6e6257",
      },
      grid: {
        vertLines: { color: "rgba(31, 26, 20, 0.08)" },
        horzLines: { color: "rgba(31, 26, 20, 0.08)" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      localization: {
        priceFormatter: (value: number) => `${(value * 100).toFixed(1)}%`,
      },
    });

    const marketSeries = chart.addSeries(LineSeries, {
      color: "#b65b32",
      lineWidth: 2,
      title: "Market",
      priceLineVisible: false,
    });

    const modelSeries = chart.addSeries(LineSeries, {
      color: "#2e6f68",
      lineWidth: 2,
      title: "Model",
      priceLineVisible: false,
    });

    chartRef.current = chart;
    marketSeriesRef.current = marketSeries;
    modelSeriesRef.current = modelSeries;

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      marketSeriesRef.current = null;
      modelSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!marketSeriesRef.current || !modelSeriesRef.current || !chartRef.current) return;

    const sorted = [...points].sort((a, b) => a.time - b.time);

    const marketData = sorted
      .filter((point) => typeof point.marketPrice === "number")
      .map((point) => ({ time: Math.floor(point.time / 1000) as Time, value: point.marketPrice as number }));

    const modelData = sorted
      .filter((point) => typeof point.modelProb === "number")
      .map((point) => ({ time: Math.floor(point.time / 1000) as Time, value: point.modelProb as number }));

    marketSeriesRef.current.setData(marketData);
    modelSeriesRef.current.setData(modelData);
    chartRef.current.timeScale().fitContent();
  }, [points]);

  return <div className="weather-chart" ref={containerRef} />;
}
