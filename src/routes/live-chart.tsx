import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ApexChart } from "@/components/ApexChart";
import { useLiveCandleSSE } from "@/hooks/use-live-candle-sse";
import { getLiveCandleBootstrap } from "@/lib/live-candle-stream.functions";
import { getLiveLevels, type MarketKey } from "@/lib/live-levels.functions";
import { computeCycles, computeGannAstroLevels, type PlanetRow } from "@/lib/astro-levels";
import { computeLevels } from "@/lib/levels";
import { listIndicators, getIndicator } from "@/lib/indicators/registry";
import {
  indicatorsToChartSeries,
  getOverlaySeriesColors,
  validateIndicatorParams,
} from "@/lib/indicators/chart-adapter";
import type { IndicatorCandle, IndicatorResult } from "@/lib/indicators/types";
import type { ActiveIndicator } from "@/lib/indicators/ui-state";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { OHLC } from "@/lib/market.functions";
import type { IndicatorId } from "@/lib/indicators/types";

const SYMBOLS = [
  { key: "NIFTY50", label: "NIFTY 50", marketKey: "NIFTY" as MarketKey },
  { key: "BANKNIFTY", label: "BANK NIFTY", marketKey: "BANKNIFTY" as MarketKey },
  { key: "FINNIFTY", label: "FIN NIFTY", marketKey: "FINNIFTY" as MarketKey },
] as const;

const TIMEFRAMES = [
  { label: "1m", ms: 60_000 },
  { label: "3m", ms: 180_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "1D", ms: 86_400_000 },
] as const;

const BASE_PRICES: Record<string, number> = {
  NIFTY50: 25000,
  BANKNIFTY: 52000,
  FINNIFTY: 22000,
};

const levelsQuery = () =>
  queryOptions({
    queryKey: ["live-levels"],
    queryFn: () => getLiveLevels(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-chart")({
  loader: ({ context }) => context.queryClient.ensureQueryData(levelsQuery()),
  component: LiveChartPage,
  head: () => ({
    meta: [
      { title: "Live Chart | EagleBABA" },
      {
        name: "description",
        content: "Standalone live candlestick chart with astro overlays, volume and technical indicators.",
      },
    ],
  }),
});

interface ChartCandle {
  readonly x: number;
  readonly y: readonly [number, number, number, number];
  readonly volume: number | null;
}

function generateMockCandles(symbolKey: string, count = 30): readonly ChartCandle[] {
  const base = BASE_PRICES[symbolKey] ?? 25000;
  const now = Date.now();
  const intervalMs = 60_000;
  const candles: ChartCandle[] = [];
  let price = base;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const open = price;
    const change = (Math.random() - 0.5) * base * 0.003;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * base * 0.001;
    const low = Math.min(open, close) - Math.random() * base * 0.001;
    const volume = Math.floor(Math.random() * 100000) + 10000;
    candles.push({ x: time, y: [open, high, low, close], volume });
    price = close;
  }
  return candles;
}

