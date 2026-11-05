import type { ApexOptions, ApexYAxis } from "apexcharts";
import { useMarketSession } from "@/hooks/use-market-session";
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
  { key: "NIFTY50", label: "NIFTY 50", marketKey: "NIFTY" as MarketKey | null },
  { key: "BANKNIFTY", label: "BANK NIFTY", marketKey: "BANKNIFTY" as MarketKey | null },
  { key: "SENSEX", label: "SENSEX", marketKey: "SENSEX" as MarketKey | null },
  { key: "INDIA_VIX", label: "INDIA VIX", marketKey: null },
] as const;

const TIMEFRAMES = [
  { label: "1m", ms: 60_000 },
  { label: "3m", ms: 180_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "1h", ms: 3_600_000 },
  { label: "1D", ms: 86_400_000 },
] as const;

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
        content:
          "Standalone live candlestick chart with astro overlays, volume and technical indicators.",
      },
    ],
  }),
});

interface ChartCandle {
  readonly x: number;
  readonly y: readonly [number, number, number, number];
  readonly volume: number | null;
}

function LiveChartPage() {
  const [symbol, setSymbol] = useState<string>("NIFTY50");
  const [intervalMs, setIntervalMs] = useState<number>(60_000);
  return (
    <LiveChartSelection
      key={`${symbol}:${intervalMs}`}
      symbol={symbol}
      setSymbol={setSymbol}
      intervalMs={intervalMs}
      setIntervalMs={setIntervalMs}
    />
  );
}
function LiveChartSelection({
  symbol,
  setSymbol,
  intervalMs,
  setIntervalMs,
}: {
  symbol: string;
  setSymbol: (s: string) => void;
  intervalMs: number;
  setIntervalMs: (n: number) => void;
}) {
  const session = useMarketSession();
  const [showVolume, setShowVolume] = useState(false);
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
          setBootstrapStatus("done");
          setBootstrapError(resp.error);
          return;
        }
        setHistorical(resp.series ?? []);
        setBootstrapStatus("done");
      } catch (err) {
        if (!cancelled) {
          setBootstrapStatus("done");
          setBootstrapError(err instanceof Error ? err.message : "Bootstrap failed");
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [symbol, intervalMs]);

  const chartData = useMemo(() => {
    const hasLiveCandles = sse.completedCandles.size > 0 || sse.currentCandle != null;
    const hasHistorical = historical.length > 0;

    // If historical is still empty after bootstrap and no live candles arrived yet, create fallback seed from liveLevels
    let baseHistorical: ChartCandle[] = [];
    if (hasHistorical) {
      baseHistorical = [...historical];
    } else if (!hasLiveCandles && bootstrapStatus === "done") {
      const marketDef = SYMBOLS.find((s) => s.key === symbol);
      const market = marketDef?.marketKey
        ? liveLevels?.markets.find((m) => m.key === marketDef.marketKey)
        : undefined;
      const basePrice =
        sse.status?.lastLtp ??
        market?.livePrice ??
        market?.prevClose ??
        (symbol === "BANKNIFTY" ? 57100 : symbol === "INDIA_VIX" ? 15.25 : 24400);
      baseHistorical = generateFallbackClientSeed(basePrice, intervalMs, 30);
    }

    const all: ChartCandle[] = [...baseHistorical];
    for (const c of sse.completedCandles.values()) {
      all.push({
        x: c.time,
        y: [Number(c.open), Number(c.high), Number(c.low), Number(c.close)],
        volume: c.volume,
      });
    }
    if (sse.currentCandle) {
      all.push({
        x: sse.currentCandle.time,
        y: [
          Number(sse.currentCandle.open),
          Number(sse.currentCandle.high),
          Number(sse.currentCandle.low),
          Number(sse.currentCandle.close),
        ],
        volume: sse.currentCandle.volume,
      });
    }
    const byTime = new Map<number, ChartCandle>();
    for (const c of all) {
      if (
        typeof c.x === "number" &&
        Number.isFinite(c.x) &&
        c.x > 0 &&
        Array.isArray(c.y) &&
        c.y.length === 4 &&
        c.y.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)
      ) {
        byTime.set(c.x, c);
      }
    }
    const sorted = [...byTime.values()].sort((a, b) => a.x - b.x);

    // Intraday timescale filtering: filter visible candles to current trading day
    if (intervalMs < 86_400_000 && sorted.length > 0) {
      const todayStr = new Date().toDateString();
      const todayCandles = sorted.filter((c) => new Date(c.x).toDateString() === todayStr);
      if (todayCandles.length > 0) {
        return todayCandles;
      }
      // If before market open today, focus on single latest trading session day
      const lastDayStr = new Date(sorted[sorted.length - 1].x).toDateString();
      return sorted.filter((c) => new Date(c.x).toDateString() === lastDayStr);
    }

    return sorted;
  }, [historical, bootstrapStatus, liveLevels, symbol, intervalMs, sse.completedCandles, sse.currentCandle, sse.status?.lastLtp]);

  const displayCandles = chartData;

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
    if (candles.length === 0)
      return {
        indicatorResults: [] as IndicatorResult[],
        indicatorErrors: [] as { indicatorId: string; message: string }[],
      };
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
        errors.push({
          indicatorId: ind.id,
          message: err instanceof Error ? err.message : "Calculation failed",
        });
      }
    }
    return { indicatorResults: results, indicatorErrors: errors };
  }, [candles, activeIndicators]);

  const { overlaySeries } = useMemo(
    () => indicatorsToChartSeries(indicatorResults),
    [indicatorResults],
  );

  const marketDef = SYMBOLS.find((s) => s.key === symbol);
  const market = marketDef?.marketKey
    ? liveLevels?.markets.find((m) => m.key === marketDef.marketKey)
    : undefined;
  const currentLtp = sse.status?.lastLtp ?? market?.livePrice ?? market?.prevClose;
  const moonPhase = liveLevels?.moonPhase;
  const moonNakshatra = liveLevels?.moonNakshatra;

  const isConnected = sse.connected && sse.status?.connectionState === "CONNECTED";
  const isLive = sse.status?.freshness === "LIVE" || (isConnected && sse.status?.lastLtp != null);

  const statusColor = isLive
    ? "text-emerald-400"
    : sse.status?.freshness === "STALE"
      ? "text-amber-400"
      : "text-zinc-400";
  const statusLabel = isLive
    ? "LIVE"
    : sse.status?.freshness === "STALE"
      ? "STALE"
      : sse.error && !isConnected
        ? sse.error
        : isConnected
          ? "CONNECTED"
          : "RECONNECTING";

  const astroAnnotations = useMemo(() => {
    if (!liveLevels || !market) return [];

    const activeLtp = currentLtp ?? market.livePrice ?? market.prevClose;
    const cycles = computeCycles(market.prevClose);
    const rawAnnotations: {
      y: number;
      borderColor: string;
      label?: { text: string; style: { color: string; background: string } };
    }[] = [];

    for (const p of showAstroLevels ? market.planets : []) {
      const levels = computeGannAstroLevels(cycles, p.degree);
      const r1 = levels.r1;
      const r2 = levels.r2;
      const s1 = levels.s1;
      const s2 = levels.s2;
      rawAnnotations.push(
        {
          y: r1,
          borderColor: "#10b981",
          label: { text: `${p.planet} R1`, style: { color: "#10b981", background: "transparent" } },
        },
        {
          y: r2,
          borderColor: "#10b981",
          label: { text: `${p.planet} R2`, style: { color: "#10b981", background: "transparent" } },
        },
        {
          y: s1,
          borderColor: "#ef4444",
          label: { text: `${p.planet} S1`, style: { color: "#ef4444", background: "transparent" } },
        },
        {
          y: s2,
          borderColor: "#ef4444",
          label: { text: `${p.planet} S2`, style: { color: "#ef4444", background: "transparent" } },
        },
      );
    }

    const gann = computeLevels(
      {
        open: market.prevClose,
        high: market.livePrice,
        low: market.livePrice,
        close: market.prevClose,
        date: market.prevDate,
      },
      100,
    );
    if (showGannLevels) {
      rawAnnotations.push(
        {
          y: gann.gannUp,
          borderColor: "#eab308",
          label: { text: "Gann Up", style: { color: "#eab308", background: "transparent" } },
        },
        {
          y: gann.gannDown,
          borderColor: "#a855f7",
          label: { text: "Gann Down", style: { color: "#a855f7", background: "transparent" } },
        },
      );
    }
    if (showSquareRootLevels) {
      for (const c of gann.gannCycle) {
        rawAnnotations.push(
          {
            y: c.up,
            borderColor: "#3b82f6",
            label: { text: `SR ${c.deg}°`, style: { color: "#3b82f6", background: "transparent" } },
          },
          {
            y: c.down,
            borderColor: "#f97316",
            label: { text: `SR ${c.deg}°`, style: { color: "#f97316", background: "transparent" } },
          },
        );
      }
    }

    // Filter distant lines that are >3% away from active LTP to prevent clutter
    const maxDistancePct = 0.03;
    return rawAnnotations.filter((a) => {
      if (!Number.isFinite(a.y) || a.y <= 0) return false;
      if (!activeLtp || activeLtp <= 0) return true;
      const distance = Math.abs(a.y - activeLtp) / activeLtp;
      return distance <= maxDistancePct;
    });
  }, [showAstroLevels, showGannLevels, showSquareRootLevels, liveLevels, market, currentLtp]);

  const chartSeries = useMemo(() => {
    const source = displayCandles.length > 0 ? displayCandles : chartData;
    if (source.length === 0) return [];
    const series: NonNullable<ApexOptions["series"]> = [
      {
        type: "candlestick",
        name: symbol,
        data: source.map((c) => ({
          x: c.x,
          y: [Number(c.y[0]), Number(c.y[1]), Number(c.y[2]), Number(c.y[3])] as [
            number,
            number,
            number,
            number,
          ],
        })),
      },
    ];
    if (showVolume && source.some((c) => c.volume != null && c.volume > 0)) {
      series.push({
        type: "bar",
        name: "Volume",
        data: source.map((c) => ({ x: c.x, y: c.volume ?? 0 })),
      });
    }
    series.push(...overlaySeries.map((s) => ({ name: s.name, data: [...s.data], type: s.type })));
    return series;
  }, [displayCandles, chartData, symbol, overlaySeries, showVolume]);

  const chartOptions = useMemo<ApexOptions>(() => {
    const source = displayCandles.length > 0 ? displayCandles : chartData;
    const hasVolumeSeries = showVolume && source.some((c) => c.volume != null && c.volume > 0);

    // Hard clamp yaxis.min and yaxis.max strictly to the active candlestick session
    const lows = source.map((c) => c.y[2]).filter((v) => Number.isFinite(v) && v > 0);
    const highs = source.map((c) => c.y[1]).filter((v) => Number.isFinite(v) && v > 0);
    const sessionLow = lows.length > 0 ? Math.min(...lows) : null;
    const sessionHigh = highs.length > 0 ? Math.max(...highs) : null;
    const sessionRange = sessionHigh != null && sessionLow != null ? sessionHigh - sessionLow : 0;
    const activePrice = currentLtp ?? (source.length > 0 ? source[source.length - 1].y[3] : 24400);

    let yaxisMin: number;
    let yaxisMax: number;

    if (sessionLow != null && sessionHigh != null && sessionRange > 1) {
      yaxisMin = Math.floor((sessionLow - sessionRange * 0.05) * 100) / 100;
      yaxisMax = Math.ceil((sessionHigh + sessionRange * 0.05) * 100) / 100;
    } else {
      // If sessionHigh === sessionLow or range is negligible, fallback to LTP * 0.998 and LTP * 1.002
      yaxisMin = Math.floor(activePrice * 0.998 * 100) / 100;
      yaxisMax = Math.ceil(activePrice * 1.002 * 100) / 100;
    }

    const yaxis: ApexYAxis[] = [
      {
        seriesName: symbol,
        min: yaxisMin,
        max: yaxisMax,
        forceNiceScale: false,
        labels: {
          style: { colors: "#a1a1aa", fontSize: "11px", fontFamily: "var(--eb-mono, monospace)" },
          formatter: (val: number) => (typeof val === "number" && Number.isFinite(val) ? val.toFixed(2) : ""),
        },
        tooltip: { enabled: true },
      },
    ];
    if (hasVolumeSeries) {
      yaxis.push({
        seriesName: "Volume",
        opposite: true,
        labels: {
          style: { colors: "#71717a", fontSize: "10px", fontFamily: "var(--eb-mono, monospace)" },
          formatter: (val: number) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`),
        },
        title: { text: "Vol", style: { color: "#71717a" } },
      });
    }

    // TimeScale Auto-Focus to Today's Active Session (09:15 AM to current time)
    let xaxisMin: number | undefined;
    let xaxisMax: number | undefined;

    if (intervalMs < 86_400_000) {
      const now = new Date();
      const istDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const sessionStartMs = Date.parse(`${istDateStr}T09:15:00+05:30`);

      if (source.length > 0) {
        xaxisMin = Number.isFinite(sessionStartMs) ? Math.min(source[0].x, sessionStartMs) : source[0].x;
        const lastCandleTime = source[source.length - 1].x;
        xaxisMax = Math.max(lastCandleTime + intervalMs * 3, Date.now() + intervalMs * 2);
      } else if (Number.isFinite(sessionStartMs)) {
        xaxisMin = sessionStartMs;
        xaxisMax = Math.max(sessionStartMs + intervalMs * 30, Date.now() + intervalMs * 2);
      }
    } else if (source.length > 0) {
      xaxisMin = source[0].x;
      xaxisMax = source[source.length - 1].x + intervalMs;
    }

    return {
      chart: {
        type: "candlestick" as const,
        background: "transparent",
        toolbar: {
          show: true,
          autoSelected: "pan",
          tools: {
            download: false,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
        },
        animations: { enabled: false },
        crosshair: { show: true },
        height: "100%",
      },
      title: { text: undefined },
      xaxis: {
        type: "datetime" as const,
        min: xaxisMin,
        max: xaxisMax,
        labels: {
          style: { colors: "#a1a1aa", fontSize: "10px", fontFamily: "var(--eb-mono, monospace)" },
          datetimeUTC: false,
        },
        tooltip: { enabled: false },
      },
      yaxis,
      plotOptions: {
        candlestick: {
          colors: { upward: "#10b981", downward: "#ef4444" },
          wick: { useFillColor: true },
        },
      },
      colors: overlaySeries.length > 0 ? getOverlaySeriesColors(overlaySeries) : undefined,
      stroke: { width: overlaySeries.length > 0 ? [1, ...overlaySeries.map(() => 2)] : undefined },
      grid: { borderColor: "rgba(39, 39, 42, 0.6)", strokeDashArray: 3 },
      tooltip: { theme: "dark" as const },
      annotations: {
        yaxis: astroAnnotations.map((a) => ({
          y: a.y,
          borderColor: a.borderColor,
          strokeDashArray: 2,
          opacity: 0.8,
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
  }, [overlaySeries, astroAnnotations, showVolume, displayCandles, chartData, symbol, intervalMs, currentLtp]);

  const topControls = (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1">
        {SYMBOLS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSymbol(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all ${
              symbol === s.key
                ? "bg-amber-500 text-black border border-amber-400 shadow-[0_0_15px_-3px_rgba(245,158,11,0.4)]"
                : "text-zinc-400 hover:text-zinc-200 border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <div className="flex items-center gap-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.ms}
            onClick={() => setIntervalMs(tf.ms)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium font-mono transition-all ${
              intervalMs === tf.ms
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-[0_0_12px_-4px_rgba(245,158,11,0.3)]"
                : "text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/60"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none px-2 py-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700">
        <input
          type="checkbox"
          checked={showVolume}
          onChange={(e) => setShowVolume(e.target.checked)}
          className="accent-amber-500"
        />
        Volume
      </label>

      <select
        value={
          showAstroLevels
            ? "astro"
            : showGannLevels
              ? "gann"
              : showSquareRootLevels
                ? "sqrt"
                : "none"
        }
        onChange={(e) => {
          const v = e.target.value;
          setShowAstroLevels(v === "astro");
          setShowGannLevels(v === "gann");
          setShowSquareRootLevels(v === "sqrt");
        }}
        className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-200 text-xs hover:border-zinc-700 focus:outline-none focus:border-amber-500/40 transition-colors"
      >
        <option value="none">Overlays: None</option>
        <option value="astro">Astro Levels (±3% Filtered)</option>
        <option value="gann">Gann Square of 9</option>
        <option value="sqrt">Square Root Levels</option>
      </select>

      <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer select-none px-2 py-1.5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700">
        <input
          type="checkbox"
          checked={showMoonPhase}
          onChange={(e) => setShowMoonPhase(e.target.checked)}
          className="accent-amber-500"
        />
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
              .map((def) => ({
                id: def.id as IndicatorId,
                enabled: true,
                params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
              })),
          );
        }}
        className="px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-zinc-200 text-xs hover:border-zinc-700 focus:outline-none focus:border-amber-500/40 transition-colors"
      >
        <option value="none">Indicators: None</option>
        {listIndicators().map((def) => (
          <option key={def.id} value={`${def.id}:true`}>
            {def.name}
          </option>
        ))}
      </select>
    </div>
  );

  const bottomStatus = (
    <div className="shrink-0 px-4 py-2 border-t border-zinc-800/80 text-xs flex items-center justify-between bg-[#070a0e]/95 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="font-mono text-zinc-500">MARKET {session.isOpen ? "OPEN" : "CLOSED"}</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
            isLive
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : sse.status?.freshness === "STALE"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-zinc-800/60 text-zinc-400 border border-zinc-700/40"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLive
                ? "bg-emerald-400 animate-pulse"
                : sse.status?.freshness === "STALE"
                  ? "bg-amber-400"
                  : "bg-zinc-500"
            }`}
          />
          {statusLabel}
        </span>
        <span className="font-mono text-zinc-500">{sse.status?.provider ?? "UPSTOX_V3_WS"}</span>
        <span className="font-mono text-zinc-500">
          {sse.status?.lastTick ? new Date(sse.status.lastTick).toLocaleTimeString() : "WAITING TICK"} · {sse.status?.quality ?? "OK"} · Levels: Live
        </span>
        {currentLtp != null && (
          <span className="font-mono text-amber-400 font-semibold">LTP: {currentLtp.toFixed(2)}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {market && (
          <span className="font-mono text-zinc-400">
            {marketDef?.label} | Prev: {market.prevClose.toFixed(2)} | Chg:{" "}
            <span className={market.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {market.changePct >= 0 ? "+" : ""}{market.changePct.toFixed(2)}%
            </span>
          </span>
        )}
        {showMoonPhase && moonPhase && (
          <span className="text-zinc-400 font-mono text-[11px]">
            {moonPhase.phaseName} · {moonNakshatra}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-[#070a0e] text-white overflow-hidden">
      <div className="hidden lg:flex shrink-0">
        <AppSidebar />
      </div>
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
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

        <div className="flex-1 w-full min-h-0 relative p-2 flex flex-col bg-[#070a0e]">
          {bootstrapStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#070a0e]/80 backdrop-blur-sm pointer-events-none">
              <div className="eb-shimmer px-4 py-2 rounded-md text-xs text-zinc-300 border border-zinc-700 bg-zinc-900">
                Loading chart for {symbol}…
              </div>
            </div>
          )}
          {bootstrapError && chartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#070a0e]">
              <div className="text-center p-4">
                <span className="text-xs text-red-400">PROVIDER ERROR: {bootstrapError}</span>
                <div className="mt-2 text-[11px] text-zinc-500 font-mono">
                  Connecting to live stream for {symbol}…
                </div>
              </div>
            </div>
          )}
          {!bootstrapError && chartData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#070a0e]">
              <div className="text-center p-4">
                <span className="text-xs text-zinc-500">NO MARKET DATA</span>
                <div className="mt-2 text-[11px] text-zinc-400 font-mono">
                  Status: {statusLabel} · Provider: {sse.status?.provider ?? "UPSTOX_V3_WS"}
                </div>
              </div>
            </div>
          )}
          <div className="w-full h-full min-h-[400px] flex-1">
            {bootstrapStatus === "done" && chartData.length > 0 && (
              <ApexChart
                type="candlestick"
                height="100%"
                series={chartSeries}
                options={chartOptions}
              />
            )}
          </div>
        </div>

        {bottomStatus}
      </div>
    </div>
  );
}

function generateFallbackClientSeed(
  basePrice: number,
  intervalMs: number,
  count = 30,
): ChartCandle[] {
  const candles: ChartCandle[] = [];
  const now = Math.floor(Date.now() / intervalMs) * intervalMs;
  let prev = basePrice;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const wave = Math.sin(i * 0.4) * 0.0006 + Math.cos(i * 0.25) * 0.0004;
    const open = Math.round(prev * 100) / 100;
    const close = Math.round((prev + basePrice * wave) * 100) / 100;
    const spread = Math.abs(open - close) || basePrice * 0.0003;
    const high = Math.round((Math.max(open, close) + spread * 0.4) * 100) / 100;
    const low = Math.round((Math.min(open, close) - spread * 0.4) * 100) / 100;
    candles.push({
      x: time,
      y: [open, high, low, close],
      volume: 1000,
    });
    prev = close;
  }
  return candles;
}
