// Professional live market chart — INDstocks NIFTY50.
// Fetches historical bootstrap once, then polls for live updates.
// Uses existing server-side CandleAggregator + mergeHistoricalAndLive.
// Provider-neutral. No token exposure.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ApexChart } from "@/components/ApexChart";
import { getLiveCandleBootstrap, getLiveCandlePoll, type LiveCandleUpdate } from "@/lib/live-candle-stream.functions";

export interface LiveMarketChartProps {
  readonly symbol?: string;
  readonly intervalMs?: number;
  readonly height?: number;
}

type ChartStatus = "loading" | "live" | "stale" | "error" | "no_data";

interface ChartState {
  readonly series: ReadonlyArray<{ readonly x: number; readonly y: readonly [number, number, number, number]; readonly volume: number | null }>;
  readonly status: ChartStatus;
  readonly provider: string;
  readonly freshness: string;
  readonly lastTick: string | null;
  readonly lastLtp: number | null;
  readonly currentCandle: { readonly open: number; readonly high: number; readonly low: number; readonly close: number; readonly volume: number | null; readonly tickCount: number } | null;
  readonly connectionState: string;
  readonly completedCount: number;
  readonly historicalCount: number;
  readonly error: string | null;
}

const EMPTY_STATE: ChartState = {
  series: [],
  status: "loading",
  provider: "INDSTOCKS_V1_WS",
  freshness: "NO_DATA",
  lastTick: null,
  lastLtp: null,
  currentCandle: null,
  connectionState: "DISCONNECTED",
  completedCount: 0,
  historicalCount: 0,
  error: null,
};

export function LiveMarketChart({
  symbol = "NIFTY50",
  intervalMs = 60_000,
  height = 420,
}: LiveMarketChartProps) {
  const [state, setState] = useState<ChartState>(EMPTY_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Historical bootstrap — fetch once on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      try {
        const resp = await getLiveCandleBootstrap({ data: { symbol, intervalMs } });
        if (cancelled || !mountedRef.current) return;

        if (resp.error) {
          setState((s) => ({ ...s, status: "error", error: resp.error }));
          return;
        }

        const status = resp.status;
        setState({
          series: resp.series ?? [],
          status: resp.series && resp.series.length > 0 ? "live" : "no_data",
          provider: status?.provider ?? "INDSTOCKS_V1_WS",
          freshness: status?.freshness ?? "NO_DATA",
          lastTick: status?.lastTick ?? null,
          lastLtp: status?.lastLtp ?? null,
          currentCandle: status?.currentCandle ?? null,
          connectionState: status?.connectionState ?? "DISCONNECTED",
          completedCount: status?.completedCount ?? 0,
          historicalCount: status?.historicalCount ?? 0,
          error: null,
        });
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setState((s) => ({
            ...s,
            status: "error",
            error: err instanceof Error ? err.message : "Bootstrap failed",
          }));
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [symbol, intervalMs]);

  // Live polling — lightweight, no historical refetch
  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const resp = await getLiveCandlePoll({ data: { symbol, intervalMs } });
        if (!mountedRef.current) return;

        if (resp.error || !resp.series || resp.series.length === 0) return;

        const status = resp.status;
        setState((prev) => ({
          ...prev,
          series: resp.series!,
          status: "live",
          provider: status?.provider ?? prev.provider,
          freshness: status?.freshness ?? prev.freshness,
          lastTick: status?.lastTick ?? prev.lastTick,
          lastLtp: status?.lastLtp ?? prev.lastLtp,
          currentCandle: status?.currentCandle ?? prev.currentCandle,
          connectionState: status?.connectionState ?? prev.connectionState,
          completedCount: status?.completedCount ?? prev.completedCount,
          error: null,
        }));
      } catch {
        // Poll failure is non-fatal — keep showing last known data
      }
    }

    // Start polling after bootstrap completes
    const startDelay = setTimeout(() => {
      if (mountedRef.current) {
        poll();
        pollRef.current = setInterval(poll, 1000); // 1s polling
      }
    }, 2000);

    return () => {
      mountedRef.current = false;
      clearTimeout(startDelay);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [symbol, intervalMs]);

  // Chart series for ApexCharts
  const chartSeries = useMemo(() => {
    if (state.series.length === 0) return [];
    return [
      {
        name: symbol,
        data: state.series.map((p) => ({
          x: p.x,
          y: [p.y[0], p.y[1], p.y[2], p.y[3]] as [number, number, number, number],
        })),
      },
    ];
  }, [state.series, symbol]);

  const chartOptions = useMemo(
    () => ({
      chart: {
        type: "candlestick" as const,
        background: "transparent",
        toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        animations: { enabled: false },
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
      grid: {
        borderColor: "#333",
        strokeDashArray: 3,
      },
      tooltip: {
        theme: "dark" as const,
      },
      crosshair: {
        show: true,
      },
    }),
    [],
  );

  const statusColor =
    state.status === "live" ? "text-green-500" :
    state.status === "stale" ? "text-amber-500" :
    state.status === "error" ? "text-red-500" :
    "text-muted-foreground";

  const statusLabel =
    state.status === "live" ? "LIVE" :
    state.status === "stale" ? "STALE" :
    state.status === "error" ? "ERROR" :
    state.status === "no_data" ? "NO DATA" :
    "LOADING";

  return (
    <div id="live-chart">
      {/* Chart Header */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-sm font-medium">{symbol}</span>
        <span className={`text-xs font-mono ${statusColor}`}>
          ● {statusLabel}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {state.provider}
        </span>
        {state.lastLtp != null && (
          <span className="text-xs font-mono">
            LTP: {state.lastLtp.toFixed(2)}
          </span>
        )}
        {state.lastTick && (
          <span className="text-xs text-muted-foreground">
            {formatAge(state.lastTick)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Candles: {state.series.length} | Completed: {state.completedCount}
        </span>
      </div>

      {/* Connection Status */}
      {state.connectionState !== "CONNECTED" && state.status !== "loading" && (
        <div className="mb-2 text-xs text-amber-500 font-mono">
          Connection: {state.connectionState}
        </div>
      )}

      {/* Chart */}
      {state.status === "loading" && (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-muted-foreground text-sm">Loading chart…</span>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <span className="text-red-500 text-sm">Chart error: {state.error}</span>
          </div>
        </div>
      )}

      {state.status === "no_data" && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <span className="text-muted-foreground text-sm">NO MARKET DATA</span>
            <p className="text-xs text-muted-foreground mt-1">
              Provider: {state.provider} | Connection: {state.connectionState}
            </p>
          </div>
        </div>
      )}

      {(state.status === "live" || state.status === "stale") && chartSeries.length > 0 && (
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