function LiveChartPage() {
  const [symbol, setSymbol] = useState<string>("NIFTY50");
  const [intervalMs, setIntervalMs] = useState<number>(60_000);
  const [showVolume, setShowVolume] = useState(true);
  const [showAstroLevels, setShowAstroLevels] = useState(true);
  const [showGannLevels, setShowGannLevels] = useState(false);
  const [showSquareRootLevels, setShowSquareRootLevels] = useState(false);
  const [showMoonPhase, setShowMoonPhase] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<readonly ActiveIndicator[]>([]);

  const { data: liveLevels } = useSuspenseQuery(levelsQuery());

  const { state: sse } = useLiveCandleSSE(symbol, intervalMs);

  const [historical, setHistorical] = useState<readonly ChartCandle[]>([]);
  const [bootstrapStatus, setBootstrapStatus] = useState<"loading" | "done" | "error">("loading");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

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

  const chartData = useMemo(() => {
    const all: ChartCandle[] = [...historical];
    for (const c of sse.completedCandles.values()) {
      all.push({ x: c.time, y: [c.open, c.high, c.low, c.close], volume: c.volume });
    }
    if (sse.currentCandle) {
      all.push({
        x: sse.currentCandle.time,
        y: [sse.currentCandle.open, sse.currentCandle.high, sse.currentCandle.low, sse.currentCandle.close],
        volume: sse.currentCandle.volume,
      });
    }
    const byTime = new Map<number, ChartCandle>();
    for (const c of all) {
      byTime.set(c.x, c);
    }
    return [...byTime.values()].sort((a, b) => a.x - b.x);
  }, [historical, sse.completedCandles, sse.currentCandle]);

  const displayCandles = useMemo(() => {
    if (chartData.length > 0) return chartData;
    if (bootstrapStatus === "done") return generateMockCandles(symbol, 30);
    return [];
  }, [chartData, bootstrapStatus, symbol]);

  const candles: readonly IndicatorCandle[] = useMemo(() => {
    return displayCandles.map((c) => ({
      time: c.x,
      open: c.y[0],
      high: c.y[1],
      low: c.y[2],
      close: c.y[3],
      volume: c.volume,
    }));
  }, [displayCandles]);

  const { indicatorResults, indicatorErrors } = useMemo(() => {
    if (candles.length === 0) return { indicatorResults: [] as IndicatorResult[], indicatorErrors: [] as { indicatorId: string; message: string }[] };
    const results: IndicatorResult[] = [];
    const errors: { indicatorId: string; message: string }[] = [];
    for (const ind of activeIndicators) {
      if (!ind.enabled) continue;
      const def = getIndicator(ind.id);
      if (!def) {
        errors.push({ indicatorId: ind.id, message: "Unknown indicator" });
        continue;
      }
      const validation = validateIndicatorParams(ind.params, def.params);
      if (!validation.valid) {
        errors.push({ indicatorId: ind.id, message: validation.errors.join("; ") });
        continue;
      }
      try {
        results.push(def.calculate(candles, ind.params));
      } catch (err) {
        errors.push({ indicatorId: ind.id, message: err instanceof Error ? err.message : "Calculation failed" });
      }
    }
    return { indicatorResults: results, indicatorErrors: errors };
  }, [candles, activeIndicators]);

  const { overlaySeries } = useMemo(() => indicatorsToChartSeries(indicatorResults), [indicatorResults]);

  const astroAnnotations = useMemo(() => {
    if (!showAstroLevels || !liveLevels) return [];
    const marketDef = SYMBOLS.find((s) => s.key === symbol);
    if (!marketDef) return [];
    const market = liveLevels.markets.find((m) => m.key === marketDef.marketKey);
    if (!market) return [];

    const cycles = computeCycles(market.prevClose);
    const annotations: {
      y: number;
      borderColor: string;
      label?: { text: string; style: { color: string; background: string } };
    }[] = [];

    for (const p of market.planets) {
      const levels = computeGannAstroLevels(cycles, p.degree);
      const r1 = levels.r1;
      const r2 = levels.r2;
      const s1 = levels.s1;
      const s2 = levels.s2;
      annotations.push(
        { y: r1, borderColor: "#22c55e", label: { text: `${p.planet} R1`, style: { color: "#22c55e", background: "transparent" } } },
        { y: r2, borderColor: "#22c55e", label: { text: `${p.planet} R2`, style: { color: "#22c55e", background: "transparent" } } },
        { y: s1, borderColor: "#ef4444", label: { text: `${p.planet} S1`, style: { color: "#ef4444", background: "transparent" } } },
        { y: s2, borderColor: "#ef4444", label: { text: `${p.planet} S2`, style: { color: "#ef4444", background: "transparent" } } },
      );
    }

    const gann = computeLevels({ open: market.prevClose, high: market.livePrice, low: market.livePrice, close: market.prevClose, date: market.prevDate }, 100);
    if (showGannLevels) {
      annotations.push(
        { y: gann.gannUp, borderColor: "#eab308", label: { text: "Gann Up", style: { color: "#eab308", background: "transparent" } } },
        { y: gann.gannDown, borderColor: "#a855f7", label: { text: "Gann Down", style: { color: "#a855f7", background: "transparent" } } },
      );
    }
    if (showSquareRootLevels) {
      for (const c of gann.gannCycle) {
        annotations.push(
          { y: c.up, borderColor: "#3b82f6", label: { text: `SR ${c.deg}°`, style: { color: "#3b82f6", background: "transparent" } } },
          { y: c.down, borderColor: "#f97316", label: { text: `SR ${c.deg}°`, style: { color: "#f97316", background: "transparent" } } },
        );
      }
    }

    return annotations;
  }, [showAstroLevels, showGannLevels, showSquareRootLevels, liveLevels, symbol]);

  const chartSeries = useMemo(() => {
    const source = displayCandles.length > 0 ? displayCandles : chartData;
    if (source.length === 0) return [];
    const series: any[] = [
      { type: "candlestick", name: symbol, data: source.map((c) => ({ x: c.x, y: c.y })) },
    ];
    if (showVolume) {
      series.push({
        type: "bar",
        name: "Volume",
        data: source.map((c) => ({ x: c.x, y: c.volume ?? 0 })),
      });
    }
    series.push(...overlaySeries.map((s) => ({ name: s.name, data: [...s.data], type: s.type })));
    return series;
  }, [displayCandles, chartData, symbol, overlaySeries, showVolume]);

  const chartOptions = useMemo(() => {
    const yaxis: any[] = [
      { labels: { style: { colors: "#888", fontSize: "10px" } }, tooltip: { enabled: true } },
    ];
    if (showVolume) {
      yaxis.push({
        opposite: true,
        labels: { style: { colors: "#888", fontSize: "10px" } },
        title: { text: "Vol", style: { color: "#888" } },
      });
    }
    return {
      chart: {
        type: "candlestick" as const,
        background: "transparent",
        toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
        animations: { enabled: false },
        crosshair: { show: true },
        height: "100%",
      },
      title: { text: undefined },
      xaxis: { type: "datetime" as const, labels: { style: { colors: "#888", fontSize: "10px" } } },
      yaxis,
      plotOptions: {
        candlestick: { colors: { upward: "#22c55e", downward: "#ef4444" }, wick: { useFillColor: true } },
      },
      colors: overlaySeries.length > 0 ? getOverlaySeriesColors(overlaySeries) : undefined,
      stroke: { width: overlaySeries.length > 0 ? [1, ...overlaySeries.map(() => 2)] : undefined },
      grid: { borderColor: "#333", strokeDashArray: 3 },
      tooltip: { theme: "dark" as const },
      annotations: {
        yaxis: astroAnnotations.map((a) => ({
          y: a.y,
          borderColor: a.borderColor,
          label: a.label
            ? {
                text: a.label.text,
                style: {
                  ...a.label.style,
                  fontSize: "10px",
                  background: a.label.style.background,
                },
              }
            : undefined,
        })),
      },
      dataLabels: { enabled: false },
    };
  }, [overlaySeries, astroAnnotations, showVolume]);

  const statusColor = sse.status?.freshness === "LIVE" ? "text-green-500" :
    sse.status?.freshness === "STALE" ? "text-amber-500" : "text-zinc-400";
  const statusLabel = sse.connected ? (sse.status?.freshness ?? "CONNECTING") : "OFFLINE";

  const marketDef = SYMBOLS.find((s) => s.key === symbol);
  const market = liveLevels?.markets.find((m) => m.key === marketDef?.marketKey);
  const moonPhase = liveLevels?.moonPhase;
  const moonNakshatra = liveLevels?.moonNakshatra;

  const topControls = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        {SYMBOLS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSymbol(s.key)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
            style={{
              border: symbol === s.key ? "1px solid #22c55e" : "1px solid #3f3f46",
              background: symbol === s.key ? "#22c55e" : "transparent",
              color: symbol === s.key ? "#000" : "#e4e4e7",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      <div className="flex items-center gap-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.ms}
            onClick={() => setIntervalMs(tf.ms)}
            className="px-2 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              border: intervalMs === tf.ms ? "1px solid #22c55e" : "1px solid #3f3f46",
              background: intervalMs === tf.ms ? "#22c55e" : "transparent",
              color: intervalMs === tf.ms ? "#000" : "#e4e4e7",
            }}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-zinc-700" />

      <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
        <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
        Volume
      </label>

      <select
        value={showAstroLevels ? "astro" : showGannLevels ? "gann" : showSquareRootLevels ? "sqrt" : "none"}
        onChange={(e) => {
          const v = e.target.value;
          setShowAstroLevels(v === "astro");
          setShowGannLevels(v === "gann");
          setShowSquareRootLevels(v === "sqrt");
        }}
        className="px-2 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs"
      >
        <option value="none">Overlays: None</option>
        <option value="astro">Astro Levels</option>
        <option value="gann">Gann Square of 9</option>
        <option value="sqrt">Square Root Levels</option>
      </select>

      <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none">
        <input type="checkbox" checked={showMoonPhase} onChange={(e) => setShowMoonPhase(e.target.checked)} />
        Moon Phase
      </label>

      <select
        value={activeIndicators.map((i) => `${i.id}:${i.enabled}`).join(",") || "none"}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "none") {
            setActiveIndicators([]);
            return;
          }
          const ids = val.split(",").map((part) => part.split(":")[0]);
          setActiveIndicators(
            listIndicators()
              .filter((def) => ids.includes(def.id))
              .map((def) => ({ id: def.id as IndicatorId, enabled: true, params: Object.fromEntries(def.params.map((p) => [p.key, p.default])) })),
          );
        }}
        className="px-2 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 text-xs"
      >
        <option value="none">Indicators: None</option>
        {listIndicators().map((def) => (
          <option key={def.id} value={`${def.id}:1`}>
            {def.name}
          </option>
        ))}
      </select>
    </div>
  );

  const bottomStatus = (
    <div className="shrink-0 px-3 py-1.5 border-t border-zinc-800 text-xs flex items-center justify-between bg-[#0b0e14]">
      <div className="flex items-center gap-3">
        <span className={`font-mono ${statusColor}`}>● {statusLabel}</span>
        <span className="font-mono text-zinc-400">{sse.status?.provider ?? "UPSTOX_V3_WS"}</span>
        {sse.status?.lastLtp != null && <span className="font-mono text-zinc-300">LTP: {sse.status.lastLtp.toFixed(2)}</span>}
      </div>
      <div className="flex items-center gap-3">
        {market && (
          <span className="font-mono text-zinc-400">
            {marketDef?.label} | Prev: {market.prevClose.toFixed(2)} | Chg: {market.changePct.toFixed(2)}%
          </span>
        )}
        {showMoonPhase && moonPhase && (
          <span className="text-zinc-300">
            {moonPhase.phaseName} | {moonNakshatra}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d1117] text-white overflow-hidden">
      <AppSidebar />
      <div className="flex flex-col h-full w-full">
        <div className="flex items-center justify-between p-3 border-b border-zinc-800 shrink-0">
          {topControls}
          {indicatorErrors.length > 0 && (
            <div className="flex items-center gap-2 ml-2">
              {indicatorErrors.map((err) => (
                <span key={err.indicatorId} className="text-[10px] text-amber-500 font-mono">
                  {err.indicatorId}: {err.message}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 w-full min-h-0 relative p-2">
          {bootstrapStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="eb-shimmer px-4 py-2 rounded-md text-xs text-zinc-400">
                Loading chart…
              </div>
            </div>
          )}
          {bootstrapStatus === "error" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-red-400">Chart error: {bootstrapError}</span>
            </div>
          )}
          {bootstrapStatus === "done" && chartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-zinc-500">NO MARKET DATA — showing demo candles</span>
            </div>
          )}
          <div className="w-full h-full">
            <ApexChart type="candlestick" height="100%" series={chartSeries} options={chartOptions} />
          </div>
        </div>

        {bottomStatus}
      </div>
    </div>
  );
}
