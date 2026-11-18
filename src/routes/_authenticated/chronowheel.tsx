import { dateRangeError } from "@/lib/input-validation";
// Phase 36.4 — Dedicated Standalone Route: 🦅 EagleBABA ChronoWheel (Gann & Dynamic Lunar Cycle Scanner)
// Quantitative multi-year cyclical confluence screener across 200+ F&O stocks and major indices.
// Analyzes T-1 to T-10 historical matching Lunar Phase/Tithi windows, computing win rates, return profiles,
// volatility, max drawdown, and live F&O Implied Volatility context.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getChronoWheelScan,
  broadcastChronoWheelSetupToTelegram,
  type ChronoWheelScanFilter,
  type ChronoWheelScanResult,
  type StockCyclePerformance,
  type ConfluenceBias,
} from "@/lib/cycles/chronowheel.functions";
import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";
import { ChronoWheelGuideModal } from "@/components/cycles/ChronoWheelGuideModal";
import { ChronoWheelAIBot } from "@/components/cycles/ChronoWheelAIBot";
import {
  Orbit,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  Filter,
  SlidersHorizontal,
  Download,
  Calendar,
  Layers,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Compass,
  Zap,
  Moon,
  Sun,
  ShieldAlert,
  BookOpen,
  Bot,
  Target,
  Shield,
  Calculator,
  Percent,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/chronowheel")({
  head: () => ({
    meta: [
      { title: "ChronoWheel (Gann & Lunar Scanner) — Quantitative Screener | EagleBABA" },
      {
        name: "description",
        content:
          "Quantitative Gann & Dynamic Lunar Cycle Screener across 200+ F&O Stocks. Backtracks 10-year historical synodic lunar windows to identify high-probability cyclical turning points.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ChronoWheelPage,
  errorComponent: ({ error, reset }) => {
    if (isAuthErrorMessage(error)) {
      return (
        <GuestUnlockCard
          resourceName="ChronoWheel Quantitative Screener"
          description="ChronoWheel (Gann & Dynamic Lunar Cycle Scanner) requires an active session. Sign in or continue with guest full access."
          onRetry={reset}
        />
      );
    }
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="bg-[#12141a] border border-rose-500/30 rounded-xl p-8 max-w-lg text-center shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">ChronoWheel Engine Error</h2>
          <p className="text-sm text-zinc-400 mb-6 font-mono">
            {error instanceof Error ? error.message : "Unable to calculate multi-year lunar cycle performance."}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all"
          >
            Retry Scan
          </button>
        </div>
      </div>
    );
  },
});

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDefaultDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const future = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    startDate: formatDate(now),
    endDate: formatDate(future),
  };
}

