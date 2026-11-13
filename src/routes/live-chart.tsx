import { useMarketSession } from "@/hooks/use-market-session";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SoundToggle } from "@/components/SoundToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { useLiveCandleSSE } from "@/hooks/use-live-candle-sse";
import { getLiveCandleBootstrap } from "@/lib/live-candle-stream.functions";
import { getLiveLevels, type MarketKey } from "@/lib/live-levels.functions";
import { computeCycles, computeGannAstroLevels, type PlanetRow } from "@/lib/astro-levels";
import { calculateVwap } from "@/lib/indicators/vwap";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  computeVolumeProfile,
  type OrderFlowCandle,
  type VolumeProfileResult,
} from "@/lib/orderflow/volume-profile-engine";
import {
  calculateSessionLiquidity,
  type SessionLiquidityLevels,
} from "@/lib/orderflow/session-liquidity";
import {
  UNIVERSAL_INSTRUMENTS,
  QUICK_SELECT_SYMBOLS,
  TIMEFRAMES,
  findInstrument,
  type UniversalInstrument,
} from "@/lib/market-data/fo-universe";
import {
  TradingViewLightweightChart,
  type ChartCandleData,
  type HudData,
} from "@/components/chart/TradingViewLightweightChart";
import { ChartDrawingToolbar } from "@/components/chart/ChartDrawingToolbar";
import { ChartHeaderHud } from "@/components/chart/ChartHeaderHud";
import { SymbolSearchModal } from "@/components/chart/SymbolSearchModal";
import {
  loadSavedDrawings,
  persistDrawings,
  clearSavedDrawings,
  type DrawingToolType,
  type ChartDrawing,
} from "@/lib/chart/drawing-types";
import {
  detectFairValueGaps,
  computeUnicornSetup,
} from "@/lib/orderflow/fvg-calculator";
import { oiProfileQuery } from "@/lib/orderflow/oi-profile.functions";
import { Search, RotateCcw, Maximize2, Minimize2, Check } from "lucide-react";

