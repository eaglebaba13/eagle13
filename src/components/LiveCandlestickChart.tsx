// Live candlestick chart component with indicator support.
// Polls server function for live candle data, computes indicators,
// renders candlestick + overlay indicators + oscillator panels.
// Provider-neutral. No token exposure.

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApexChart } from "@/components/ApexChart";
import { OscillatorPanel } from "@/components/OscillatorPanel";
import { IndicatorControls } from "@/components/IndicatorControls";
import { getLiveCandles, type LiveCandleResponse } from "@/lib/live-market-stream.functions";
import { getIndicator } from "@/lib/indicators/registry";
import {
  indicatorsToChartSeries,
  getOscillatorOptions,
  type IndicatorSeriesConfig,
} from "@/lib/indicators/chart-adapter";
import type { IndicatorCandle, IndicatorResult } from "@/lib/indicators/types";
import type { ActiveIndicator } from "@/lib/indicators/ui-state";

export interface LiveCandlestickChartProps {
  readonly symbol: string;
  readonly intervalMs?: number;
  readonly height?: number;
  readonly pollIntervalMs?: number;
}

export function LiveCandlestickChart({
  symbol,
  intervalMs = 60_000,
  height = 400,
  pollIntervalMs = 2_000,
}: LiveCandlestickChartProps) {
  const [activeIndicators, setActiveIndicators] = useState<readonly ActiveIndicator[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["live-candles", symbol, intervalMs],
    queryFn: () => getLiveCandles({ data: { symbol, intervalMs } }),
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: false,
  });

  // Convert series data to IndicatorCandle format for indicator calculation
  const candles: readonly IndicatorCandle[] = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((point) => ({
      time: point.x,
      open: point.y[0],
      high: point.y[1],
      low: point.y[2],
      close: point.y[3],
      volume: null, // historical candles from merge don't carry volume separately
    }));
  }, [data?.series]);

  // Compute indicator results
  const indicatorResults: readonly IndicatorResult[] = useMemo(() => {
    if (candles.length === 0) return [];
    const results: IndicatorResult[] = [];
    for (const ind of activeIndicators) {
      if (!ind.enabled) continue;
      const def = getIndicator(ind.id);
      if (!def) continue;
      try {
        results.push(def.calculate(candles, ind.params));
      } catch {
        // indicator calculation failed — skip silently
      }
    }
    return results;
  }, [candles, activeIndicators]);

  // Transform indicators into chart series
  const { overlaySeries, oscillators } = useMemo(
    () => indicatorsToChartSeries(indicatorResults),
    [indicatorResults],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-muted-foreground text-sm">Loading chart…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-muted-foreground text-sm">Chart unavailable</span>
      </div>
    );
  }

  // Build main chart series: candlestick + overlay indicators
  const mainSeries = [
    { name: symbol, data: data.series },
    ...overlaySeries.map((s) => ({ name: s.name, data: [...s.data], type: s.type })),
  ];

  const mainOptions = buildChartOptions(symbol, data, overlaySeries.length > 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium">{symbol}</span>
        <ProviderStatusBadge status={data.providerStatus} freshness={data.freshness} provider={data.provider} />
        {data.currentCandle && (
          <span className="text-xs text-muted-foreground">
            ticks: {data.currentCandle.tickCount} · candles: {data.completedCount + (data.currentCandle ? 1 : 0)}
          </span>
        )}
      </div>

      {/* Indicator controls */}
      <IndicatorControls active={activeIndicators} onChange={setActiveIndicators} />

      {/* Main price chart with overlays */}
      <ApexChart type="candlestick" height={height} series={mainSeries} options={mainOptions} />

      {/* Oscillator panels */}
      {oscillators.map((osc) => (
        <OscillatorPanel
          key={osc.indicatorId}
          config={osc}
          options={getOscillatorOptions(osc)}
        />
      ))}
    </div>
  );
}

// ────────────────────── Helpers ────────────────────────────────────

function ProviderStatusBadge({ status, freshness, provider }: { status: string; freshness: string; provider: string }) {
  const color =
    status === "LIVE" ? "text-green-500" :
    status === "STALE" ? "text-amber-500" :
    status === "FAILED" ? "text-red-500" :
    "text-muted-foreground";
  return (
    <span className={`text-xs font-mono ${color}`}>
      {provider} · {freshness}
    </span>
  );
}

function buildChartOptions(symbol: string, data: LiveCandleResponse, hasOverlays: boolean) {
  const overlayColors = ["#f59e0b", "#3b82f6", "#a855f7", "#6b7280", "#22c55e", "#ef4444"];

  return {
    chart: {
      type: "candlestick" as const,
      background: "transparent",
      toolbar: { show: false },
    },
    title: { text: undefined },
    xaxis: {
      type: "datetime" as const,
      labels: { style: { colors: "#888", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#888", fontSize: "10px" } },
      tooltip: { enabled: true },
    },
    plotOptions: {
      candlestick: {
        colors: { upward: "#22c55e", downward: "#ef4444" },
        wick: { useFillColor: true },
      },
    },
    colors: hasOverlays ? overlayColors : undefined,
    stroke: {
      width: hasOverlays ? [1, 2, 2, 2, 2, 2] : undefined,
    },
    grid: {
      borderColor: "#333",
      strokeDashArray: 3,
    },
    tooltip: {
      theme: "dark" as const,
    },
  };
}
