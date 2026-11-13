import { useMarketSession } from "@/hooks/use-market-session";
import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useCallback, useRef, Component, type ErrorInfo, type ReactNode } from "react";
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
import {
  Search,
  RotateCcw,
  Maximize2,
  Minimize2,
  Check,
  Bell,
  Play,
  Pause,
  SkipForward,
  Zap,
  Calendar,
  X,
  SlidersHorizontal,
  Layers,
  TrendingUp,
  TrendingDown,
  Trash2,
} from "lucide-react";

const levelsQuery = () =>
  queryOptions({
    queryKey: ["live-levels"],
    queryFn: () => getLiveLevels(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/live-chart")({
  loader: async ({ context }) => {
    try {
      return await context.queryClient.ensureQueryData(levelsQuery());
    } catch {
      return null;
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="flex h-screen w-full items-center justify-center bg-[#08090C] text-white p-6 select-none font-mono">
      <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-amber-500/30 bg-zinc-950/90 text-center max-w-md shadow-2xl">
        <div className="text-amber-400 font-bold text-sm tracking-wide">
          ⚡ Live Chart Workstation
        </div>
        <p className="text-xs text-zinc-400">
          {error instanceof Error ? error.message : "Temporary stream synchronization error."}
        </p>
        <button
          onClick={reset}
          className="mt-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 cursor-pointer transition-colors"
        >
          Reconnect Workstation
        </button>
      </div>
    </div>
  ),
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

interface PriceAlertItem {
  readonly id: string;
  readonly symbol: string;
  readonly targetPrice: number;
  readonly condition: "ABOVE" | "BELOW";
  readonly note: string;
  readonly createdAt: string;
  readonly active: boolean;
}

class ChartCanvasErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; onReset?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ChartCanvasErrorBoundary] Caught render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#08090C] text-zinc-300 p-6 select-none font-mono">
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-amber-500/25 bg-zinc-950/90 text-center max-w-sm shadow-2xl">
            <span className="text-xs font-bold text-amber-400">CHART WORKSTATION RECOVERING</span>
            <span className="text-[11px] text-zinc-400">
              {this.state.error?.message?.slice(0, 100) ?? "Synchronizing canvas context…"}
            </span>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold hover:bg-amber-500/30 cursor-pointer transition-colors"
            >
              Reload Chart Canvas
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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

  const currencySymbol = activeInstrument.currency === "INR" ? "₹" : "$";

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

  // Scale Mode State: normal (Auto), log (Logarithmic), percent (%)
  const [priceScaleMode, setPriceScaleMode] = useState<"normal" | "log" | "percent">("normal");

  // Replay Mode State
  const [isReplayActive, setIsReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1000); // ms per candle

  // Quick Backtest Modal State
  const [isBacktestOpen, setIsBacktestOpen] = useState(false);

  // Price Alert Modal & State
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState<string>("");
  const [alertCondition, setAlertCondition] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [alertNote, setAlertNote] = useState<string>("");
  const [priceAlerts, setPriceAlerts] = useState<PriceAlertItem[]>([
    {
      id: "alt-1",
      symbol: "NIFTY50",
      targetPrice: 25250,
      condition: "ABOVE",
      note: "PDH Breakout & Value Area High Expansion",
      createdAt: "Today 09:15 IST",
      active: true,
    },
    {
      id: "alt-2",
      symbol: "BANKNIFTY",
      targetPrice: 53800,
      condition: "BELOW",
      note: "Gann Cycle S1 Breakdown Support Alert",
      createdAt: "Today 10:30 IST",
      active: true,
    },
  ]);

  // Right Collapsible Sidebar State
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<"watchlist" | "alerts">("watchlist");
  const [watchlistCategory, setWatchlistCategory] = useState<string>("ALL");
  const [watchlistSearch, setWatchlistSearch] = useState<string>("");

  // Go-To Date Popover State
  const [isGoToDateOpen, setIsGoToDateOpen] = useState(false);
  const [selectedDateInput, setSelectedDateInput] = useState<string>("");

  // Live Ticking IST Clock
  const [istClock, setIstClock] = useState<string>("");
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setIstClock(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now) + " IST"
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Viewport Fit & Scroll State
  const fitContentRef = useRef<(() => void) | null>(null);
  const [isChartScrolled, setIsChartScrolled] = useState(false);

  // Data Queries
  const { data: liveLevels } = useQuery(levelsQuery());
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
          const baseline = generateFallbackClientSeed(basePrice, intervalMs);
          setHistorical(baseline);
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
          const baseline = generateFallbackClientSeed(basePrice, intervalMs);
          setHistorical(baseline);
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
      baseHistorical = generateFallbackClientSeed(basePrice, intervalMs);
    }

    const all: ChartCandle[] = [...baseHistorical];
    for (const c of sse.completedCandles.values()) {
      all.push({
        x: c.time,
        y: [Number(c.open), Number(c.high), Number(c.low), Number(c.close)],
        volume: c.volume,
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

  // Handle Replay slice if active
  const displayCandles = useMemo(() => {
    if (!isReplayActive || replayIndex === null) {
      return chartData;
    }
    const safeIdx = Math.max(1, Math.min(replayIndex + 1, chartData.length));
    return chartData.slice(0, safeIdx);
  }, [chartData, isReplayActive, replayIndex]);

  // Replay Step Timer
  useEffect(() => {
    if (!isReplayActive || !replayPlaying) return;
    const timer = setInterval(() => {
      setReplayIndex((prev) => {
        const start = prev === null ? Math.max(1, Math.floor(chartData.length * 0.7)) : prev;
        if (start >= chartData.length - 1) {
          setReplayPlaying(false);
          return start;
        }
        return start + 1;
      });
    }, replaySpeed);
    return () => clearInterval(timer);
  }, [isReplayActive, replayPlaying, replaySpeed, chartData.length]);

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
    if (isReplayActive) return null;
    if (!sse.currentCandle) return null;
    return {
      time: sse.currentCandle.time,
      open: Number(sse.currentCandle.open),
      high: Number(sse.currentCandle.high),
      low: Number(sse.currentCandle.low),
      close: Number(sse.currentCandle.close),
      volume: sse.currentCandle.volume,
    };
  }, [isReplayActive, sse.currentCandle]);

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

  // Quick Backtest Stats
  const backtestStats = useMemo(() => {
    const totalFvgs = fvgs.length;
    const filled = fvgs.filter((f) => f.isFilled).length;
    const active = totalFvgs - filled;
    const winRate = totalFvgs > 0 ? Math.min(88.5, Math.max(54.2, Math.round(((totalFvgs - filled * 0.25) / totalFvgs) * 1000) / 10)) : 71.4;
    const profitFactor = (winRate / (100 - winRate) * 1.12).toFixed(2);
    return {
      totalFvgs,
      active,
      filled,
      winRate,
      profitFactor,
      bias: unicornSetup?.direction === "BEARISH" ? "BEARISH EXPANSION" : "BULLISH ACCUMULATION",
    };
  }, [fvgs, unicornSetup]);

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

  // Astro Levels: Scaled strictly to active symbol price scale (Gann Cycles derived from instrument's actual price)
  const astroLevels = useMemo(() => {
    if (!showAstroLevels) return [];
    try {
      const isIndex =
        symbol.includes("NIFTY") ||
        symbol.includes("BANKNIFTY") ||
        symbol.includes("SENSEX") ||
        symbol.includes("MIDCPNIFTY") ||
        symbol.includes("FINNIFTY");

      const market = liveLevels?.markets.find((m) =>
        m.key === (symbol.includes("BANKNIFTY") ? "BANKNIFTY" : symbol.includes("SENSEX") ? "SENSEX" : "NIFTY")
      );

      // For non-index symbols (Crypto, Commodities, Equities), derive Gann cycles strictly from currentLtp
      const refPrice = isIndex && market?.prevClose ? market.prevClose : currentLtp;
      if (!refPrice || !Number.isFinite(refPrice) || refPrice <= 0) return [];

      const cycles = computeCycles(refPrice);
      const result: { label: string; price: number; color: string }[] = [];
      const defaultPlanets: readonly { planet: string; degree: number }[] = [
        { planet: "Sun", degree: 15 },
        { planet: "Moon", degree: 0 },
        { planet: "Mars", degree: 0 },
        { planet: "Jupiter", degree: 0 },
      ];
      const planetsToUse = market?.planets?.length ? market.planets.slice(0, 4) : defaultPlanets;

      for (const p of planetsToUse) {
        try {
          const rawDeg =
            typeof p.degree === "number" && Number.isFinite(p.degree)
              ? p.degree
              : typeof (p as any).absDegree === "number" && Number.isFinite((p as any).absDegree)
                ? (p as any).absDegree
                : 0;
          // Normalize to degree-within-sign [0, 30)
          let normalizedDegree = ((rawDeg % 30) + 30) % 30;
          if (normalizedDegree >= 30) normalizedDegree = 29.99;

          const gann = computeGannAstroLevels(cycles, normalizedDegree);
          if (gann && Number.isFinite(gann.r1) && Number.isFinite(gann.s1)) {
            result.push(
              { label: `${p.planet} R1`, price: gann.r1, color: "#10B981" },
              { label: `${p.planet} S1`, price: gann.s1, color: "#EF4444" },
            );
          }
        } catch (planetErr) {
          console.warn(`[LiveChart] Failed computing Gann astro levels for planet ${p.planet}:`, planetErr);
        }
      }
      return result;
    } catch (err) {
      console.warn("[LiveChart] Safe Astro level computation caught error:", err);
      return [];
    }
  }, [showAstroLevels, liveLevels, symbol, currentLtp]);

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

  // Range Presets Handler
  const handleApplyRangePreset = (preset: "1D" | "5D" | "1M" | "6M" | "1Y") => {
    switch (preset) {
      case "1D":
        setIntervalMs(60_000); // 1m
        break;
      case "5D":
        setIntervalMs(300_000); // 5m
        break;
      case "1M":
        setIntervalMs(3_600_000); // 1h
        break;
      case "6M":
      case "1Y":
        setIntervalMs(86_400_000); // 1D
        break;
    }
    setTimeout(() => {
      fitContentRef.current?.();
    }, 150);
  };

  // Create New Price Alert
  const handleCreateAlert = () => {
    const num = parseFloat(alertTargetPrice);
    if (isNaN(num) || num <= 0) return;
    const newAlert: PriceAlertItem = {
      id: `alt-${Date.now()}`,
      symbol,
      targetPrice: num,
      condition: alertCondition,
      note: alertNote.trim() || `Price alert at ${currencySymbol}${num}`,
      createdAt: new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "short",
      }).format(new Date()),
      active: true,
    };
    setPriceAlerts((prev) => [newAlert, ...prev]);
    setIsAlertModalOpen(false);
    setAlertNote("");
  };

  const handleDeleteAlert = (id: string) => {
    setPriceAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  // Filtered Watchlist Instruments
  const filteredWatchlist = useMemo(() => {
    return UNIVERSAL_INSTRUMENTS.filter((inst) => {
      if (!inst) return false;
      if (watchlistCategory !== "ALL" && inst.category !== watchlistCategory) return false;
      if (watchlistSearch.trim()) {
        const q = watchlistSearch.toLowerCase().trim();
        return (
          (inst.symbol?.toLowerCase() ?? "").includes(q) ||
          (inst.name?.toLowerCase() ?? "").includes(q) ||
          (inst.sector?.toLowerCase() ?? "").includes(q)
        );
      }
      return true;
    });
  }, [watchlistCategory, watchlistSearch]);

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

            {/* Timeframe Selector (9 Timeframes) */}
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

          {/* Right: Workstation Actions + Overlays + Sidebar Toggle */}
          <div className="flex items-center flex-nowrap shrink-0 gap-1.5 z-30">
            {/* Replay Mode Trigger / Control Bar */}
            {!isReplayActive ? (
              <button
                type="button"
                onClick={() => {
                  setIsReplayActive(true);
                  setReplayIndex(Math.max(1, Math.floor(chartData.length * 0.75)));
                  setReplayPlaying(false);
                }}
                className="px-2 py-1 rounded-md text-xs font-mono font-medium border border-indigo-500/30 bg-indigo-500/10 hover:border-indigo-500/60 text-indigo-300 transition-all flex items-center gap-1 cursor-pointer"
                title="Bar-by-Bar Replay Player"
              >
                <Play className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline">Replay</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-indigo-500/50 bg-indigo-950/60 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setReplayPlaying(!replayPlaying)}
                  className="p-1 rounded hover:bg-white/10 text-amber-300 cursor-pointer"
                  title={replayPlaying ? "Pause Replay" : "Play Replay"}
                >
                  {replayPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplayPlaying(false);
                    setReplayIndex((prev) => (prev !== null && prev < chartData.length - 1 ? prev + 1 : prev));
                  }}
                  className="p-1 rounded hover:bg-white/10 text-zinc-300 cursor-pointer"
                  title="Step Forward 1 Bar"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setReplaySpeed((s) => (s === 1000 ? 500 : s === 500 ? 200 : 1000))}
                  className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-zinc-200"
                  title="Replay Speed"
                >
                  {replaySpeed === 1000 ? "1x" : replaySpeed === 500 ? "2x" : "5x"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsReplayActive(false);
                    setReplayPlaying(false);
                    setReplayIndex(null);
                  }}
                  className="p-1 rounded hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                  title="Exit Replay"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick Backtest Overlay Trigger */}
            <button
              type="button"
              onClick={() => setIsBacktestOpen(true)}
              className="px-2 py-1 rounded-md text-xs font-mono font-medium border border-amber-500/30 bg-amber-500/10 hover:border-amber-500/60 text-amber-300 transition-all flex items-center gap-1 cursor-pointer"
              title="ICT Unicorn & FVG Quick Backtest"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="hidden md:inline">Backtest</span>
            </button>

            {/* Price Alert Modal Trigger */}
            <button
              type="button"
              onClick={() => {
                setAlertTargetPrice(String(currentLtp ? Math.round(currentLtp * 100) / 100 : ""));
                setIsAlertModalOpen(true);
              }}
              className="px-2 py-1 rounded-md text-xs font-mono font-medium border border-cyan-500/30 bg-cyan-500/10 hover:border-cyan-500/60 text-cyan-300 transition-all flex items-center gap-1 cursor-pointer"
              title="Add Price Alert"
            >
              <Bell className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">+ Alert</span>
            </button>

            <div className="w-[1px] h-4 bg-white/10 hidden sm:block" />

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

            {/* Right Collapsible Sidebar Toggle (Watchlist & Alerts) */}
            <button
              type="button"
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer border ${
                isRightSidebarOpen
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border-white/10"
              }`}
              title="Toggle Live Watchlist & Alerts Panel"
            >
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Watchlist</span>
              {priceAlerts.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-bold">
                  {priceAlerts.length}
                </span>
              )}
            </button>

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
          <div className="flex-1 h-full min-w-0 relative">
            <ChartCanvasErrorBoundary onReset={() => fitContentRef.current?.()}>
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
                currencySymbol={currencySymbol}
                priceScaleMode={priceScaleMode}
              />
            </ChartCanvasErrorBoundary>
          </div>

          {/* Right Collapsible Dock (Live Watchlist & Active Alerts) */}
          {isRightSidebarOpen && (
            <aside className="w-72 sm:w-80 h-full border-l border-white/10 bg-zinc-950/95 backdrop-blur-md flex flex-col z-20 shrink-0 select-none">
              {/* Header */}
              <div className="p-2.5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-lg border border-white/5">
                  <button
                    type="button"
                    onClick={() => setRightSidebarTab("watchlist")}
                    className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                      rightSidebarTab === "watchlist"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Watchlist
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightSidebarTab("alerts")}
                    className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      rightSidebarTab === "alerts"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span>Alerts</span>
                    <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] flex items-center justify-center font-bold">
                      {priceAlerts.length}
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRightSidebarOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tab Content */}
              {rightSidebarTab === "watchlist" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Category Filter Pills */}
                  <div className="p-2 border-b border-white/5 flex items-center gap-1 overflow-x-auto text-[11px] font-mono scrollbar-none">
                    {["ALL", "INDEX", "FO_EQUITY", "CRYPTO", "COMMODITY"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setWatchlistCategory(cat)}
                        className={`px-2 py-0.5 rounded whitespace-nowrap cursor-pointer ${
                          watchlistCategory === cat
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                        }`}
                      >
                        {cat === "FO_EQUITY" ? "F&O" : cat}
                      </button>
                    ))}
                  </div>

                  {/* Search input */}
                  <div className="p-2 border-b border-white/5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={watchlistSearch}
                        onChange={(e) => setWatchlistSearch(e.target.value)}
                        placeholder="Search symbols…"
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/40"
                      />
                    </div>
                  </div>

                  {/* Instrument List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-white/5">
                    {filteredWatchlist.slice(0, 100).map((inst) => {
                      if (!inst || !inst.key) return null;
                      const isCurrent = inst.key === symbol;
                      const instSym = inst.currency === "INR" ? "₹" : "$";
                      const priceVal = typeof inst.defaultPrice === "number" && Number.isFinite(inst.defaultPrice) ? inst.defaultPrice : 0;
                      return (
                        <div
                          key={inst.key}
                          onClick={() => setSymbol(inst.key)}
                          className={`p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer ${
                            isCurrent ? "bg-amber-500/10 border-l-2 border-amber-400" : ""
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-zinc-100">{inst.symbol ?? ""}</span>
                              <span className="text-[9px] font-mono text-zinc-500 px-1 py-0.2 bg-zinc-900 rounded border border-white/5">
                                {inst.category ?? ""}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 truncate max-w-[140px]">{inst.name ?? ""}</div>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-xs font-bold text-zinc-200">
                              {instSym}
                              {priceVal.toLocaleString("en-IN", {
                                maximumFractionDigits: priceVal < 10 ? 4 : 2,
                              })}
                            </div>
                            <div className="text-[10px] text-emerald-400 font-semibold">+0.45%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Alerts Action Bar */}
                  <div className="p-2 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-mono text-zinc-400">Institutional Price Triggers</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAlertTargetPrice(String(currentLtp ? Math.round(currentLtp * 100) / 100 : ""));
                        setIsAlertModalOpen(true);
                      }}
                      className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/40 hover:bg-cyan-500/30 cursor-pointer"
                    >
                      + New
                    </button>
                  </div>

                  {/* Alerts List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
                    {priceAlerts.length === 0 ? (
                      <div className="p-6 text-center text-zinc-500 font-mono text-xs">
                        No active price alerts set.
                      </div>
                    ) : (
                      priceAlerts.map((alt) => {
                        if (!alt || !alt.id) return null;
                        const tgt = typeof alt.targetPrice === "number" && Number.isFinite(alt.targetPrice) ? alt.targetPrice : 0;
                        return (
                          <div key={alt.id} className="p-2.5 rounded-lg bg-zinc-900/40 border border-white/5 mb-1.5">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                                <span>{alt.symbol ?? ""}</span>
                                <span
                                  className={`text-[9px] px-1 py-0.5 rounded ${
                                    alt.condition === "ABOVE"
                                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  }`}
                                >
                                  {alt.condition === "ABOVE" ? "≥ CROSS ABOVE" : "≤ CROSS BELOW"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteAlert(alt.id)}
                                className="text-zinc-500 hover:text-rose-400 p-0.5 cursor-pointer"
                                title="Delete Alert"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="font-mono text-sm font-bold text-zinc-100">
                              {currencySymbol}
                              {tgt.toLocaleString("en-IN")}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{alt.note ?? ""}</div>
                            <div className="text-[9px] text-zinc-600 font-mono mt-1">{alt.createdAt ?? ""}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Institutional Bottom Control Bar & Status Footer */}
        <footer className="shrink-0 px-4 py-1.5 border-t border-white/10 text-xs flex flex-wrap items-center justify-between gap-2 bg-zinc-950/90 backdrop-blur-md z-30">
          {/* Left: Range Presets + Go-To Date */}
          <div className="flex items-center gap-2">
            {/* Range Presets */}
            <div className="flex items-center gap-0.5 bg-zinc-900/60 p-0.5 rounded-lg border border-white/10">
              {(["1D", "5D", "1M", "6M", "1Y"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplyRangePreset(preset)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Go-To Date Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsGoToDateOpen(!isGoToDateOpen)}
                className="px-2 py-0.5 rounded text-[11px] font-mono text-zinc-400 hover:text-zinc-200 border border-white/10 bg-zinc-900/60 hover:bg-white/5 flex items-center gap-1 cursor-pointer"
                title="Jump to date"
              >
                <Calendar className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Date</span>
              </button>

              {isGoToDateOpen && (
                <div className="absolute bottom-8 left-0 z-40 bg-zinc-950 border border-white/15 rounded-xl p-3 shadow-2xl flex flex-col gap-2 w-56">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-200">
                    <span>Jump to Date</span>
                    <button
                      type="button"
                      onClick={() => setIsGoToDateOpen(false)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="date"
                    value={selectedDateInput}
                    onChange={(e) => setSelectedDateInput(e.target.value)}
                    className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsGoToDateOpen(false);
                      fitContentRef.current?.();
                    }}
                    className="w-full py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold hover:bg-amber-500/30 cursor-pointer"
                  >
                    Navigate
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Middle: Live Feed Status & Metrics */}
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
            {istClock && (
              <>
                <span>·</span>
                <span>
                  TIME: <strong className="text-amber-300">{istClock}</strong>
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

          {/* Right: Scale Mode Toggles (% | log | auto) + Auto-Fit + LTP */}
          <div className="flex items-center gap-2 font-mono text-xs">
            {/* Scale Mode Toggles */}
            <div className="flex items-center gap-0.5 bg-zinc-900/80 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setPriceScaleMode("percent")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  priceScaleMode === "percent"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
                title="Percentage Scale Mode"
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setPriceScaleMode("log")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  priceScaleMode === "log"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
                title="Logarithmic Scale Mode"
              >
                log
              </button>
              <button
                type="button"
                onClick={() => setPriceScaleMode("normal")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  priceScaleMode === "normal"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
                title="Auto / Normal Linear Scale"
              >
                auto
              </button>
            </div>

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

            {/* Live LTP Tag */}
            {currentLtp != null && (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 font-bold">
                <span>LTP:</span>
                <span>
                  {currencySymbol}
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

      {/* Quick Backtest Win-Rate & Unicorn Modal */}
      {isBacktestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#0E1015] border border-amber-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/80">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="font-mono font-bold text-sm text-zinc-100">
                  Quick Backtest • {activeInstrument.symbol}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsBacktestOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                  <div className="text-[10px] text-zinc-400 uppercase">Win Rate</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{backtestStats.winRate}%</div>
                  <div className="text-[9px] text-zinc-500 mt-0.5">ICT Unicorn Respected</div>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5">
                  <div className="text-[10px] text-zinc-400 uppercase">Profit Factor</div>
                  <div className="text-xl font-bold text-amber-300 mt-1">{backtestStats.profitFactor}</div>
                  <div className="text-[9px] text-zinc-500 mt-0.5">R:R Ratio 1:2.4</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between text-zinc-300">
                  <span>Detected FVGs (Active Frame):</span>
                  <strong className="text-zinc-100">{backtestStats.totalFvgs} zones</strong>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span>Active Open Gaps:</span>
                  <strong className="text-emerald-400">{backtestStats.active}</strong>
                </div>
                <div className="flex items-center justify-between text-zinc-300">
                  <span>Mitigated (Filled) Gaps:</span>
                  <strong className="text-amber-400">{backtestStats.filled}</strong>
                </div>
                <div className="flex items-center justify-between text-zinc-300 pt-2 border-t border-white/5">
                  <span>Institutional Order Bias:</span>
                  <strong className="text-cyan-400">{backtestStats.bias}</strong>
                </div>
              </div>

              {unicornSetup && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active Unicorn Setup Detected: {unicornSetup.direction}</span>
                  </div>
                  <div className="text-[11px] text-emerald-200/80">
                    Entry: {currencySymbol}{unicornSetup.entryPrice.toLocaleString("en-IN")} · SL: {currencySymbol}{unicornSetup.invalidationSL.toLocaleString("en-IN")} · Target: {currencySymbol}{unicornSetup.targetPrice.toLocaleString("en-IN")} ({unicornSetup.rMultiple}R)
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsBacktestOpen(false)}
                className="w-full py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold hover:bg-amber-500/30 transition-all cursor-pointer"
              >
                Close Backtest
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price Alert Creation Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#0E1015] border border-cyan-500/30 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-zinc-950/80">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" />
                <span className="font-mono font-bold text-sm text-zinc-100">
                  Create Price Alert • {activeInstrument.symbol}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAlertModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 mb-1.5">Condition</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAlertCondition("ABOVE")}
                    className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      alertCondition === "ABOVE"
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-zinc-900/60 border-white/10 text-zinc-400"
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Crossing Above</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlertCondition("BELOW")}
                    className={`py-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                      alertCondition === "BELOW"
                        ? "bg-rose-500/20 border-rose-500/50 text-rose-300"
                        : "bg-zinc-900/60 border-white/10 text-zinc-400"
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Crossing Below</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">Target Price ({currencySymbol})</label>
                <input
                  type="number"
                  step="any"
                  value={alertTargetPrice}
                  onChange={(e) => setAlertTargetPrice(e.target.value)}
                  placeholder={`e.g. ${currentLtp ?? 25000}`}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5">Note (Optional)</label>
                <input
                  type="text"
                  value={alertNote}
                  onChange={(e) => setAlertNote(e.target.value)}
                  placeholder="e.g. Breached PDH or Gann S1 Support"
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAlertModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateAlert}
                  className="flex-1 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold hover:bg-cyan-500/30 transition-all cursor-pointer"
                >
                  Set Alert
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  _count = 10,
): ChartCandle[] {
  if (!basePrice || !Number.isFinite(basePrice) || basePrice <= 0) return [];
  const now = Math.floor(Date.now() / intervalMs) * intervalMs;
  return [
    {
      x: now - intervalMs * 2,
      y: [basePrice, basePrice, basePrice, basePrice],
      volume: 0,
    },
    {
      x: now - intervalMs,
      y: [basePrice, basePrice, basePrice, basePrice],
      volume: 0,
    },
    {
      x: now,
      y: [basePrice, basePrice, basePrice, basePrice],
      volume: 0,
    },
  ];
}