function ChronoWheelPage() {
  const defaults = useMemo(() => getDefaultDates(), []);

  // Filter & Query States
  const [startDate, setStartDate] = useState<string>(defaults.startDate);
  const [endDate, setEndDate] = useState<string>(defaults.endDate);
  const [lookbackYears, setLookbackYears] = useState<3 | 5 | 10>(10);
  const [directionFilter, setDirectionFilter] = useState<
    "ALL" | "HIGH_BULLISH" | "HIGH_BEARISH" | "MODERATE_BULLISH" | "MODERATE_BEARISH"
  >("ALL");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hideBanStocks, setHideBanStocks] = useState<boolean>(false);
  const [hideNearBanStocks, setHideNearBanStocks] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"winRate" | "avgReturn" | "ivPercentile" | "beta">("winRate");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Expanded UI states
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [showHistoricalWindows, setShowHistoricalWindows] = useState<boolean>(false);

  // Beginner Guide & AI Assistant Modals
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [showAIBot, setShowAIBot] = useState<boolean>(false);
  const [aiStockContext, setAiStockContext] = useState<StockCyclePerformance | null>(null);

  // Interactive Position Sizing Calculator state
  const [calculatorCapital, setCalculatorCapital] = useState<number>(100000);
  const [calculatorRiskPct, setCalculatorRiskPct] = useState<number>(2.0);

  // Telegram & WhatsApp Signal Dispatch state
  const [sentTelegramMap, setSentTelegramMap] = useState<Record<string, boolean>>({});

  const rangeError = dateRangeError(startDate, endDate);

  // TanStack Query for ChronoWheel Scan
  const scanQueryPayload: ChronoWheelScanFilter = useMemo(
    () => ({
      startDate,
      endDate,
      lookbackYears,
      directionFilter,
      sectorFilter,
      searchQuery,
      hideBanStocks,
    }),
    [startDate, endDate, lookbackYears, directionFilter, sectorFilter, searchQuery, hideBanStocks],
  );

  const {
    data: scanResult,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "chronowheel-scan",
      startDate,
      endDate,
      lookbackYears,
      directionFilter,
      sectorFilter,
      searchQuery,
      hideBanStocks,
    ],
    enabled: !rangeError,
    queryFn: () => getChronoWheelScan({ data: scanQueryPayload }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  // Client-side sorting on received scan results
  const sortedStocks = useMemo(() => {
    if (rangeError) return [];
    if (!scanResult?.results) return [];
    let list = [...scanResult.results];
    if (hideBanStocks) {
      list = list.filter((s) => s.foBanStatus !== "IN_BAN");
    }
    if (hideNearBanStocks) {
      list = list.filter(
        (s) => s.foBanStatus !== "UPCOMING_BAN" && (s.mwplPercent == null || s.mwplPercent < 80),
      );
    }
    list.sort((a, b) => {
      let diff = 0;
      if (sortBy === "winRate") {
        diff = a.winRate - b.winRate;
      } else if (sortBy === "avgReturn") {
        diff = a.avgReturn - b.avgReturn;
      } else if (sortBy === "ivPercentile") {
        diff = a.ivPercentile - b.ivPercentile;
      } else if (sortBy === "beta") {
        diff = a.beta - b.beta;
      }
      return sortOrder === "desc" ? -diff : diff;
    });
    return list;
  }, [rangeError, scanResult?.results, sortBy, sortOrder, hideBanStocks, hideNearBanStocks]);

  const handleSendToTelegram = useCallback(
    async (stock: StockCyclePerformance) => {
      const plan = stock.executionPlan;
      const ltp = stock.currentPrice;
      const winRate = stock.winRate;
      const avgReturn = stock.avgReturn;
      const foBanStatus = stock.foBanStatus ?? "NORMAL (Traded)";
      const startD = scanResult?.referenceWindow?.startDate ?? startDate;
      const endD = scanResult?.referenceWindow?.endDate ?? endDate;
      const startPhase = scanResult?.referenceWindow?.startPhase?.phaseName ?? "";
      const endPhase = scanResult?.referenceWindow?.endPhase?.phaseName ?? "";

      try {
        await broadcastChronoWheelSetupToTelegram({
          data: {
            symbol: stock.symbol,
            direction: plan?.direction ?? "LONG",
            ltp,
            foBanStatus,
            startDate: startD,
            endDate: endD,
            startPhase,
            endPhase,
            winRate,
            avgReturn,
            entryLow: plan?.entryTriggerZone?.min ?? ltp * 0.995,
            entryHigh: plan?.entryTriggerZone?.max ?? ltp * 1.005,
            sl: plan?.stopLoss ?? ltp * 0.98,
            tp1: plan?.tp1 ?? ltp * 1.02,
            tp2: plan?.tp2 ?? ltp * 1.04,
            tp3: plan?.tp3 ?? ltp * 1.06,
            lotSize: plan?.lotSize ?? 500,
          },
        });
        setSentTelegramMap((prev) => ({ ...prev, [stock.symbol]: true }));
        setTimeout(() => {
          setSentTelegramMap((prev) => ({ ...prev, [stock.symbol]: false }));
        }, 4000);
      } catch {
        // ignore
      }
    },
    [scanResult, startDate, endDate],
  );

  const handleSendToWhatsApp = useCallback(
    (stock: StockCyclePerformance) => {
      const plan = stock.executionPlan;
      const ltp = stock.currentPrice;
      const winRate = stock.winRate;
      const avgReturn = stock.avgReturn;
      const foBanStatus = stock.foBanStatus ?? "NORMAL (Traded)";
      const startD = scanResult?.referenceWindow?.startDate ?? startDate;
      const endD = scanResult?.referenceWindow?.endDate ?? endDate;
      const startPhase = scanResult?.referenceWindow?.startPhase?.phaseName ?? "";
      const endPhase = scanResult?.referenceWindow?.endPhase?.phaseName ?? "";
      const phaseStr = startPhase ? ` (${startPhase} to ${endPhase || "Target"})` : "";

      const entryMin = (plan?.entryTriggerZone?.min ?? ltp * 0.995).toFixed(2);
      const entryMax = (plan?.entryTriggerZone?.max ?? ltp * 1.005).toFixed(2);
      const slVal = (plan?.stopLoss ?? ltp * 0.98).toFixed(2);
      const tp1Val = (plan?.tp1 ?? ltp * 1.02).toFixed(2);
      const tp2Val = (plan?.tp2 ?? ltp * 1.04).toFixed(2);
      const tp3Val = (plan?.tp3 ?? ltp * 1.06).toFixed(2);
      const lotVal = plan?.lotSize ?? 500;

      const text = [
        `🦅 *EAGLEBABA CHRONOWHEEL SIGNAL*`,
        `• *Symbol:* ${stock.symbol} (${plan?.direction ?? "LONG"}) | LTP: ₹${ltp.toFixed(2)}`,
        `• *Ban/MWPL Status:* ${foBanStatus}`,
        `• *Synodic Window:* ${startD} -> ${endD}${phaseStr}`,
        `• *10-Yr Historical Consistency:* ${winRate}% (Avg Return: ${avgReturn}%)`,
        `• *Entry Zone:* ₹${entryMin} – ₹${entryMax}`,
        `• *Hard SL:* ₹${slVal} | TP1: ₹${tp1Val} | TP2: ₹${tp2Val} | TP3: ₹${tp3Val} (Lot: ${lotVal})`,
      ].join("\n");

      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(text);
        }
      } catch {
        // ignore
      }
      if (typeof window !== "undefined") {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
      }
    },
    [scanResult, startDate, endDate],
  );

  // Quick Preset Handlers
  const handleSetPreset = useCallback((daysAhead: number) => {
    const start = new Date();
    const end = new Date(start.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  }, []);

  // CSV Export Handler
  const handleExportCSV = useCallback(() => {
    if (!sortedStocks.length || !scanResult) return;

    const headers = [
      "Symbol",
      "Company Name",
      "Sector",
      "Category",
      "Market Cap",
      "Beta",
      "Confluence Bias",
      "Win Rate (%)",
      "Positive Years",
      "Total Years",
      "Avg Return (%)",
      "Median Return (%)",
      "Min Return (%)",
      "Max Return (%)",
      "Realized Volatility (%)",
      "Max Drawdown (%)",
      "ATM IV (%)",
      "IV Percentile (%)",
    ];

    const rows = sortedStocks.map((s) => [
      s.symbol,
      `"${s.name.replace(/"/g, '""')}"`,
      s.sector,
      s.category,
      s.marketCap,
      s.beta,
      s.confluenceBias,
      s.winRate,
      s.positiveWindows,
      s.totalWindows,
      s.avgReturn,
      s.medianReturn,
      s.minReturn,
      s.maxReturn,
      s.volatility,
      s.maxDrawdown,
      s.liveIv,
      s.ivPercentile,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `EagleBABA_ChronoWheel_${scanResult.referenceWindow.startDate}_to_${scanResult.referenceWindow.endDate}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [sortedStocks, scanResult]);

  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100 p-3 sm:p-6 pb-24 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* 1. TOP HEADER RIBBON */}
      <div className="max-w-[1720px] mx-auto mb-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-start gap-3.5">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 via-zinc-900 to-zinc-950 border border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.15)] flex-shrink-0">
              <Orbit className="w-7 h-7 text-amber-400 animate-[spin_30s_linear_infinite]" />
              <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1 -right-1" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 bg-clip-text text-transparent">
                  EagleBABA ChronoWheel
                </h1>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 tracking-wider">
                  GANN & LUNAR CYCLE SCANNER
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  DYNAMIC SYNODIC HARMONICS
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-3xl">
                Quantitative multi-year cyclical screener across 200+ F&O stocks. Projects exact Moon-Sun longitudinal separation angles across T-1 to T-10 historical windows to spot high-confluence turning points.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-semibold text-amber-300 transition-all shadow-sm shadow-amber-500/10"
              title="Open Beginner Trading Guide & Checklist"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>How to Trade Cycles</span>
            </button>

            <button
              onClick={() => {
                setAiStockContext(null);
                setShowAIBot(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 border border-purple-500/40 text-xs font-semibold text-purple-300 transition-all"
              title="Open AI Trade Assistant"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Ask AI Assistant</span>
            </button>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-50"
              title="Refresh Scan Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={!sortedStocks.length}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 text-xs font-medium text-zinc-300 transition-colors disabled:opacity-40"
              title="Export Screened Stocks to CSV"
            >
              <Download className="w-3.5 h-3.5 text-zinc-400" />
              <span>Export CSV</span>
            </button>

            <Link
              to="/live-chart"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-semibold text-xs tracking-wide shadow-md shadow-amber-500/10 transition-all"
            >
              <span>Live Chart</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 2. ASTRONOMICAL EPHEMERIS & LUNAR REFERENCE RIBBON */}
        {scanResult && (
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-[#11131a] via-[#141724] to-[#11131a] border border-amber-500/20 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Target Window (Gregorian)</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {scanResult.referenceWindow.startDate} ➔ {scanResult.referenceWindow.endDate}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Duration: <span className="text-amber-300 font-semibold">{scanResult.referenceWindow.durationDays} Days</span> · Lookback: <span className="text-amber-300 font-semibold">{scanResult.lookbackYears} Years</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Moon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Start Synodic Phase</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {scanResult.referenceWindow.startPhase.tithiName}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Phase Angle: <span className="text-white font-semibold">{scanResult.referenceWindow.startPhase.phaseAngle}°</span> · Illum: <span className="text-white font-semibold">{scanResult.referenceWindow.startPhase.illumination}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider">End Synodic Phase</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {scanResult.referenceWindow.endPhase.tithiName}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Phase Angle: <span className="text-white font-semibold">{scanResult.referenceWindow.endPhase.phaseAngle}°</span> · Western: <span className="text-white font-semibold">{scanResult.referenceWindow.endPhase.phaseName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider">Historical Windows</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {scanResult.historicalWindows.length} Projections (T-1 to T-{scanResult.lookbackYears})
                  </div>
                  <button
                    onClick={() => setShowHistoricalWindows((prev) => !prev)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 mt-0.5"
                  >
                    <span>{showHistoricalWindows ? "Hide Backtracked Dates" : "Inspect Historical Dates"}</span>
                    {showHistoricalWindows ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Historical Windows Breakdown Panel */}
            {showHistoricalWindows && (
              <div className="mt-4 pt-3 border-t border-zinc-800/80">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Exact Historical Gregorian Windows for Equivalent Lunar Phase</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs font-mono">
                  {scanResult.historicalWindows.map((hw) => (
                    <div
                      key={hw.year}
                      className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300">{hw.relativeYear} ({hw.year})</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {hw.tradingSessions} Sessions
                        </span>
                      </div>
                      <div className="text-[11px] text-white">
                        {hw.startDate} ➔ {hw.endDate}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {hw.tithiStart} ({hw.phaseAngleStart.toFixed(1)}°)
                      </div>
                      {hw.weekendAdjusted && (
                        <div className="text-[9px] text-amber-400/90 italic">
                          Weekend Adjusted Session
                        </div>
                      )}
                      {hw.isAdhikMaas && (
                        <div className="text-[9px] text-purple-400/90 italic">
                          Adhik Maas Shift
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. QUANTITATIVE SUMMARY STATS CARDS */}
        {scanResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4">
            <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#12141c] to-[#0c0d12] border border-zinc-800">
              <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider">Universe Scanned</div>
              <div className="text-2xl font-black font-mono text-white mt-1">
                {scanResult.totalScanned} <span className="text-xs font-normal text-zinc-500">Equities / ETFs</span>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono mt-1">
                Active F&O Universe
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#0c1813] to-[#080d0a] border border-emerald-500/30">
              <div className="text-[11px] text-emerald-400/90 font-mono uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bullish Confluence</span>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                {scanResult.bullishCount}
              </div>
              <div className="text-[11px] text-emerald-500/80 font-mono mt-1">
                Win Rate ≥ 60% with Positive Avg Return
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#1c0e12] to-[#0d0709] border border-rose-500/30">
              <div className="text-[11px] text-rose-400/90 font-mono uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                <span>Bearish Confluence</span>
              </div>
              <div className="text-2xl font-black font-mono text-rose-400 mt-1">
                {scanResult.bearishCount}
              </div>
              <div className="text-[11px] text-rose-500/80 font-mono mt-1">
                Win Rate ≤ 40% with Negative Avg Return
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#12141c] to-[#0c0d12] border border-zinc-800">
              <div className="text-[11px] text-zinc-400 font-mono uppercase tracking-wider">Neutral / Mixed</div>
              <div className="text-2xl font-black font-mono text-zinc-300 mt-1">
                {scanResult.neutralCount}
              </div>
              <div className="text-[11px] text-zinc-400 font-mono mt-1">
                40% to 60% Historical Ambiguity
              </div>
            </div>
          </div>
        )}

        {/* 4. CONTROL TOOLBAR & FILTER DECK */}
        <div className="mt-4 p-4 rounded-xl bg-[#111218]/90 border border-zinc-800/90 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Date Pickers & Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono">
                <span className="text-zinc-400">Start:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-white font-mono outline-none cursor-pointer [color-scheme:dark]"
                />
                  {rangeError && <p role="alert" className="text-xs text-rose-400">{rangeError}</p>}
              </div>

              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono">
                <span className="text-zinc-400">End:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-white font-mono outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1 text-[11px] font-mono">
                <button
                  onClick={() => handleSetPreset(3)}
                  className="px-2 py-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  +3 Days
                </button>
                <button
                  onClick={() => handleSetPreset(7)}
                  className="px-2 py-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  +7 Days
                </button>
                <button
                  onClick={() => handleSetPreset(14)}
                  className="px-2 py-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Full Paksha (14d)
                </button>
              </div>
            </div>

            {/* Lookback Depth Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Lookback Depth:</span>
              <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-700/80">
                {[3, 5, 10].map((yrs) => (
                  <button
                    key={yrs}
                    onClick={() => setLookbackYears(yrs as 3 | 5 | 10)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                      lookbackYears === yrs
                        ? "bg-amber-500 text-black font-bold shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {yrs} Years
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-zinc-800/60">
            {/* Direction Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-zinc-400 font-mono mr-1">Bias:</span>
              <button
                onClick={() => setDirectionFilter("ALL")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                  directionFilter === "ALL"
                    ? "bg-zinc-200 text-black font-semibold"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                All ({scanResult?.totalScanned ?? 0})
              </button>

              <button
                onClick={() => setDirectionFilter("HIGH_BULLISH")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                  directionFilter === "HIGH_BULLISH"
                    ? "bg-emerald-500 text-black font-bold shadow-sm shadow-emerald-500/20"
                    : "bg-zinc-900 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30"
                }`}
              >
                ▲ High Bullish (&gt;80%)
              </button>

              <button
                onClick={() => setDirectionFilter("HIGH_BEARISH")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                  directionFilter === "HIGH_BEARISH"
                    ? "bg-rose-500 text-white font-bold shadow-sm shadow-rose-500/20"
                    : "bg-zinc-900 text-rose-400 hover:bg-rose-500/10 border border-rose-500/30"
                }`}
              >
                ▼ High Bearish (&gt;80%)
              </button>

              <button
                onClick={() => setDirectionFilter("MODERATE_BULLISH")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                  directionFilter === "MODERATE_BULLISH"
                    ? "bg-lime-500 text-black font-semibold"
                    : "bg-zinc-900 text-lime-400 hover:bg-lime-500/10 border border-lime-500/25"
                }`}
              >
                Moderate Bullish (≥60%)
              </button>

              <button
                onClick={() => setDirectionFilter("MODERATE_BEARISH")}
                className={`px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                  directionFilter === "MODERATE_BEARISH"
                    ? "bg-orange-500 text-black font-semibold"
                    : "bg-zinc-900 text-orange-400 hover:bg-orange-500/10 border border-orange-500/25"
                }`}
              >
                Moderate Bearish (≤40%)
              </button>
            </div>

            {/* Search Input & Sector Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sector Dropdown */}
              <div className="relative">
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 outline-none cursor-pointer focus:border-amber-500/60 transition-colors"
                >
                  <option value="ALL">All Sectors ({scanResult?.availableSectors?.length ?? 12})</option>
                  {scanResult?.availableSectors?.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search input */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search symbol / company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-zinc-500 font-mono outline-none focus:border-amber-500/60 w-44 sm:w-56 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort By Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-200 outline-none cursor-pointer focus:border-amber-500/60 transition-colors"
                >
                  <option value="winRate">Sort: Win Rate %</option>
                  <option value="avgReturn">Sort: Avg Return %</option>
                  <option value="ivPercentile">Sort: IV Percentile</option>
                  <option value="beta">Sort: Beta</option>
                </select>
              </div>

              <button
                onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                className="px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs font-mono text-zinc-300 hover:text-white"
                title={`Toggle sort order (${sortOrder.toUpperCase()})`}
              >
                {sortOrder === "desc" ? "↓ DESC" : "↑ ASC"}
              </button>

              {/* Quick Filter: Hide F&O Ban Stocks */}
              <button
                type="button"
                onClick={() => setHideBanStocks((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  hideBanStocks
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-[0_0_10px_rgba(244,63,94,0.25)]"
                    : "bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white hover:border-zinc-600"
                }`}
                title="Hide stocks currently in official NSE F&O Ban (>= 95% MWPL)"
              >
                <span>🚫</span>
                <span>{hideBanStocks ? "Ban Hidden" : "Hide Ban"}</span>
              </button>

              {/* Quick Filter: Hide F&O Near Ban Stocks */}
              <button
                type="button"
                onClick={() => setHideNearBanStocks((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  hideNearBanStocks
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                    : "bg-zinc-900 border-zinc-700/80 text-zinc-300 hover:text-white hover:border-zinc-600"
                }`}
                title="Hide stocks near NSE F&O Ban (>= 80% MWPL or NEAR_BAN status)"
              >
                <span>⚠️</span>
                <span>{hideNearBanStocks ? "Near-Ban Hidden" : "Hide Near Ban"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. SCREENER RESULTS TABLE & HIGH-DENSITY INSTITUTIONAL CARDS */}
      <div className="max-w-[1720px] mx-auto">
        {isLoading ? (
          <div className="min-h-[400px] flex flex-col items-center justify-center p-8 bg-[#111218]/60 border border-zinc-800/80 rounded-xl">
            <Orbit className="w-10 h-10 text-amber-400 animate-spin mb-3" />
            <h3 className="text-base font-bold text-white uppercase tracking-wider">
              Computing ChronoWheel Lunar Ephemeris
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-1">
              Backtracking Moon-Sun longitudinal separation angles across {lookbackYears} historical years for 210 F&O instruments...
            </p>
          </div>
        ) : sortedStocks.length === 0 ? (
          <div className="min-h-[300px] flex flex-col items-center justify-center p-8 bg-[#111218]/60 border border-zinc-800/80 rounded-xl text-center">
            <Filter className="w-10 h-10 text-zinc-500 mb-3" />
            <h3 className="text-base font-bold text-zinc-300">No Instruments Match Current Filters</h3>
            <p className="text-xs text-zinc-500 font-mono mt-1 max-w-md">
              Try switching direction bias to "All", clearing the search query, or selecting a broader sector.
            </p>
            <button
              onClick={() => {
                setDirectionFilter("ALL");
                setSectorFilter("ALL");
                setSearchQuery(""); setHideNearBanStocks(false);
              }}
              className="mt-4 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-white transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 font-mono px-1">
              <span>Showing {sortedStocks.length} instruments matching criteria</span>
              <span>Click on any card to view year-by-year historical returns</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {sortedStocks.map((stock) => {
                const isExpanded = expandedStock === stock.symbol;
                const isHighBullish = stock.confluenceBias === "HIGH_BULLISH";
                const isHighBearish = stock.confluenceBias === "HIGH_BEARISH";
                const isModBullish = stock.confluenceBias === "MODERATE_BULLISH";
                const isModBearish = stock.confluenceBias === "MODERATE_BEARISH";

                return (
                  <div
                    key={stock.symbol}
                    className={`rounded-xl border transition-all ${
                      isHighBullish
                        ? "bg-gradient-to-r from-[#0c1813]/90 via-[#101918]/90 to-[#0e1217]/90 border-emerald-500/35 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.06)]"
                        : isHighBearish
                        ? "bg-gradient-to-r from-[#1c0d12]/90 via-[#181116]/90 to-[#0e1217]/90 border-rose-500/35 hover:border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.06)]"
                        : isModBullish
                        ? "bg-[#11141a]/95 border-lime-500/25 hover:border-lime-500/40"
                        : isModBearish
                        ? "bg-[#141118]/95 border-orange-500/25 hover:border-orange-500/40"
                        : "bg-[#111218]/90 border-zinc-800/80 hover:border-zinc-700"
                    }`}
                  >
                    {/* Main Card Header & Summary Bar */}
                    <div
                      onClick={() => setExpandedStock(isExpanded ? null : stock.symbol)}
                      className="p-3 sm:p-4 cursor-pointer select-none"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* 1. Symbol, Name, Sector & Beta */}
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base sm:text-lg font-black font-mono tracking-tight text-white hover:text-amber-400 transition-colors">
                                {stock.symbol}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                                {stock.category}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/60 text-zinc-400">
                                {stock.marketCap}
                              </span>

                              {/* Explicit High-Visibility Live LTP Badge */}
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-950/50 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>LTP: ₹{stock.currentPrice.toFixed(2)}</span>
                                <span className="text-[10px] text-emerald-400 font-semibold">• LIVE</span>
                              </div>

                              {/* Live F&O Ban / MWPL Status Badge */}
                              {stock.foBanStatus === "IN_BAN" && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-500/60 text-rose-300 font-mono text-[11px] font-bold shadow-xs animate-pulse">
                                  <span>🚫 F&O BAN ({stock.mwplPercent ? `${stock.mwplPercent.toFixed(1)}% MWPL` : "IN BAN"})</span>
                                </span>
                              )}
                              {stock.foBanStatus === "UPCOMING_BAN" && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-500/60 text-amber-300 font-mono text-[11px] font-bold shadow-xs">
                                  <span>⚠️ NEAR BAN ({stock.mwplPercent ? `${stock.mwplPercent.toFixed(1)}% MWPL` : ">80% MWPL"})</span>
                                </span>
                              )}
                              {stock.foBanStatus === "RECENTLY_UNBANNED" && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 font-mono text-[11px] font-bold shadow-xs">
                                  <span>✅ UNBANNED TODAY</span>
                                </span>
                              )}

                              {stock.dayChangePct !== undefined && (
                                <span
                                  className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    stock.dayChangePct >= 0
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                      : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                  }`}
                                >
                                  {stock.dayChangePct >= 0 ? "+" : ""}
                                  {stock.dayChangePct.toFixed(2)}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                              <span className="truncate max-w-[200px] sm:max-w-none">{stock.name}</span>
                              <span>•</span>
                              <span className="text-amber-400/90 font-mono">{stock.sector}</span>
                              <span>•</span>
                              <span className="font-mono text-zinc-400">β: {stock.beta.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Confluence Bias & Win Rate Badge */}
                        <div className="flex items-center gap-4 flex-wrap lg:flex-nowrap">
                          {/* Bias Badge */}
                          <div className="flex items-center gap-1.5">
                            {isHighBullish ? (
                              <span className="flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                HIGH BULLISH ({stock.winRate.toFixed(0)}%)
                              </span>
                            ) : isHighBearish ? (
                              <span className="flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20">
                                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                                HIGH BEARISH ({stock.winRate.toFixed(0)}%)
                              </span>
                            ) : isModBullish ? (
                              <span className="flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-lime-500/15 text-lime-300 border border-lime-500/30">
                                <TrendingUp className="w-3 h-3 text-lime-400" />
                                MODERATE BULLISH ({stock.winRate.toFixed(0)}%)
                              </span>
                            ) : isModBearish ? (
                              <span className="flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-orange-500/15 text-orange-300 border border-orange-500/30">
                                <TrendingDown className="w-3 h-3 text-orange-400" />
                                MODERATE BEARISH ({stock.winRate.toFixed(0)}%)
                              </span>
                            ) : (
                              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                                NEUTRAL ({stock.winRate.toFixed(0)}%)
                              </span>
                            )}
                          </div>

                          {/* Segmented Win Rate Bar (Visual years T-1 to T-N) */}
                          <div className="flex flex-col min-w-[140px]">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="text-zinc-400">Consistency:</span>
                              <span
                                className={`font-bold ${
                                  stock.winRate >= 70
                                    ? "text-emerald-400"
                                    : stock.winRate <= 30
                                    ? "text-rose-400"
                                    : "text-zinc-300"
                                }`}
                              >
                                {stock.positiveWindows}/{stock.totalWindows} Yrs ({stock.winRate}%)
                              </span>
                            </div>
                            <div className="flex items-center gap-1 h-2 rounded bg-zinc-950 p-0.5 border border-zinc-800">
                              {stock.yearlyBreakdown.map((yb) => (
                                <div
                                  key={yb.year}
                                  title={`${yb.relativeYear} (${yb.year}): ${yb.returnPct > 0 ? "+" : ""}${yb.returnPct}%`}
                                  className={`flex-1 h-full rounded-xs ${
                                    yb.isPositive
                                      ? "bg-emerald-400"
                                      : "bg-rose-500"
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* 3. Return Profile Horizontal Range (Min | Avg | Max) */}
                          <div className="flex flex-col min-w-[190px]">
                            <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                              <span className="text-rose-400">{stock.minReturn > 0 ? "+" : ""}{stock.minReturn.toFixed(1)}%</span>
                              <span
                                className={`font-bold ${
                                  stock.avgReturn > 0 ? "text-emerald-400" : stock.avgReturn < 0 ? "text-rose-400" : "text-zinc-400"
                                }`}
                              >
                                Avg: {stock.avgReturn > 0 ? "+" : ""}{stock.avgReturn.toFixed(2)}%
                              </span>
                              <span className="text-emerald-400">+{stock.maxReturn.toFixed(1)}%</span>
                            </div>
                            {/* Horizontal visual range bar with 0% mark */}
                            <div className="relative w-full h-2 bg-zinc-950 rounded border border-zinc-800 overflow-hidden flex items-center">
                              {/* 0% Center Axis */}
                              <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-zinc-600 z-10" />

                              {/* Return Range Fill */}
                              {stock.avgReturn >= 0 ? (
                                <div
                                  className="h-full bg-emerald-500/80 rounded-r-xs absolute"
                                  style={{
                                    left: "50%",
                                    width: `${Math.min(50, (stock.avgReturn / 12) * 50)}%`,
                                  }}
                                />
                              ) : (
                                <div
                                  className="h-full bg-rose-500/80 rounded-l-xs absolute"
                                  style={{
                                    right: "50%",
                                    width: `${Math.min(50, (Math.abs(stock.avgReturn) / 12) * 50)}%`,
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* 4. Live Implied Volatility & Percentile Context */}
                          <div className="flex flex-col text-right font-mono min-w-[95px]">
                            <div className="text-xs text-white font-bold">
                              IV: {stock.liveIv.toFixed(1)}%
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              IVP:{" "}
                              <span
                                className={`font-semibold ${
                                  stock.ivPercentile > 70
                                    ? "text-amber-400"
                                    : stock.ivPercentile < 30
                                    ? "text-emerald-400"
                                    : "text-zinc-300"
                                }`}
                              >
                                {stock.ivPercentile}%
                              </span>
                            </div>
                          </div>

                          {/* 5. 1-Click Navigation Actions */}
                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setAiStockContext(stock);
                                setShowAIBot(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/30 hover:to-indigo-500/30 border border-purple-500/40 text-xs font-mono text-purple-300 hover:text-purple-200 transition-colors flex items-center gap-1 shadow-xs"
                              title="Ask AI Assistant to analyze this stock"
                            >
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span>AI</span>
                            </button>

                            <Link
                              to="/live-chart"
                              search={{ symbol: stock.symbol }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 text-xs font-mono text-amber-300 hover:text-amber-200 transition-colors flex items-center gap-1"
                              title="Open Live Chart for this Stock"
                            >
                              <span>Chart</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>

                            <Link
                              to="/unicorn-radar"
                              search={{ search: stock.symbol }}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/70 text-xs font-mono text-zinc-300 hover:text-white transition-colors"
                              title="Inspect ICT Unicorn & SMT Signals"
                            >
                              Unicorn
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleSendToTelegram(stock)}
                              className={`px-2 py-1 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1 cursor-pointer ${
                                sentTelegramMap[stock.symbol]
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : "bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border-sky-500/30"
                              }`}
                              title="Send Signal to Telegram (@EagleBABAAIBOT)"
                            >
                              <span>✈️</span>
                              <span className="hidden sm:inline">
                                {sentTelegramMap[stock.symbol] ? "Sent!" : "Telegram"}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSendToWhatsApp(stock)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Share Signal to WhatsApp Channel"
                            >
                              <span>💬</span>
                              <span className="hidden sm:inline">WhatsApp</span>
                            </button>

                            <button
                              onClick={() => setExpandedStock(isExpanded ? null : stock.symbol)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                              title="Expand/Collapse Yearly Breakdown & Position Calculator"
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Algorithmic Execution Sub-Bar (Entry, SL, TP1, TP2, TP3, R:R) */}
                    {stock.executionPlan && (
                      <div className="px-3 sm:px-4 py-2 border-t border-zinc-800/70 bg-zinc-950/50 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                          {/* Current Market Price (LTP) Anchor */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-400 uppercase font-semibold">Current LTP:</span>
                            <span className="text-cyan-300 font-bold bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-500/35">
                              ₹{stock.currentPrice.toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-500 uppercase">Direction:</span>
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                stock.executionPlan.direction === "LONG"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/35"
                                  : "bg-rose-500/20 text-rose-400 border border-rose-500/35"
                              }`}
                            >
                              {stock.executionPlan.direction}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-500 uppercase">Entry Zone:</span>
                            <span className="text-white font-bold">
                              ₹{stock.executionPlan.entryTriggerZone.min.toFixed(2)} - ₹{stock.executionPlan.entryTriggerZone.max.toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-rose-400/80 uppercase">Hard SL:</span>
                            <span className="text-rose-400 font-bold">
                              ₹{stock.executionPlan.stopLoss.toFixed(2)} (-{stock.executionPlan.stopLossPct}%)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-emerald-400/80 uppercase">TP1 (+1.5R):</span>
                            <span className="text-emerald-300 font-semibold">
                              ₹{stock.executionPlan.tp1.toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-emerald-400 uppercase font-bold">TP2 (+2.5R):</span>
                            <span className="text-emerald-400 font-bold">
                              ₹{stock.executionPlan.tp2.toFixed(2)} (+{stock.executionPlan.tp2Pct}%)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-500 uppercase">TP3 (+4.0R):</span>
                            <span className="text-zinc-300">
                              ₹{stock.executionPlan.tp3.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-purple-400 uppercase font-bold">R:R:</span>
                          <span className="px-2 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold text-[11px]">
                            {stock.executionPlan.riskRewardRatio}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            Lot: {stock.executionPlan.lotSize}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Expandable Year-by-Year Historical Breakdown & Position Sizing Engine */}
                    {isExpanded && (
                      <div className="px-4 pb-5 pt-3 border-t border-zinc-800/80 bg-black/45 space-y-4">
                        {/* 1. 10-Year Trade Hit-Rate Backtest Summary Ribbon */}
                        {stock.hitRateSummary && (
                          <div className="p-3 rounded-xl bg-[#0d0f16] border border-amber-500/25 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="text-xs font-mono text-amber-300 font-bold flex items-center gap-1.5">
                                <Target className="w-3.5 h-3.5 text-amber-400" />
                                <span>{lookbackYears}-Year Trade Hit-Rate Backtest Validation ({stock.symbol})</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs font-mono">
                                <span className="text-zinc-400">Profit Factor:</span>
                                <span className="font-bold text-emerald-400">{stock.hitRateSummary.profitFactor}</span>
                                <span className="text-zinc-600">•</span>
                                <span className="text-zinc-400">Expectancy:</span>
                                <span className="font-bold text-amber-300">
                                  {stock.hitRateSummary.expectancyRatio > 0 ? "+" : ""}
                                  {stock.hitRateSummary.expectancyRatio}R
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                              <div className="p-2 rounded-lg bg-zinc-950/80 border border-emerald-500/30">
                                <div className="text-[10px] text-emerald-400 uppercase">TP1 (+1.5R) Hit Rate</div>
                                <div className="text-sm font-bold text-white mt-0.5">
                                  {stock.hitRateSummary.tp1Hits}/{stock.totalWindows}{" "}
                                  <span className="text-emerald-400">({stock.hitRateSummary.tp1HitRate}%)</span>
                                </div>
                              </div>

                              <div className="p-2 rounded-lg bg-zinc-950/80 border border-emerald-500/40 shadow-xs">
                                <div className="text-[10px] text-emerald-300 uppercase font-bold">TP2 (+2.5R) Hit Rate</div>
                                <div className="text-sm font-bold text-white mt-0.5">
                                  {stock.hitRateSummary.tp2Hits}/{stock.totalWindows}{" "}
                                  <span className="text-emerald-300">({stock.hitRateSummary.tp2HitRate}%)</span>
                                </div>
                              </div>

                              <div className="p-2 rounded-lg bg-zinc-950/80 border border-purple-500/30">
                                <div className="text-[10px] text-purple-400 uppercase">TP3 (+4.0R) Runners</div>
                                <div className="text-sm font-bold text-white mt-0.5">
                                  {stock.hitRateSummary.tp3Hits}/{stock.totalWindows}{" "}
                                  <span className="text-purple-300">({stock.hitRateSummary.tp3HitRate}%)</span>
                                </div>
                              </div>

                              <div className="p-2 rounded-lg bg-zinc-950/80 border border-rose-500/30">
                                <div className="text-[10px] text-rose-400 uppercase">Historical SL Rate</div>
                                <div className="text-sm font-bold text-white mt-0.5">
                                  {stock.hitRateSummary.slHits}/{stock.totalWindows}{" "}
                                  <span className="text-rose-400">({stock.hitRateSummary.slHitRate}%)</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 2. Interactive Invariant Position Sizing Calculator Widget */}
                        {stock.executionPlan && (() => {
                          const exec = stock.executionPlan;
                          const riskAmount = Math.round(calculatorCapital * (calculatorRiskPct / 100));
                          const riskPerShare = Math.max(0.1, exec.riskPerShare);
                          const shares = Math.max(0, Math.floor(riskAmount / riskPerShare));
                          const lots = Math.floor(shares / exec.lotSize);
                          const cashCost = Math.round(shares * stock.currentPrice);
                          const foMargin = lots > 0 ? lots * exec.capitalRequirementPerLot : cashCost;

                          return (
                            <div className="p-3.5 rounded-xl bg-[#0b0d14] border border-zinc-800 space-y-3">
                              {shares === 0 && <p role="status" className="text-xs text-amber-400">No position fits this risk budget. Increase the budget or wait for a smaller stop distance.</p>}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-800/80">
                                <div className="flex items-center gap-2">
                                  <Calculator className="w-4 h-4 text-purple-400" />
                                  <span className="text-xs font-mono font-bold text-white">
                                    Position Sizing & Capital Allocation ({stock.symbol})
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    INVARIANT RISK
                                  </span>
                                </div>

                                <button
                                  onClick={() => {
                                    setAiStockContext(stock);
                                    setShowAIBot(true);
                                  }}
                                  className="text-xs font-mono text-purple-300 hover:text-purple-200 flex items-center gap-1 transition-colors"
                                >
                                  <Sparkles className="w-3 h-3 text-purple-400" />
                                  <span>Verify with AI Bot</span>
                                </button>
                              </div>

                              {/* Controls */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                                <div>
                                  <label className="text-[11px] text-zinc-400 block mb-1">
                                    Trading Capital (₹):
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={calculatorCapital}
                                      onChange={(e) => setCalculatorCapital(Math.max(1000, Number(e.target.value)))}
                                      className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs w-32 focus:border-purple-500/60 outline-none"
                                    />
                                    <div className="flex items-center gap-1">
                                      {[50000, 100000, 200000, 500000].map((amt) => (
                                        <button
                                          key={amt}
                                          onClick={() => setCalculatorCapital(amt)}
                                          className={`px-1.5 py-1 rounded text-[10px] ${
                                            calculatorCapital === amt
                                              ? "bg-purple-500 text-white font-bold"
                                              : "bg-zinc-900 text-zinc-400 hover:text-white"
                                          }`}
                                        >
                                          ₹{amt >= 100000 ? `${amt / 100000}L` : `${amt / 1000}k`}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[11px] text-zinc-400 block mb-1">
                                    Risk Tolerance Per Trade (%):
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={calculatorRiskPct}
                                      onChange={(e) => setCalculatorRiskPct(Math.max(0.5, Math.min(10, Number(e.target.value))))}
                                      className="bg-zinc-950 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold font-mono text-xs w-20 focus:border-amber-500/60 outline-none"
                                    />
                                    <div className="flex items-center gap-1">
                                      {[1.0, 1.5, 2.0, 3.0].map((r) => (
                                        <button
                                          key={r}
                                          onClick={() => setCalculatorRiskPct(r)}
                                          className={`px-2 py-1 rounded text-[10px] ${
                                            calculatorRiskPct === r
                                              ? "bg-amber-500 text-black font-bold"
                                              : "bg-zinc-900 text-zinc-400 hover:text-white"
                                          }`}
                                        >
                                          {r}%
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Calculated Sizing Outputs */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
                                <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                                  <div className="text-[10px] text-zinc-500 uppercase">Risk Budget</div>
                                  <div className="text-white font-bold mt-0.5">
                                    ₹{riskAmount.toLocaleString("en-IN")}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">
                                    ₹{riskPerShare.toFixed(2)}/share
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-zinc-950 border border-zinc-800/80">
                                  <div className="text-[10px] text-zinc-500 uppercase">Max Cash Shares</div>
                                  <div className="text-amber-300 font-bold mt-0.5">
                                    {shares} Shares
                                  </div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">
                                    Value: ₹{cashCost.toLocaleString("en-IN")}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-zinc-950 border border-purple-500/30">
                                  <div className="text-[10px] text-purple-400 uppercase">F&O Contract Lots</div>
                                  <div className="text-purple-300 font-bold mt-0.5">
                                    {lots > 0 ? `${lots} Lot(s)` : "0 (Cash Only)"}
                                  </div>
                                  <div className="text-[10px] text-zinc-500 mt-0.5">
                                    Margin: ₹{foMargin.toLocaleString("en-IN")}
                                  </div>
                                </div>

                                <div className="p-2 rounded bg-zinc-950 border border-emerald-500/30">
                                  <div className="text-[10px] text-emerald-400 uppercase">Payoff at TP2 (+2.5R)</div>
                                  <div className="text-emerald-400 font-bold mt-0.5">
                                    +₹{Math.round(riskAmount * 2.5).toLocaleString("en-IN")}
                                  </div>
                                  <div className="text-[10px] text-rose-400 mt-0.5">
                                    If SL Hit: -₹{riskAmount.toLocaleString("en-IN")}
                                  </div>
                                </div>
                              </div>

                              {/* Institutional Broadcast Action Bar */}
                              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80">
                                <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                  Broadcast Verified Institutional Signal
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSendToTelegram(stock)}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
                                      sentTelegramMap[stock.symbol]
                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                        : "bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-sky-500/35"
                                    }`}
                                  >
                                    <span>✈️</span>
                                    <span>
                                      {sentTelegramMap[stock.symbol]
                                        ? "✓ Sent to Telegram (@EagleBABAAIBOT)"
                                        : "Send to Telegram (@EagleBABAAIBOT)"}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendToWhatsApp(stock)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-mono text-emerald-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <span>💬</span>
                                    <span>Share to WhatsApp Channel</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* 3. Detailed Yearly Performance Table */}
                        <div className="space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="text-xs font-mono text-zinc-300 font-semibold flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              <span>{lookbackYears}-Year Synodic Window Historical Breakdown</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                              <span>Volatility: <span className="text-zinc-200">{stock.volatility.toFixed(2)}%</span></span>
                              <span>•</span>
                              <span>Max Drawdown: <span className="text-rose-400">{stock.maxDrawdown.toFixed(2)}%</span></span>
                              <span>•</span>
                              <span>Median: <span className={stock.medianReturn >= 0 ? "text-emerald-400" : "text-rose-400"}>{stock.medianReturn > 0 ? "+" : ""}{stock.medianReturn.toFixed(2)}%</span></span>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                                  <th className="pb-2">Year</th>
                                  <th className="pb-2">Relative</th>
                                  <th className="pb-2">Historical Window</th>
                                  <th className="pb-2">Sessions</th>
                                  <th className="pb-2">Simulated Open</th>
                                  <th className="pb-2">Simulated Close</th>
                                  <th className="pb-2 text-right">Holding Return</th>
                                  <th className="pb-2 text-center">Execution Outcome</th>
                                  <th className="pb-2 text-right">R-Multiple</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/40">
                                {stock.yearlyBreakdown.map((yb) => (
                                  <tr key={yb.year} className="hover:bg-zinc-900/50">
                                    <td className="py-1.5 font-bold text-white">{yb.year}</td>
                                    <td className="py-1.5 text-zinc-400">{yb.relativeYear}</td>
                                    <td className="py-1.5 text-zinc-300">{yb.startDate} ➔ {yb.endDate}</td>
                                    <td className="py-1.5 text-zinc-400">{yb.tradingSessions}</td>
                                    <td className="py-1.5 text-zinc-400">₹{yb.startPrice.toLocaleString("en-IN")}</td>
                                    <td className="py-1.5 text-zinc-400">₹{yb.endPrice.toLocaleString("en-IN")}</td>
                                    <td
                                      className={`py-1.5 text-right font-bold ${
                                        yb.returnPct > 0
                                          ? "text-emerald-400"
                                          : yb.returnPct < 0
                                          ? "text-rose-400"
                                          : "text-zinc-400"
                                      }`}
                                    >
                                      {yb.returnPct > 0 ? "+" : ""}
                                      {yb.returnPct.toFixed(2)}%
                                    </td>
                                    <td className="py-1.5 text-center">
                                      {yb.hitOutcome === "TP3_HIT" ? (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 text-[10px]">
                                          🏆 TP3 HIT
                                        </span>
                                      ) : yb.hitOutcome === "TP2_HIT" ? (
                                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 text-[10px]">
                                          🎯 TP2 HIT
                                        </span>
                                      ) : yb.hitOutcome === "TP1_HIT" ? (
                                        <span className="px-2 py-0.5 rounded bg-lime-500/15 text-lime-300 border border-lime-500/25 text-[10px]">
                                          ✓ TP1 HIT
                                        </span>
                                      ) : yb.hitOutcome === "SL_HIT" ? (
                                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 text-[10px]">
                                          ✕ SL HIT
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 text-[10px]">
                                          ~ SCRATCH
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      className={`py-1.5 text-right font-mono font-bold ${
                                        (yb.rMultipleAchieved ?? 0) > 0
                                          ? "text-emerald-400"
                                          : (yb.rMultipleAchieved ?? 0) < 0
                                          ? "text-rose-400"
                                          : "text-zinc-400"
                                      }`}
                                    >
                                      {(yb.rMultipleAchieved ?? 0) > 0 ? "+" : ""}
                                      {(yb.rMultipleAchieved ?? 0).toFixed(1)}R
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 6. MODALS & SLIDE-OVER ASSISTANTS */}
      <ChronoWheelGuideModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
      />

      <ChronoWheelAIBot
        isOpen={showAIBot}
        onClose={() => setShowAIBot(false)}
        activeStock={aiStockContext}
        cycleContext={
          scanResult
            ? {
                startDate: scanResult.referenceWindow.startDate,
                endDate: scanResult.referenceWindow.endDate,
                tithi: scanResult.referenceWindow.startPhase.tithiName,
                phaseAngle: scanResult.referenceWindow.startPhase.phaseAngle,
                phaseName: scanResult.referenceWindow.startPhase.phaseName,
                lookbackYears: scanResult.lookbackYears,
              }
            : undefined
        }
        onClearStock={() => setAiStockContext(null)}
      />

      {/* 7. FLOATING AI ASSISTANT TRIGGER PILL */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setAiStockContext(null);
            setShowAIBot(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-black font-bold text-xs shadow-[0_0_25px_rgba(245,158,11,0.35)] transition-all transform hover:scale-105 select-none"
        >
          <Sparkles className="w-4 h-4 text-black animate-pulse" />
          <span>Ask AI Assistant</span>
        </button>
      </div>
    </div>
  );
}
