// Professional live market chart — INDstocks NIFTY50.
// Uses SSE for real-time streaming (no polling).
// Historical bootstrap + live candle updates.
// Provider-neutral. No token exposure.

import { useState, useEffect, useMemo, useCallback } from "react";
import { ApexChart } from "@/components/ApexChart";
import { getLiveCandleBootstrap } from "@/lib/live-candle-stream.functions";
import { useLiveCandleSSE } from "@/hooks/use-live-candle-sse";
import type { IndicatorCandle, IndicatorResult } from "@/lib/indicators/types";
import type { ActiveIndicator } from "@/lib/indicators/ui-state";
import { getIndicator } from "@/lib/indicators/registry";
import { indicatorsToChartSeries, getOverlaySeriesColors, validateIndicatorParams } from "@/lib/indicators/chart-adapter";

export interface LiveMarketChartProps {
  readonly symbol?: string;
  readonly intervalMs?: number;
  readonly height?: number;
}

interface ChartCandle {
  readonly x: number;
  readonly y: [number, number, number, number];
  readonly volume: number | null;
}

export function LiveMarketChart({
  symbol = "NIFTY50",
  intervalMs = 60_000,
  height = 420,
}: LiveMarketChartProps) {
  const [historical, setHistorical] = useState<readonly ChartCandle[]>([]);
  const [bootstrapStatus, setBootstrapStatus] = useState<"loading" | "done" | "error">("loading");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<readonly ActiveIndicator[]>([]);

  // SSE connection for live updates
  const { state: sse } = useLiveCandleSSE(symbol, intervalMs);

  // Historical bootstrap — fetch once
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const resp = await getLiveCandleBootstrap({ data: { symbol, intervalMs } });
        if (cancelled) return;
        if (resp.error) {
          setBootstrapStatus("error");
          setBootstrapError(resp.error);
          return;
        }
        setHistorical(resp.series ?? []);
        setBootstrapStatus("done");
      } catch (err) {
        if (!cancelled) {
          setBootstrapStatus("error");
          setBootstrapError(err instanceof Error ? err.message : "Bootstrap failed");
        }
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [symbol, intervalMs]);

  // Merge historical + live candles
  const chartData = useMemo(() => {
    const all: ChartCandle[] = [...historical];

    // Add completed SSE candles (Map keyed by time — no duplicates)
    for (const c of sse.completedCandles.values()) {
      all.push({
        x: c.time,
        y: [c.open, c.high, c.low, c.close],
        volume: c.volume,
      });
    }

    // Add current live candle
    if (sse.currentCandle) {
      all.push({
        x: sse.currentCandle.time,
        y: [sse.currentCandle.open, sse.currentCandle.high, sse.currentCandle.low, sse.currentCandle.close],
        volume: sse.currentCandle.volume,
      });
    }

    // Deduplicate by time (last wins)
    const byTime = new Map<number, ChartCandle>();
    for (const c of all) {
      byTime.set(c.x, c);
    }
    return [...byTime.values()].sort((a, b) => a.x - b.x);
  }, [historical, sse.completedCandles, sse.currentCandle]);

  // Compute indicators
  const candles: readonly IndicatorCandle[] = useMemo(() => {
    return chartData.map((c) => ({
      time: c.x,
      open: c.y[0],
      high: c.y[1],
      low: c.y[2],
      close: c.y[3],
      volume: c.volume,
    }));
  }, [chartData]);

  const { indicatorResults } = useMemo(() => {
    if (candles.length === 0) return { indicatorResults: [] as IndicatorResult[] };
    const results: IndicatorResult[] = [];
    for (const ind of activeIndicators) {
      if (!ind.enabled) continue;
      const def = getIndicator(ind.id);
      if (!def) continue;
      const validation = validateIndicatorParams(ind.params, def.params);
      if (!validation.valid) continue;
      try { results.push(def.calculate(candles, ind.params)); } catch { /* skip */ }
    }
    return { indicatorResults: results };
  }, [candles, activeIndicators]);

  const { overlaySeries } = useMemo(() => indicatorsToChartSeries(indicatorResults), [indicatorResults]);

  // Chart series
  const chartSeries = useMemo(() => {
    if (chartData.length === 0) return [];
    return [
      {
        name: symbol,
        data: chartData.map((c) => ({ x: c.x, y: c.y })),
      },
      ...overlaySeries.map((s) => ({ name: s.name, data: [...s.data], type: s.type })),
    ];
  }, [chartData, symbol, overlaySeries]);

  const chartOptions = useMemo(() => ({
    chart: {
      type: "candlestick" as const,
      background: "transparent",
      toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      animations: { enabled: false },
      crosshair: { show: true },
    },
    title: { text: undefined },
    xaxis: { type: "datetime" as const, labels: { style: { colors: "#888", fontSize: "10px" } } },
    yaxis: { labels: { style: { colors: "#888", fontSize: "10px" } }, tooltip: { enabled: true } },
    plotOptions: { candlestick: { colors: { upward: "#22c55e", downward: "#ef4444" }, wick: { useFillColor: true } } },
    colors: overlaySeries.length > 0 ? getOverlaySeriesColors(overlaySeries) : undefined,
    stroke: { width: overlaySeries.length > 0 ? [1, ...overlaySeries.map(() => 2)] : undefined },
    grid: { borderColor: "#333", strokeDashArray: 3 },
    tooltip: { theme: "dark" as const },
  }), [overlaySeries]);

  // Status display
  const statusColor = sse.status?.freshness === "LIVE" ? "text-green-500" :
    sse.status?.freshness === "STALE" ? "text-amber-500" : "text-muted-foreground";
  const statusLabel = sse.connected ? (sse.status?.freshness ?? "CONNECTING") : "OFFLINE";

  return (
    <div id="live-chart">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-sm font-medium">{symbol}</span>
        <span className={`text-xs font-mono ${statusColor}`}>● {statusLabel}</span>
        <span className="text-xs text-muted-foreground font-mono">{sse.status?.provider ?? "INDSTOCKS_V1_WS"}</span>
        {sse.status?.lastLtp != null && (
          <span className="text-xs font-mono">LTP: {sse.status.lastLtp.toFixed(2)}</span>
        )}
        {sse.status?.lastTick && (
          <span className="text-xs text-muted-foreground">{formatAge(sse.status.lastTick)}</span>
        )}
        <span className="text-xs text-muted-foreground">
          Candles: {chartData.length} | Completed: {sse.status?.completedCount ?? 0}
        </span>
        {sse.currentCandle && (
          <span className="text-xs text-muted-foreground">
            Ticks: {sse.currentCandle.tickCount}
          </span>
        )}
      </div>

      {/* Connection status */}
      {!sse.connected && bootstrapStatus === "done" && (
        <div className="mb-2 text-xs text-amber-500 font-mono">
          ● OFFLINE — Live feed disconnected. Reconnecting...
        </div>
      )}

      {/* Error states */}
      {bootstrapStatus === "loading" && (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-muted-foreground text-sm">Loading chart…</span>
        </div>
      )}

      {bootstrapStatus === "error" && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <span className="text-red-500 text-sm">Chart error: {bootstrapError}</span>
          </div>
        </div>
      )}

      {bootstrapStatus === "done" && chartData.length === 0 && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <span className="text-muted-foreground text-sm">NO MARKET DATA</span>
            <p className="text-xs text-muted-foreground mt-1">
              Provider: {sse.status?.provider ?? "INDSTOCKS_V1_WS"} | Connection: {sse.connected ? "CONNECTED" : "DISCONNECTED"}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {bootstrapStatus === "done" && chartData.length > 0 && (
        <ApexChart type="candlestick" height={height} series={chartSeries} options={chartOptions} />
      )}
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 1000) return "now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}
