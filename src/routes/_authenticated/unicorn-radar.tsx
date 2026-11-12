// Phase 36.3 — Dedicated Standalone Route: 🦄 ICT Unicorn Multi-Asset Radar & SMT Engine
// Provides full-width institutional workstation for real-time liquidity sweeps,
// displacement MSS, breaker blocks, fair value gaps (FVG), and cross-market SMT divergence.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getUnicornRadar,
  getSMTDivergence,
  type UnicornSetup,
  type SMTDivergence,
} from "@/lib/orderflow/unicorn.functions";
import { foBanStatusQuery } from "@/lib/market-data/fo-ban.functions";
import { useLiveCandleSSE } from "@/hooks/use-live-candle-sse";
import { getAudioNotificationManager } from "@/lib/audio-notifications";
import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";
import {
  Radar,
  Radio,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Volume2,
  VolumeX,
  ExternalLink,
  ArrowUpRight,
  RefreshCw,
  Search,
  X,
  ShieldAlert,
  Layers,
  Activity,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Compass,
  Zap,
  Target,
  Minus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/unicorn-radar")({
  head: () => ({
    meta: [
      { title: "🦄 ICT Unicorn & SMT Radar — Institutional Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional ICT Unicorn Model & Real-Time SMT Divergence Engine across Indices, Sectors, F&O Equities, ETFs, and Commodities/Crypto.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnicornRadarPage,
  errorComponent: ({ error, reset }) => {
    if (isAuthErrorMessage(error)) {
      return (
        <GuestUnlockCard
          resourceName="ICT Unicorn & SMT Radar"
          description="The ICT Unicorn Radar & SMT Divergence Engine requires an authenticated session. Sign in or continue with guest full access."
          onRetry={reset}
        />
      );
    }
    const msg = (error as Error).message || "";
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="rounded-2xl border border-red-500/20 bg-zinc-950/80 p-6 max-w-md w-full backdrop-blur-md">
          <p className="text-sm text-red-400 font-medium">Radar Unavailable</p>
          <p className="mt-1 text-xs text-zinc-400 break-words">{msg}</p>
          <button
            onClick={reset}
            className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  },
});

type CategoryFilter = "ALL" | "INDEX" | "SECTOR" | "FO_EQUITY" | "ETF" | "COMMODITY_CRYPTO";
type StatusFilter = "ALL" | "Triggered" | "Retest Ready" | "Forming";
type DirectionFilter = "ALL" | "BULLISH" | "BEARISH";

interface SMTPairInfo {
  readonly id: string;
  readonly name: string;
  readonly asset1Symbol: string;
  readonly asset1Name: string;
  readonly asset2Symbol: string;
  readonly asset2Name: string;
}

const SMT_RADAR_PAIRS: readonly SMTPairInfo[] = [
  {
    id: "NIFTY_VS_BANKNIFTY",
    name: "NIFTY 50 vs BANK NIFTY",
    asset1Symbol: "NIFTY50",
    asset1Name: "NIFTY 50",
    asset2Symbol: "BANKNIFTY",
    asset2Name: "BANK NIFTY",
  },
  {
    id: "GOLD_VS_SILVER",
    name: "COMEX GOLD vs SILVER",
    asset1Symbol: "GC1!",
    asset1Name: "COMEX GOLD",
    asset2Symbol: "SI1!",
    asset2Name: "COMEX SILVER",
  },
  {
    id: "NIFTY_VS_SENSEX",
    name: "NIFTY 50 vs BSE SENSEX",
    asset1Symbol: "NIFTY50",
    asset1Name: "NIFTY 50",
    asset2Symbol: "SENSEX",
    asset2Name: "BSE SENSEX",
  },
];

function UnicornRadarPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("ALL");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: banReport } = useQuery(foBanStatusQuery());

  // Audio manager init
  useEffect(() => {
    const mgr = getAudioNotificationManager();
    setSoundEnabled(mgr.getConfig().enabled);
  }, []);

  const toggleSound = useCallback(() => {
    const mgr = getAudioNotificationManager();
    mgr.toggleEnabled();
    const isNowOn = mgr.getConfig().enabled;
    setSoundEnabled(isNowOn);
    if (isNowOn) {
      mgr.play("RESEARCH_SIGNAL", `unicorn-preview-${Date.now()}`);
    }
  }, []);

  const fetchUnicorn = useServerFn(getUnicornRadar);
  const fetchSMT = useServerFn(getSMTDivergence);

  // Real-time Live SSE streaming ticks
  const { state: niftySse } = useLiveCandleSSE("NIFTY50", 60000);
  const { state: bankNiftySse } = useLiveCandleSSE("BANKNIFTY", 60000);
  const { state: sensexSse } = useLiveCandleSSE("SENSEX", 60000);
  const { state: goldSse } = useLiveCandleSSE("GC1!", 60000);

  const livePrices = useMemo(() => {
    const map = new Map<string, number>();
    const n = niftySse.currentCandle?.close ?? niftySse.status?.lastLtp;
    if (n && n > 0) map.set("NIFTY50", n);
    const b = bankNiftySse.currentCandle?.close ?? bankNiftySse.status?.lastLtp;
    if (b && b > 0) map.set("BANKNIFTY", b);
    const s = sensexSse.currentCandle?.close ?? sensexSse.status?.lastLtp;
    if (s && s > 0) map.set("SENSEX", s);
    const g = goldSse.currentCandle?.close ?? goldSse.status?.lastLtp;
    if (g && g > 0) map.set("GC1!", g);
    return map;
  }, [niftySse, bankNiftySse, sensexSse, goldSse]);

  const {
    data: setups = [],
    refetch: refetchSetups,
    isFetching: isFetchingSetups,
  } = useQuery<UnicornSetup[]>({
    queryKey: ["unicorn-radar-signals"],
    queryFn: () => fetchUnicorn(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const {
    data: smtDivergences = [],
    refetch: refetchSMT,
    isFetching: isFetchingSMT,
  } = useQuery<SMTDivergence[]>({
    queryKey: ["smt-divergence-signals"],
    queryFn: () => fetchSMT(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  // Countdown timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setCountdown(30);
    try {
      await Promise.all([refetchSetups(), refetchSMT()]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  }, [refetchSetups, refetchSMT]);

  // Track previous triggered count to play sound alert on new trigger
  const prevTriggeredCount = useRef(0);
  useEffect(() => {
    const triggered = setups.filter((s) => s.status === "Triggered").length;
    if (triggered > prevTriggeredCount.current && soundEnabled && prevTriggeredCount.current > 0) {
      const mgr = getAudioNotificationManager();
      mgr.play("RESEARCH_SIGNAL", `triggered-${Date.now()}`);
    }
    prevTriggeredCount.current = triggered;
  }, [setups, soundEnabled]);

  // Filtered setups computation
  const filteredSetups = useMemo(() => {
    return setups.filter((s) => {
      // Category filter
      if (categoryFilter !== "ALL" && s.category !== categoryFilter) return false;
      // Status filter
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      // Direction filter
      if (directionFilter !== "ALL" && s.direction !== directionFilter) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSymbol = s.symbol.toLowerCase().includes(q);
        const matchesName = s.displayName.toLowerCase().includes(q);
        const matchesCategory = s.category.toLowerCase().includes(q);
        const matchesSweep = s.sweepType.toLowerCase().includes(q);
        if (!matchesSymbol && !matchesName && !matchesCategory && !matchesSweep) return false;
      }
      return true;
    });
  }, [setups, categoryFilter, statusFilter, directionFilter, searchQuery]);

  // Setup counts by category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: setups.length,
      INDEX: 0,
      SECTOR: 0,
      FO_EQUITY: 0,
      ETF: 0,
      COMMODITY_CRYPTO: 0,
    };
    for (const s of setups) {
      if (counts[s.category] !== undefined) {
        counts[s.category]++;
      }
    }
    return counts;
  }, [setups]);

  // Setup counts by status
  const statusCounts = useMemo(() => {
    const counts = {
      Triggered: 0,
      "Retest Ready": 0,
      Forming: 0,
    };
    for (const s of setups) {
      if (counts[s.status] !== undefined) {
        counts[s.status]++;
      }
    }
    return counts;
  }, [setups]);

  return (
    <div className="w-full max-w-[1700px] mx-auto px-3 sm:px-6 py-6 pb-32 md:pb-12 flex flex-col gap-6">
      {/* =========================================================================
          TOP RIBBON & TERMINAL CONTROLS
          ========================================================================= */}
      <div className="rounded-2xl border border-amber-500/30 bg-zinc-950/85 p-5 md:p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                <Radar size={24} className="animate-pulse" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5 font-sans">
                  <span>🦄 ICT UNICORN &amp; SMT RADAR</span>
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 font-mono mt-0.5">
                  Liquidity Sweeps · Displacement MSS · Breaker Blocks · FVG Discount/Premium Retests · SMT Divergence
                </p>
              </div>
            </div>
          </div>

          {/* Controls Bar: Live Status, Countdown, Sound Toggle, Refresh, Live Chart */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Scanner Active Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)] text-xs font-mono font-bold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>LIVE SCANNER ACTIVE</span>
            </div>

            {/* Countdown Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono font-medium">
              <Clock size={13} className="text-amber-400" />
              <span>Next Scan: {countdown}s</span>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={toggleSound}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
                soundEnabled
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
              }`}
              title={soundEnabled ? "Sound Alerts Enabled" : "Sound Alerts Disabled"}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span>{soundEnabled ? "Sound Alerts ON" : "Sound Alerts OFF"}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing || isFetchingSetups || isFetchingSMT}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-mono font-semibold transition-all disabled:opacity-50"
              title="Refresh radar signals"
            >
              <RefreshCw
                size={14}
                className={isRefreshing || isFetchingSetups || isFetchingSMT ? "animate-spin text-amber-400" : ""}
              />
              <span>Refresh</span>
            </button>

            {/* Deep link to Live Chart */}
            <Link
              to="/live-chart"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold border border-amber-400 text-xs font-mono transition-all shadow-[0_0_14px_rgba(245,158,11,0.3)]"
            >
              <span>Open Live Chart</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        {/* Quick Metric Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-zinc-800/80">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <span className="text-xs font-mono text-zinc-400">SMT Pairs Active</span>
            <span className="text-sm font-bold font-mono text-amber-400">{smtDivergences.length} Pairs</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <span className="text-xs font-mono text-zinc-400">Triggered Setups</span>
            <span className="text-sm font-bold font-mono text-emerald-400">{statusCounts.Triggered} Signals</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <span className="text-xs font-mono text-zinc-400">Retest Ready</span>
            <span className="text-sm font-bold font-mono text-cyan-400">{statusCounts["Retest Ready"]} Setups</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/70">
            <span className="text-xs font-mono text-zinc-400">Forming Structures</span>
            <span className="text-sm font-bold font-mono text-zinc-300">{statusCounts.Forming} Setups</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION A: INTER-MARKET SMT DIVERGENCE DECK (TOP GRID)
          ========================================================================= */}
      <div className="rounded-2xl border border-amber-500/25 bg-zinc-950/80 p-5 md:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-mono text-amber-300 flex items-center gap-2">
              <Radio size={18} className="text-amber-400 animate-pulse" />
              <span>INTER-MARKET SMT DIVERGENCE DECK (INSTITUTIONAL CRACKS)</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Structural swing cracks between correlated asset pairs · Smart Money accumulation vs distribution
            </p>
          </div>
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 self-start sm:self-auto">
            3 PAIRS MONITORED REAL-TIME
          </span>
        </div>

        {/* 3 Dedicated Live Correlation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SMT_RADAR_PAIRS.map((pair) => {
            const activeSMT = smtDivergences.find((s) => s.pairId === pair.id);
            const isBullish = activeSMT?.type === "BULLISH_SMT";
            const isBearish = activeSMT?.type === "BEARISH_SMT";
            const isDivergent = !!activeSMT;
            const pairCurr =
              pair.id === "GOLD_VS_SILVER"
                ? "$"
                : activeSMT?.asset1.currency ?? "₹";
            const a1Price = livePrices.get(pair.asset1Symbol) ?? activeSMT?.asset1.swingBPrice;
            const a2Price = livePrices.get(pair.asset2Symbol) ?? activeSMT?.asset2.swingBPrice;
            const isA1Live = livePrices.has(pair.asset1Symbol);
            const isA2Live = livePrices.has(pair.asset2Symbol);

            return (
              <div
                key={pair.id}
                className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${
                  isDivergent
                    ? isBullish
                    ? "border-emerald-500/40 bg-zinc-900/80 shadow-[0_0_20px_rgba(16,185,129,0.12)] hover:border-emerald-500/60"
                    : "border-rose-500/40 bg-zinc-900/80 shadow-[0_0_20px_rgba(244,63,94,0.12)] hover:border-rose-500/60"
                  : "border-zinc-800/90 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <div>
                  {/* Card Header: Pair Name & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-mono font-bold text-zinc-100">{pair.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {activeSMT?.timeframe ?? "5m"}
                    </span>
                  </div>

                  {/* Status Banner */}
                  <div className="mb-3">
                    {isDivergent ? (
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                          isBullish
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                            : "bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                        }`}
                      >
                        {isBullish ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {isBullish ? "BULLISH SMT ACCUMULATION" : "BEARISH SMT DISTRIBUTION"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700 text-zinc-400">
                        <Minus size={14} />
                        <span>CORRELATED NEUTRAL (IN SYNC)</span>
                      </span>
                    )}
                  </div>

                  {/* High/Low Swing Comparison Box */}
                  <div className="space-y-1.5 text-xs font-mono bg-zinc-950/70 p-3 rounded-xl border border-zinc-800/80 mb-3">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span className="text-zinc-400">{pair.asset1Name}:</span>
                      {activeSMT ? (
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <span>{activeSMT.asset1.swingType}</span>
                          <span>
                            ({pairCurr}
                            {a1Price?.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                          </span>
                          {isA1Live && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
                              title="Live WebSocket Stream"
                            />
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-medium">In Sync / Neutral</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-zinc-300">
                      <span className="text-zinc-400">{pair.asset2Name}:</span>
                      {activeSMT ? (
                        <span
                          className={`font-bold flex items-center gap-1.5 ${
                            isBullish ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          <span>{activeSMT.asset2.swingType}</span>
                          <span>
                            ({pairCurr}
                            {a2Price?.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                          </span>
                          {isA2Live && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
                              title="Live WebSocket Stream"
                            />
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-medium">In Sync / Neutral</span>
                      )}
                    </div>
                  </div>

                  {/* Summary Narrative */}
                  <p className="text-xs text-zinc-400 font-mono leading-relaxed min-h-[44px]">
                    {activeSMT?.summary ??
                      `Both ${pair.asset1Name} and ${pair.asset2Name} are moving in structural alignment. No Smart Money accumulation/distribution crack detected in current swing window.`}
                  </p>
                </div>

                {/* Footer Confluence & Quick Actions */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-500">
                      Target:{" "}
                      <strong className="text-zinc-300">
                        {activeSMT?.targetLiquidity ?? "Monitoring Next Swing"}
                      </strong>
                    </span>
                    <span className="text-amber-400 font-bold">
                      {activeSMT ? `${activeSMT.confidenceScore}% Confluence` : "100% Correlated"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/live-chart?symbol=${pair.asset1Symbol}`}
                      className="flex-1 py-1 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-[11px] font-mono text-zinc-300 hover:text-amber-300 text-center transition-colors flex items-center justify-center gap-1"
                    >
                      <span>Chart {pair.asset1Name.split(" ")[0]}</span>
                      <ArrowUpRight size={12} />
                    </a>
                    <a
                      href={`/live-chart?symbol=${pair.asset2Symbol}`}
                      className="flex-1 py-1 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-[11px] font-mono text-zinc-300 hover:text-amber-300 text-center transition-colors flex items-center justify-center gap-1"
                    >
                      <span>Chart {pair.asset2Name.split(" ")[0]}</span>
                      <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECTION B: MULTI-ASSET UNICORN SCANNER TABLE
          ========================================================================= */}
      <div className="rounded-2xl border border-amber-500/25 bg-zinc-950/80 p-5 md:p-6 shadow-xl backdrop-blur-md flex flex-col gap-5">
        {/* Header & Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold font-mono text-amber-300 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <span>ICT UNICORN MULTI-ASSET SCANNER MATRIX</span>
            </h2>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Live algorithmic setups across Major Indices, NSE Sectors, 200+ F&amp;O Equities, ETFs, and Commodities/Crypto
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative w-full lg:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol (e.g. NIFTY, RELIANCE, GOLD)..."
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-9 pr-9 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills Toolbar: Categories, Status, Direction */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "ALL", label: "All Assets" },
              { id: "INDEX", label: "Indices (Nifty, BankNifty, Sensex, Finnifty)" },
              { id: "SECTOR", label: "NSE Sectors" },
              { id: "FO_EQUITY", label: "F&O Stocks" },
              { id: "ETF", label: "ETFs" },
              { id: "COMMODITY_CRYPTO", label: "Commodities & Crypto" },
            ].map((cat) => {
              const count = categoryCounts[cat.id] ?? 0;
              const isSelected = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id as CategoryFilter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-black border border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                      : "text-zinc-400 hover:text-zinc-200 bg-zinc-900/70 border border-zinc-800"
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? "bg-black/25 text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Secondary Filters: Status & Direction */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Pills */}
            <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
              {(["ALL", "Triggered", "Retest Ready", "Forming"] as const).map((st) => {
                const isSelected = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                      isSelected
                        ? st === "Triggered"
                          ? "bg-emerald-500 text-black border border-emerald-400 font-bold"
                          : st === "Retest Ready"
                            ? "bg-cyan-500 text-black border border-cyan-400 font-bold"
                            : "bg-zinc-700 text-zinc-100 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {st === "ALL" ? "All Status" : st}
                  </button>
                );
              })}
            </div>

            {/* Direction Pills */}
            <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-zinc-800">
              {(["ALL", "BULLISH", "BEARISH"] as const).map((dir) => {
                const isSelected = directionFilter === dir;
                return (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => setDirectionFilter(dir)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                      isSelected
                        ? dir === "BULLISH"
                          ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 font-bold"
                          : dir === "BEARISH"
                            ? "bg-rose-500/25 text-rose-300 border border-rose-500/50 font-bold"
                            : "bg-zinc-800 text-zinc-200 font-bold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {dir === "ALL" ? "All Bias" : dir}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Results Count & Reset Filter */}
        <div className="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
          <span>
            Showing <strong className="text-amber-400">{filteredSetups.length}</strong> of{" "}
            <strong>{setups.length}</strong> active algorithmic setups
          </span>
          {(searchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL" || directionFilter !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("ALL");
                setStatusFilter("ALL");
                setDirectionFilter("ALL");
              }}
              className="text-amber-400 hover:underline flex items-center gap-1"
            >
              <span>Reset all filters</span>
              <X size={13} />
            </button>
          )}
        </div>

        {/* =========================================================================
            RESPONSIVE INSTITUTIONAL TABLE
            ========================================================================= */}
        {filteredSetups.length === 0 ? (
          <div className="py-16 text-center rounded-xl border border-zinc-800/80 bg-zinc-900/30 flex flex-col items-center justify-center gap-2">
            <ShieldAlert size={28} className="text-zinc-500" />
            <p className="text-sm font-mono text-zinc-300 font-bold">No ICT Unicorn Setups Match Your Filters</p>
            <p className="text-xs font-mono text-zinc-500 max-w-md">
              Try adjusting your category selection, status filter, or clearing the symbol search query.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/90 bg-zinc-950/90">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider bg-zinc-900/80">
                  <th className="py-3 px-3.5">Instrument</th>
                  <th className="py-3 px-3">Timeframe</th>
                  <th className="py-3 px-3">Setup Bias</th>
                  <th className="py-3 px-3">Liquidity Swept</th>
                  <th className="py-3 px-3">Displacement &amp; MSS</th>
                  <th className="py-3 px-3">FVG / Trigger Zone</th>
                  <th className="py-3 px-3">Invalidation (SL)</th>
                  <th className="py-3 px-3">Target (ERL)</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredSetups.map((setup) => {
                  const isBullish = setup.direction === "BULLISH";
                  const curr =
                    setup.currency ?? (setup.category === "COMMODITY_CRYPTO" ? "$" : "₹");
                  const liveLtp = livePrices.get(setup.symbol) ?? setup.currentPrice;
                  const isLive = livePrices.has(setup.symbol);
                  const distPts = liveLtp - setup.triggerZone.low;
                  const distPct = ((liveLtp - setup.triggerZone.low) / liveLtp) * 100;

                  return (
                    <tr
                      key={setup.id}
                      className="hover:bg-zinc-900/60 transition-colors group"
                    >
                      {/* 1. Instrument */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-amber-300 text-sm">
                            {setup.symbol}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                            {setup.category}
                          </span>
                          {(() => {
                            const banInfo = banReport?.allMap?.[setup.symbol.toUpperCase()];
                            if (!banInfo) return null;
                            if (banInfo.status === "IN_BAN") {
                              return (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-950/90 text-rose-300 font-mono border border-rose-500/50 font-bold animate-pulse">
                                  🚫 BAN ({banInfo.mwplPercent.toFixed(0)}%)
                                </span>
                              );
                            }
                            if (banInfo.status === "UPCOMING_BAN") {
                              return (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/90 text-amber-300 font-mono border border-amber-500/50 font-bold">
                                  ⚠️ NEAR BAN ({banInfo.mwplPercent.toFixed(0)}%)
                                </span>
                              );
                            }
                            if (banInfo.status === "RECENTLY_UNBANNED") {
                              return (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-300 font-mono border border-emerald-500/50 font-bold">
                                  ✅ UNBANNED
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-0.5 truncate max-w-[180px]">
                          {setup.displayName}
                        </div>
                        <div className="text-[10px] text-zinc-300 font-bold flex items-center gap-1.5 mt-0.5">
                          <span>
                            LTP: {curr}
                            {liveLtp.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-mono border border-emerald-500/30">
                            <span
                              className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${
                                isLive ? "animate-pulse" : ""
                              }`}
                            />
                            LIVE
                          </span>
                        </div>
                      </td>

                      {/* 2. Timeframe */}
                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                          {setup.timeframe}
                        </span>
                      </td>

                      {/* 3. Setup Bias */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border ${
                            isBullish
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                              : "bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                          }`}
                        >
                          {isBullish ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          <span>{isBullish ? "Bullish Unicorn" : "Bearish Unicorn"}</span>
                        </span>
                      </td>

                      {/* 4. Liquidity Swept */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-zinc-200">
                          {setup.sweepType}
                        </div>
                        <div className="text-[11px] text-amber-400 font-medium">
                          @{curr}{setup.sweepLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Wick Rejection Confirmed
                        </div>
                      </td>

                      {/* 5. Displacement & MSS */}
                      <td className="py-3 px-3">
                        <div className="text-zinc-200">
                          MSS: <strong className="text-amber-300">{curr}{setup.mssLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          Breaker: [{curr}{setup.breakerZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} – {curr}{setup.breakerZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}]
                        </div>
                      </td>

                      {/* 6. FVG / Trigger Zone */}
                      <td className="py-3 px-3">
                        <div className="text-amber-300 font-bold">
                          {curr}{setup.triggerZone.low.toLocaleString(undefined, { maximumFractionDigits: 2 })} – {curr}{setup.triggerZone.high.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {distPts >= 0 ? `+${distPts.toFixed(1)} pts` : `${distPts.toFixed(1)} pts`} (
                          {distPct >= 0 ? `+${distPct.toFixed(2)}%` : `${distPct.toFixed(2)}%`})
                        </div>
                      </td>

                      {/* 7. Invalidation / Stop Loss */}
                      <td className="py-3 px-3">
                        <span className="text-rose-400 font-bold">
                          {curr}{setup.invalidationSL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <div className="text-[10px] text-zinc-500">Structural Invalidation</div>
                      </td>

                      {/* 8. Target (ERL) */}
                      <td className="py-3 px-3">
                        <span className="text-emerald-400 font-bold">
                          {curr}{setup.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <div className="text-[10px] text-zinc-400">
                          1:{setup.riskRewardRatio.toFixed(1)} RR · {setup.confidenceScore}% Confl
                        </div>
                      </td>

                      {/* 9. Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            setup.status === "Triggered"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
                              : setup.status === "Retest Ready"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.35)] animate-pulse"
                                : "bg-zinc-800 text-zinc-300 border-zinc-700"
                          }`}
                        >
                          {setup.status}
                        </span>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {setup.timeElapsed}
                        </div>
                      </td>

                      {/* 10. Action */}
                      <td className="py-3 px-3 text-right">
                        <a
                          href={`/live-chart?symbol=${setup.symbol}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-xl bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 hover:border-amber-400 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)] whitespace-nowrap"
                        >
                          <span>View Chart</span>
                          <ExternalLink size={12} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