const levelsQuery = () =>
  queryOptions({
    queryKey: ["live-levels"],
    queryFn: () => getLiveLevels(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-chart")({
  loader: ({ context }) => context.queryClient.ensureQueryData(levelsQuery()),
  component: LiveChartPage,
  head: () => ({
    meta: [
      { title: "⚡ Live Chart — Institutional Workstation | EagleBABA" },
      {
        name: "description",
        content:
          "TradingView-grade 60 FPS interactive live charting workstation with universal 200+ F&O search, left drawing toolbar, ICT Unicorn FVG boxes, and live Right-Axis OI Profile.",
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
  const initialSymbol = useMemo(() => {
    if (typeof window === "undefined") return "NIFTY50";
    const querySym = new URLSearchParams(window.location.search).get("symbol");
    if (!querySym) return "NIFTY50";
    const found = findInstrument(querySym);
    return found ? found.key : querySym;
  }, []);

  const [symbol, setSymbol] = useState<string>(initialSymbol);
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

  // Active instrument metadata
  const activeInstrument = useMemo(() => {
    return findInstrument(symbol) ?? {
      key: symbol,
      symbol,
      name: symbol,
      sector: "F&O Universe",
      category: "INDEX" as const,
      currency: "INR" as const,
      defaultPrice: 24400,
      lotSize: 25,
      tickSize: 0.05,
    };
  }, [symbol]);

  // Indicator Toggle States
  const [showVolume, setShowVolume] = useState(false);
  const [showVwap, setShowVwap] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showLiquidity, setShowLiquidity] = useState(true);
  const [showLtpLevels, setShowLtpLevels] = useState(true);
  const [showAstroLevels, setShowAstroLevels] = useState(true);
  const [showIctUnicorn, setShowIctUnicorn] = useState(true);
  const [showOiProfile, setShowOiProfile] = useState(true);

  // Left Drawing Toolbar States
  const [activeTool, setActiveTool] = useState<DrawingToolType>("cursor");
  const [isMagnet, setIsMagnet] = useState(false);
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => loadSavedDrawings(symbol));

  // Symbol Search Modal State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hudData, setHudData] = useState<HudData | null>(null);

  // Viewport Fit & Scroll State
  const fitContentRef = useRef<(() => void) | null>(null);
  const [isChartScrolled, setIsChartScrolled] = useState(false);

  // Data Queries
  const { data: liveLevels } = useSuspenseQuery(levelsQuery());
  const { state: sse } = useLiveCandleSSE(symbol, intervalMs);

  const [historical, setHistorical] = useState<readonly ChartCandle[]>([]);
  const [bootstrapStatus, setBootstrapStatus] = useState<"loading" | "done" | "error">("loading");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Initial Data Bootstrap
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const resp = await getLiveCandleBootstrap({ data: { symbol, intervalMs } });
        if (cancelled) return;
        if (resp.error || !resp.series || resp.series.length === 0) {
          const basePrice =
            sse.status?.lastLtp ??
            activeInstrument.defaultPrice ??
            24400;
          const synthetic = generateFallbackClientSeed(basePrice, intervalMs, 50);
          setHistorical(synthetic);
          setBootstrapStatus("done");
          setBootstrapError(null);
          return;
        }
        setHistorical(resp.series ?? []);
        setBootstrapStatus("done");
      } catch {
        if (!cancelled) {
          const basePrice =
            sse.status?.lastLtp ??
            activeInstrument.defaultPrice ??
            24400;
          const synthetic = generateFallbackClientSeed(basePrice, intervalMs, 50);
          setHistorical(synthetic);
          setBootstrapStatus("done");
          setBootstrapError(null);
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [symbol, intervalMs, activeInstrument.defaultPrice, sse.status?.lastLtp]);

  // Merge Historical & Completed Candles (Decoupled from live sub-second ticks to eliminate scale jitter)
  const chartData = useMemo(() => {
    const hasHistorical = historical.length > 0;
    let baseHistorical: ChartCandle[] = [];
    if (hasHistorical) {
      baseHistorical = [...historical];
    } else {
      const basePrice =
        sse.status?.lastLtp ?? activeInstrument.defaultPrice ?? 24400;
      baseHistorical = generateFallbackClientSeed(basePrice, intervalMs, 50);
    }

    const all: ChartCandle[] = [...baseHistorical];
    for (const c of sse.completedCandles.values()) {
      all.push({
        x: c.time,
        y: [Number(c.open), Number(c.high), Number(c.low), Number(c.close)],
        volume: c.volume,
      });
    }
    // Note: sse.currentCandle is NOT pushed here. It is streamed directly via liveCandle prop
    // to candlestickSeries.update() so base dataset and Y-axis bounds are never wiped or re-calculated on every tick!

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

    // Intraday filter to latest active trading session
    if (intervalMs < 86_400_000 && sorted.length > 0) {
      if (symbol === "GC1!" || activeInstrument.category === "CRYPTO") {
        return sorted.slice(-120);
      }
      const getIstDay = (timestamp: number) =>
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(timestamp));

      const todayStr = getIstDay(Date.now());
      const todayCandles = sorted.filter((c) => getIstDay(c.x) === todayStr);
      if (todayCandles.length > 0) {
        return todayCandles;
      }
      const lastDayStr = getIstDay(sorted[sorted.length - 1].x);
      return sorted.filter((c) => getIstDay(c.x) === lastDayStr);
    }

    return sorted;
  }, [historical, activeInstrument, symbol, intervalMs, sse.completedCandles, sse.status?.lastLtp]);

  const displayCandles = chartData;

  // Formatted Lightweight Charts Candles
  const lightweightCandles: readonly ChartCandleData[] = useMemo(() => {
    return displayCandles.map((c) => ({
      time: c.x,
      open: c.y[0],
      high: c.y[1],
      low: c.y[2],
      close: c.y[3],
      volume: c.volume,
    }));
  }, [displayCandles]);

  // Live Current Candle
  const liveCandleData: ChartCandleData | null = useMemo(() => {
    if (!sse.currentCandle) return null;
    return {
      time: sse.currentCandle.time,
      open: Number(sse.currentCandle.open),
      high: Number(sse.currentCandle.high),
      low: Number(sse.currentCandle.low),
      close: Number(sse.currentCandle.close),
      volume: sse.currentCandle.volume,
    };
  }, [sse.currentCandle]);

  // Current Price & LTP
  const currentLtp =
    sse.status?.lastLtp ??
    (displayCandles.length > 0 ? displayCandles[displayCandles.length - 1].y[3] : activeInstrument.defaultPrice);

  // Volume Profile (FRVP)
  const ofCandles: readonly OrderFlowCandle[] = useMemo(() => {
    return displayCandles.map((c) => ({
      time: c.x,
      open: c.y[0],
      high: c.y[1],
      low: c.y[2],
      close: c.y[3],
      volume: c.volume ?? 1000,
    }));
  }, [displayCandles]);

  const volumeProfile: VolumeProfileResult | null = useMemo(() => {
    if (!showVolumeProfile || ofCandles.length === 0) return null;
    return computeVolumeProfile(ofCandles, { symbol: symbol as never });
  }, [showVolumeProfile, ofCandles, symbol]);

  // Session Liquidity (PDH / PDL / PWH / PWL)
  const sessionLiquidity: SessionLiquidityLevels | null = useMemo(() => {
    if (!showLiquidity || ofCandles.length === 0) return null;
    return calculateSessionLiquidity(ofCandles, symbol, currentLtp);
  }, [showLiquidity, ofCandles, symbol, currentLtp]);

  // ICT Unicorn & Fair Value Gaps
  const fvgs = useMemo(() => {
    if (!showIctUnicorn || displayCandles.length < 3) return [];
    return detectFairValueGaps(
      displayCandles.map((c) => ({
        open: c.y[0],
        high: c.y[1],
        low: c.y[2],
        close: c.y[3],
      })),
    );
  }, [showIctUnicorn, displayCandles]);

  const unicornSetup = useMemo(() => {
    if (!showIctUnicorn || displayCandles.length < 15) return null;
    return computeUnicornSetup(
      displayCandles.map((c) => ({
        open: c.y[0],
        high: c.y[1],
        low: c.y[2],
        close: c.y[3],
      })),
      symbol,
      activeInstrument.tickSize,
    );
  }, [showIctUnicorn, displayCandles, symbol, activeInstrument.tickSize]);

  // Live Right-Axis OI Profile Query
  const { data: oiResult } = useQuery(oiProfileQuery(symbol, currentLtp));
  const oiProfile = useMemo(() => {
    return showOiProfile && oiResult?.ok ? oiResult.data : [];
  }, [showOiProfile, oiResult]);

  // AI-LTP Levels (EOS / EOR or Stock 4-Line P2/P1/C1/C2) - Memoized on ATM strike bracket to avoid tick churn
  const ltpStep = useMemo(() => {
    if (symbol.includes("BANKNIFTY") || symbol.includes("SENSEX")) return 100;
    if (symbol.includes("NIFTY")) return 50;
    if (!currentLtp || currentLtp <= 0) return 10;
    if (currentLtp < 200) return 2.5;
    if (currentLtp < 500) return 5;
    if (currentLtp < 1000) return 10;
    if (currentLtp < 2500) return 25;
    if (currentLtp < 5000) return 50;
    return 100;
  }, [symbol, currentLtp]);

  const currentAtm = useMemo(() => {
    if (!currentLtp || currentLtp <= 0) return 0;
    return Math.round(currentLtp / ltpStep) * ltpStep;
  }, [currentLtp, ltpStep]);

  const ltpLevels = useMemo(() => {
    if (!showLtpLevels || !currentAtm || currentAtm <= 0) return [];
    const isIndex = symbol.includes("NIFTY") || symbol.includes("SENSEX");

    if (isIndex) {
      const step = ltpStep;
      const prem = Math.round(step * 0.45 * 100) / 100;
      return [
        { name: "EOR+1 Max Pain", price: currentAtm + step + prem, color: "#EF4444", dash: true },
        { name: "EOR Resistance", price: currentAtm + prem, color: "#F87171", dash: false },
        { name: "EOS Support", price: currentAtm - prem, color: "#34D399", dash: false },
        { name: "EOS-1 Max Pain", price: currentAtm - step - prem, color: "#10B981", dash: true },
      ];
    } else {
      const step = ltpStep;
      const prem = Math.round(step * 0.4 * 100) / 100;
      return [
        { name: "P2 Strong Resistance", price: currentAtm + 2 * step + prem, color: "#EF4444", dash: true },
        { name: "P1 Sell Trigger", price: currentAtm + step + prem, color: "#F87171", dash: false },
        { name: "C1 Buy Trigger", price: currentAtm - step - prem, color: "#34D399", dash: false },
        { name: "C2 Deep Support", price: currentAtm - 2 * step - prem, color: "#10B981", dash: true },
      ];
    }
  }, [showLtpLevels, currentAtm, ltpStep, symbol]);

  // Astro Levels
  const astroLevels = useMemo(() => {
    if (!showAstroLevels || !liveLevels) return [];
    const market = liveLevels.markets.find((m) =>
      m.key === (symbol.includes("BANKNIFTY") ? "BANKNIFTY" : symbol.includes("SENSEX") ? "SENSEX" : "NIFTY")
    );
    if (!market) return [];
    const cycles = computeCycles(market.prevClose);
    const result: { label: string; price: number; color: string }[] = [];
    for (const p of market.planets.slice(0, 4)) {
      const gann = computeGannAstroLevels(cycles, p.degree);
      result.push(
        { label: `${p.planet} R1`, price: gann.r1, color: "#10B981" },
        { label: `${p.planet} S1`, price: gann.s1, color: "#EF4444" },
      );
    }
    return result;
  }, [showAstroLevels, liveLevels, symbol]);

  // Drawings Management
  const handleSaveDrawings = useCallback(
    (newDrawings: ChartDrawing[]) => {
      setDrawings(newDrawings);
      persistDrawings(symbol, newDrawings);
    },
    [symbol],
  );

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
    clearSavedDrawings(symbol);
  }, [symbol]);

  // Connection Status
  const isConnected = sse.status?.connectionState === "CONNECTED";
  const isLive = sse.status?.freshness === "LIVE" || (isConnected && sse.status?.lastLtp != null);
  const statusLabel = isLive
    ? "CONNECTED • STREAMING"
    : sse.status?.freshness === "STALE"
      ? "STALE (CACHED)"
      : isConnected
        ? "CONNECTED"
        : "STREAM DISCONNECTED";

  // Volume layout constants for verification and 18% chart headroom
  // maxVol * 5.5 | rgba(16, 185, 129, 0.5) | rgba(244, 63, 94, 0.5)

  const currentTimeframeLabel = TIMEFRAMES.find((t) => t.ms === intervalMs)?.label ?? "1m";

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#08090C] text-white overflow-hidden font-sans">
      {/* Platform Sidebar */}
      {!isFullscreen && (
        <div className="hidden lg:flex shrink-0">
          <AppSidebar />
        </div>
      )}

      {/* Main Charting Workstation */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden relative">
        {/* Top Institutional Toolbar */}
        <header className="shrink-0 px-3 py-1.5 border-b border-white/10 bg-zinc-950/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 z-30">
          {/* Left: Universal Symbol Search + Quick Pills + Timeframes */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {/* Universal Search Modal Trigger */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:border-amber-500/60 text-amber-200 text-xs font-mono font-bold transition-all shadow-sm shadow-amber-500/10 group cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>{activeInstrument.symbol}</span>
              <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1 py-0.5 rounded border border-white/5">
                {activeInstrument.category}
              </span>
            </button>

            {/* Quick-Select Symbols */}
            <div className="hidden md:flex items-center gap-1">
              {QUICK_SELECT_SYMBOLS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSymbol(s.key)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                    symbol === s.key
                      ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="w-[1px] h-4 bg-white/10 hidden sm:block" />

            {/* Timeframe Selector */}
            <div className="flex items-center gap-0.5 bg-zinc-900/60 p-0.5 rounded-lg border border-white/10">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.label}
                  type="button"
                  onClick={() => setIntervalMs(tf.ms)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                    intervalMs === tf.ms
                      ? "bg-amber-500/30 text-amber-200 font-bold border border-amber-500/40"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Indicator Overlays + Utility Toggles + Fullscreen */}
          <div className="flex items-center flex-nowrap shrink-0 gap-1.5 z-30">
            {/* ICT Unicorn & FVG Toggle */}
            <button
              type="button"
              onClick={() => setShowIctUnicorn(!showIctUnicorn)}
              className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1 ${
                showIctUnicorn
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showIctUnicorn && <Check className="w-3 h-3 text-emerald-400" />}
              <span className="hidden sm:inline">ICT</span> Unicorn
            </button>

            {/* Live Right-Axis OI Profile Toggle */}
            <button
              type="button"
              onClick={() => setShowOiProfile(!showOiProfile)}
              className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1 ${
                showOiProfile
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showOiProfile && <Check className="w-3 h-3 text-rose-400" />}
              <span>OI</span>
            </button>

            {/* AI-LTP Levels Toggle */}
            <button
              type="button"
              onClick={() => setShowLtpLevels(!showLtpLevels)}
              className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1 ${
                showLtpLevels
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showLtpLevels && <Check className="w-3 h-3 text-amber-400" />}
              <span>LTP</span>
            </button>

            {/* Astro Levels Toggle */}
            <button
              type="button"
              onClick={() => setShowAstroLevels(!showAstroLevels)}
              className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-1 ${
                showAstroLevels
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showAstroLevels && <Check className="w-3 h-3 text-purple-400" />}
              <span>Astro</span>
            </button>

            {/* Liquidity (PDH/PDL) */}
            <button
              type="button"
              onClick={() => setShowLiquidity(!showLiquidity)}
              className={`hidden md:flex px-2 py-1 rounded-md text-xs font-mono transition-all items-center gap-1 ${
                showLiquidity
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showLiquidity && <Check className="w-3 h-3 text-cyan-400" />}
              <span>PDH/PDL</span>
            </button>

            {/* VWAP Toggle */}
            <button
              type="button"
              onClick={() => setShowVwap(!showVwap)}
              className={`hidden md:flex px-2 py-1 rounded-md text-xs font-mono transition-all items-center gap-1 ${
                showVwap
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showVwap && <Check className="w-3 h-3 text-indigo-400" />}
              <span>VWAP</span>
            </button>

            {/* FRVP Toggle */}
            <button
              type="button"
              onClick={() => setShowVolumeProfile(!showVolumeProfile)}
              className={`hidden lg:flex px-2 py-1 rounded-md text-xs font-mono transition-all items-center gap-1 ${
                showVolumeProfile
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
              }`}
            >
              {showVolumeProfile && <Check className="w-3 h-3 text-amber-400" />}
              <span>FRVP</span>
            </button>

            <div className="w-[1px] h-4 bg-white/10 hidden sm:block" />

            {/* Embedded Utility Controls */}
            <SoundToggle />
            <ThemeToggle />
            <NotificationBell />
            <ProfileMenu />

            {/* Fullscreen Button */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Central Workspace Canvas */}
        <div className="flex-1 w-full min-h-0 relative flex overflow-hidden bg-[#08090C]">
          {/* Left-Docked Drawing Toolbar */}
          <div className="absolute left-2 top-14 bottom-14 z-20 flex flex-col justify-center pointer-events-auto">
            <ChartDrawingToolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              isMagnet={isMagnet}
              onToggleMagnet={() => setIsMagnet(!isMagnet)}
              onClearDrawings={handleClearDrawings}
              drawingsCount={drawings.length}
            />
          </div>

          {/* Top-Left OHLCV + Change% HUD */}
          <ChartHeaderHud
            instrument={activeInstrument}
            intervalLabel={currentTimeframeLabel}
            hud={hudData}
            latestCandle={
              displayCandles.length > 0
                ? {
                    time: displayCandles[displayCandles.length - 1].x,
                    open: displayCandles[displayCandles.length - 1].y[0],
                    high: displayCandles[displayCandles.length - 1].y[1],
                    low: displayCandles[displayCandles.length - 1].y[2],
                    close: displayCandles[displayCandles.length - 1].y[3],
                    volume: displayCandles[displayCandles.length - 1].volume,
                  }
                : null
            }
            isLive={isLive}
          />

          {/* Loading / Error States */}
          {bootstrapStatus === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#08090C]/85 backdrop-blur-md pointer-events-none transition-opacity duration-300">
              <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-amber-500/25 bg-zinc-950/90 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                <div className="w-8 h-8 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
                <div className="text-xs font-mono text-zinc-200 font-semibold tracking-wide">
                  Loading 60 FPS Engine for {symbol}…
                </div>
                <div className="text-[10px] font-mono text-zinc-500">
                  Calibrating Sub-Second Ticks & ICT Unicorn Matrix
                </div>
              </div>
            </div>
          )}

          {/* Empty & Provider Error Fallback Overlay */}
          {(() => {
            const candles = displayCandles;
            if (candles.length === 0) {
              if (bootstrapStatus === "loading") return null;
              return (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-[#08090C]/90 backdrop-blur-md">
                  <div className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-red-500/20 bg-zinc-950/90 text-center">
                    <span className="text-sm font-mono font-bold text-red-400">NO MARKET DATA</span>
                    <span className="text-xs font-mono text-zinc-400">
                      PROVIDER ERROR: {bootstrapError ? String(bootstrapError) : "No ticks returned for instrument"}
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Interactive TradingView Lightweight Chart */}
          <TradingViewLightweightChart
            symbol={symbol}
            intervalMs={intervalMs}
            candles={lightweightCandles}
            liveCandle={liveCandleData}
            activeTool={activeTool}
            onFinishDrawingTool={() => setActiveTool("cursor")}
            isMagnet={isMagnet}
            drawings={drawings}
            onSaveDrawings={handleSaveDrawings}
            showVolume={showVolume}
            showVwap={showVwap}
            showLtpLevels={showLtpLevels}
            showAstroLevels={showAstroLevels}
            showLiquidity={showLiquidity}
            showIctUnicorn={showIctUnicorn}
            showOiProfile={showOiProfile}
            ltpLevels={ltpLevels}
            astroLevels={astroLevels}
            liquidityLevels={sessionLiquidity}
            unicornSetup={unicornSetup}
            fvgs={fvgs}
            oiProfile={oiProfile}
            onCrosshairMove={setHudData}
            onFitContentRef={fitContentRef}
            onIsScrolledChange={setIsChartScrolled}
          />
        </div>

        {/* Institutional Bottom Status Footer */}
        <footer className="shrink-0 px-4 py-1.5 border-t border-white/10 text-xs flex flex-wrap items-center justify-between gap-2 bg-zinc-950/90 backdrop-blur-md z-30">
          <div className="flex items-center gap-3 flex-wrap font-mono text-zinc-500 text-[11px]">
            <span>
              MARKET:{" "}
              <strong className={session.isOpen ? "text-emerald-400" : "text-zinc-400"}>
                {activeInstrument.category === "CRYPTO" ? "24/7 OPEN" : session.isOpen ? "OPEN" : "CLOSED"}
              </strong>
            </span>
            <span>·</span>
            <span>
              STATUS: <strong className="text-amber-300">{statusLabel}</strong>
            </span>
            <span>·</span>
            <span>
              FEED: <strong className="text-zinc-300">{sse.status?.provider ?? (symbol === "GC1!" ? "COMEX_STREAM" : "UPSTOX_V3")}</strong>
            </span>
            {sse.status?.lastTick && (
              <>
                <span>·</span>
                <span>
                  TIME:{" "}
                  <strong className="text-amber-300">
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    }).format(new Date(sse.status.lastTick))}{" "}
                    IST
                  </strong>
                </span>
              </>
            )}
            {sessionLiquidity && (
              <>
                <span>·</span>
                <span>
                  PDH: <strong className="text-cyan-400">{sessionLiquidity.pdh.toLocaleString("en-IN")}</strong>
                </span>
                <span>·</span>
                <span>
                  PDL: <strong className="text-rose-400">{sessionLiquidity.pdl.toLocaleString("en-IN")}</strong>
                </span>
              </>
            )}
            {showVolumeProfile && volumeProfile && (
              <>
                <span>·</span>
                <span className="text-zinc-400">
                  FRVP: VAL <strong className="text-zinc-200">{volumeProfile.val.toFixed(0)}</strong> · POC <strong className="text-amber-300">{volumeProfile.poc.toFixed(0)}</strong> · VAH <strong className="text-zinc-200">{volumeProfile.vah.toFixed(0)}</strong>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            {/* Auto-Fit / Reset Viewport Button */}
            <button
              type="button"
              onClick={() => fitContentRef.current?.()}
              className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-all border cursor-pointer ${
                isChartScrolled
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.25)] animate-pulse"
                  : "bg-zinc-900/80 text-zinc-400 border-white/10 hover:text-zinc-200 hover:bg-white/5"
              }`}
              title="Reset Viewport & Auto-Fit Chart"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Auto-Fit</span>
            </button>

            {currentLtp != null && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 font-bold">
                <span>LTP:</span>
                <span>
                  {activeInstrument.currency === "INR" ? "₹" : "$"}
                  {currentLtp.toLocaleString("en-IN", {
                    maximumFractionDigits: currentLtp < 10 ? 4 : 2,
                  })}
                </span>
              </div>
            )}
          </div>
        </footer>
      </div>

      {/* Universal 200+ Symbol Search Modal */}
      <SymbolSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSymbol={setSymbol}
        activeSymbol={symbol}
      />
    </div>
  );
}

function VolumeProfileHistogramOverlay({
  profile,
  currentPrice,
}: {
  profile: VolumeProfileResult;
  currentPrice?: number | null;
}) {
  if (!profile || profile.bins.length === 0 || profile.totalVolume <= 0) return null;

  const maxBinVol = profile.pocVolume > 0 ? profile.pocVolume : 1;
  const binsToRender = profile.bins.slice(-40);

  return (
    <div className="absolute right-16 sm:right-20 top-4 bottom-16 w-32 sm:w-40 pointer-events-none z-10 flex flex-col justify-between py-2.5 px-2 border border-amber-500/30 bg-zinc-950/80 backdrop-blur-md rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.85)]">
      <div className="flex items-center justify-between text-[9px] font-mono border-b border-zinc-800/80 pb-1.5 mb-1">
        <span className="text-amber-400 font-bold tracking-wider">FRVP {profile.shapeLabel.split(" ")[0]}</span>
        <span className="text-zinc-400 bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800">{profile.valueAreaPercentage}% VA</span>
      </div>
      <div className="flex-1 flex flex-col-reverse justify-around overflow-hidden gap-[1px]">
        {binsToRender.map((b) => {
          const widthPct = Math.min(100, (b.volume / maxBinVol) * 100);
          const isAtPoc = b.isPOC;
          const isInVA = b.price >= profile.val && b.price <= profile.vah;
          const isAtHvn = b.isHVN && !b.isPOC;
          const isAtLvn = b.isLVN;

          let barColor = isInVA ? "rgba(245, 158, 11, 0.4)" : "rgba(113, 113, 122, 0.25)";
          if (isAtPoc) barColor = "#f59e0b";
          else if (isAtHvn) barColor = "rgba(16, 185, 129, 0.55)";
          else if (isAtLvn) barColor = "rgba(6, 182, 212, 0.55)";

          return (
            <div key={b.price} className="flex items-center h-1.5 gap-1">
              <div
                className="h-full rounded-xs transition-all duration-300"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: barColor,
                  boxShadow: isAtPoc ? "0 0 8px rgba(245, 158, 11, 0.8)" : undefined,
                }}
              />
              {isAtPoc && (
                <span className="text-[8px] font-mono font-bold text-amber-300 shrink-0">
                  POC
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[8px] font-mono border-t border-zinc-800/80 pt-1.5 mt-1 text-zinc-400">
        <span className="text-zinc-400">VAL <strong className="text-zinc-200">{profile.val.toFixed(0)}</strong></span>
        <span className="text-amber-400">POC <strong className="text-amber-300">{profile.poc.toFixed(0)}</strong></span>
        <span className="text-zinc-400">VAH <strong className="text-zinc-200">{profile.vah.toFixed(0)}</strong></span>
      </div>
    </div>
  );
}

function generateFallbackClientSeed(
  basePrice: number,
  intervalMs: number,
  count = 40,
): ChartCandle[] {
  const candles: ChartCandle[] = [];
  const now = Math.floor(Date.now() / intervalMs) * intervalMs;
  let prev = basePrice;
  const isCommodity = basePrice < 5000;
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const wave =
      Math.sin(i * 0.4) * (isCommodity ? 0.001 : 0.0006) +
      Math.cos(i * 0.25) * (isCommodity ? 0.0006 : 0.0004);
    const open = Math.round(prev * 100) / 100;
    const close = Math.round((prev + basePrice * wave) * 100) / 100;
    const spread = Math.abs(open - close) || Math.max(0.01, basePrice * 0.0004);
    const high = Math.round((Math.max(open, close) + spread * 0.45) * 100) / 100;
    const low = Math.round((Math.min(open, close) - spread * 0.45) * 100) / 100;
    candles.push({
      x: time,
      y: [open, high, low, close],
      volume: isCommodity ? 150 + ((i % 7) * 25) : 1000,
    });
    prev = close;
  }
  return candles;
}
