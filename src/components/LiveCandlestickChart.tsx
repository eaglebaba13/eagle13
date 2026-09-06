// Live candlestick chart component with indicator support.
// Polls server function for live candle data, computes indicators,
// renders candlestick + overlay indicators + oscillator panels.
// Provider-neutral. No token exposure.

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApexChart } from "@/components/ApexChart";
import { OscillatorPanel } from "@/components/OscillatorPanel";
import { IndicatorControls } from "@/components/IndicatorControls";
import { getLiveCandles, type LiveCandleResponse } from "@/lib/live-market-stream.functions";
import { getIndicator } from "@/lib/indicators/registry";
import {
  indicatorsToChartSeries,
  getOscillatorOptions,
  getOverlaySeriesColors,
  validateIndicatorParams,
} from "@/lib/indicators/chart-adapter";
import type { IndicatorCandle, IndicatorResult } from "@/lib/indicators/types";
import type { ActiveIndicator } from "@/lib/indicators/ui-state";

export interface LiveCandlestickChartProps {
  readonly symbol: string;
  readonly intervalMs?: number;
  readonly height?: number;
  readonly pollIntervalMs?: number;
}

interface IndicatorError {
  readonly indicatorId: string;
  readonly message: string;
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

  // Convert series data to IndicatorCandle format — PRESERVE VOLUME
  const candles: readonly IndicatorCandle[] = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((point) => ({
      time: point.x,
      open: point.y[0],
      high: point.y[1],
      low: point.y[2],
      close: point.y[3],
      volume: point.volume ?? null,
    }));
  }, [data?.series]);

  // Compute indicator results with explicit error handling
  const { indicatorResults, indicatorErrors } = useMemo(() => {
    if (candles.length === 0) return { indicatorResults: [], indicatorErrors: [] };
    const results: IndicatorResult[] = [];
    const errors: IndicatorError[] = [];

    for (const ind of activeIndicators) {
      if (!ind.enabled) continue;
      const def = getIndicator(ind.id);
      if (!def) {
        errors.push({ indicatorId: ind.id, message: "Unknown indicator" });
        continue;
      }

      // Validate parameters before calculation
      const validation = validateIndicatorParams(ind.params, def.params);
      if (!validation.valid) {
        errors.push({ indicatorId: ind.id, message: validation.errors.join("; ") });
        continue;
      }

      try {
        results.push(def.calculate(candles, ind.params));
      } catch (err) {
        errors.push({
          indicatorId: ind.id,
          message: err instanceof Error ? err.message : "Calculation failed",
        });
      }
    }

    return { indicatorResults: results, indicatorErrors: errors };
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

  const overlayColors = getOverlaySeriesColors(overlaySeries);
  const mainOptions = buildChartOptions(overlayColors);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium">{symbol}</span>
        <ProviderStatusBadge
          status={data.providerStatus}
          freshness={data.freshness}
          provider={data.provider}
        />
        {data.currentCandle && (
          <span className="text-xs text-muted-foreground">
            ticks: {data.currentCandle.tickCount} · candles:{" "}
            {data.completedCount + (data.currentCandle ? 1 : 0)}
          </span>
        )}
      </div>

      {/* Indicator controls */}
      <IndicatorControls active={activeIndicators} onChange={setActiveIndicators} />

      {/* Indicator errors */}
      {indicatorErrors.length > 0 && (
        <div className="mt-1">
          {indicatorErrors.map((err) => (
            <div key={err.indicatorId} className="text-xs text-amber-500">
              {err.indicatorId}: {err.message}
            </div>
          ))}
        </div>
      )}

      {/* Main price chart with overlays */}
      <ApexChart type="candlestick" height={height} series={mainSeries} options={mainOptions} />

      {/* Oscillator panels */}
      {oscillators.map((osc) => (
        <OscillatorPanel key={osc.indicatorId} config={osc} options={getOscillatorOptions(osc)} />
      ))}
    </div>
  );
}

// ────────────────────── Helpers ────────────────────────────────────

function ProviderStatusBadge({
  status,
  freshness,
  provider,
}: {
  status: string;
  freshness: string;
  provider: string;
}) {
  const color =
    status === "LIVE"
      ? "text-green-500"
      : status === "STALE"
        ? "text-amber-500"
        : status === "FAILED"
          ? "text-red-500"
          : "text-muted-foreground";
  return (
    <span className={`text-xs font-mono ${color}`}>
      {provider} · {freshness}
    </span>
  );
}

function buildChartOptions(overlayColors: string[]) {
  const hasOverlays = overlayColors.length > 0;

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
      width: hasOverlays ? [1, ...overlayColors.map(() => 2)] : undefined,
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
