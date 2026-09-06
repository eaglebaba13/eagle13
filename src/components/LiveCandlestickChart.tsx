// Live candlestick chart component.
// Polls server function for live candle data and renders via ApexChart.
// Provider-neutral. No token exposure.

import { useQuery } from "@tanstack/react-query";
import { ApexChart } from "@/components/ApexChart";
import { getLiveCandles, type LiveCandleResponse } from "@/lib/live-market-stream.functions";

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
  const { data, isLoading, error } = useQuery({
    queryKey: ["live-candles", symbol, intervalMs],
    queryFn: () => getLiveCandles({ data: { symbol, intervalMs } }),
    refetchInterval: pollIntervalMs,
    refetchOnWindowFocus: false,
  });

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

  const series = [{ name: symbol, data: data.series }];
  const options = buildChartOptions(symbol, data);

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm font-medium">{symbol}</span>
        <ProviderStatusBadge status={data.providerStatus} freshness={data.freshness} provider={data.provider} />
        {data.currentCandle && (
          <span className="text-xs text-muted-foreground">
            ticks: {data.currentCandle.tickCount} · candles: {data.completedCount + (data.currentCandle ? 1 : 0)}
          </span>
        )}
      </div>
      <ApexChart type="candlestick" height={height} series={series} options={options} />
    </div>
  );
}

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

function buildChartOptions(symbol: string, data: LiveCandleResponse) {
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
    grid: {
      borderColor: "#333",
      strokeDashArray: 3,
    },
    tooltip: {
      theme: "dark" as const,
    },
  };
}
