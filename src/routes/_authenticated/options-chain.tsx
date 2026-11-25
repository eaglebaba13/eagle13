// Phase 38 — Institutional AI LTP Calculator & Chart of Accuracy (COA 1.0) Station
// EagleBABA Proprietary Mathematical Framework.
//
// Features:
// 1. Percentage Dominance & Shifting Matrix (100% Strong, >=75% WTT / WTB).
// 2. Chart of Accuracy (COA 1.0) 9-Scenario Classifier Banner.
// 3. Exact Dot-to-Dot Reversal Columns (Call Reversal & Put Reversal).
// 4. Mode Switcher: [LIVE AI-LTP] [09:20 STATIC] [STOCKS 4-LINE] [LTP BLAST SCREENER].
// 5. Key Levels Ribbon: EOS, S-Mod, EOR, R-Mod, Max Pain SL, Max Gain Target.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap,
  Clock,
  BarChart2,
  Target,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  Layers,
  Sparkles,
  Bell,
} from "lucide-react";

import { computeOptionChainIntelligence } from "@/lib/analytics/optionChainIntelligence";

import {
  ltpCalculatorQuery,
  stockFourLineQuery,
  getLtpBlastStocks,
} from "@/lib/options/ltp-calculator.functions";
import type {
  LtpCalculatorOutput,
  StockFourLineLevels,
  CoaScenarioResult,
  ReversalLevels,
} from "@/lib/options/ltp-calculator-engine.server";
import { OptionChainTable } from "@/components/option-chain/OptionChainTable";
import { LtpBlastScreener } from "@/components/option-chain/LtpBlastScreener";
import { StockFourLineCard } from "@/components/option-chain/StockFourLineCard";
import { OiDirectionScanner } from "@/components/option-chain/OiDirectionScanner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { UNIVERSAL_INSTRUMENTS } from "@/lib/market-data/fo-universe";

export const Route = createFileRoute("/_authenticated/options-chain")({
  head: () => ({
    meta: [
      { title: "⚡ AI LTP Calculator & COA 1.0 — Institutional Option Chain | EagleBABA" },
      {
        name: "description",
        content:
          "Institutional AI LTP Calculator & Chart of Accuracy (COA 1.0) engine. Dot-to-dot reversal prices, 75% WTT/WTB shifting matrix, 09:20 AM static levels, and F&O 4-line triggers.",
      },
      { property: "og:title", content: "AI LTP Calculator & Chart of Accuracy (COA 1.0)" },
    ],
  }),
  component: LtpCalculatorPage,
});

type CalculatorMode = "LIVE" | "STATIC_0920" | "STOCKS_4LINE" | "LTP_BLAST" | "OI_SCANNER";

function LtpCalculatorPage() {
  const [mode, setMode] = useState<CalculatorMode>("LIVE");
  const [underlying, setUnderlying] = useState<string>("NIFTY");
  const [strikeDepth, setStrikeDepth] = useState<number>(10);
  const [expiry, setExpiry] = useState<string>("");
  const [selectedStock, setSelectedStock] = useState<string>("RELIANCE");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Data states
  const [blastStocks, setBlastStocks] = useState<StockFourLineLevels[]>([]);

  const [otherLoading, setOtherLoading] = useState(true);
  const indexMode = mode === "LIVE" || mode === "STATIC_0920";
  const ltpQuery = useQuery({ ...ltpCalculatorQuery({ underlying, expiry: expiry || undefined }), enabled: indexMode });
  const fourLineQuery = useQuery({ ...stockFourLineQuery(selectedStock), enabled: mode === "STOCKS_4LINE" });
  const ltpData: LtpCalculatorOutput | null = ltpQuery.data?.ok ? ltpQuery.data.data : null;
  const availableExpiries = ltpQuery.data?.ok ? ltpQuery.data.availableExpiries ?? [] : [];
  const fourLineData = fourLineQuery.data?.ok ? fourLineQuery.data.fourLine : null;
  const loading = indexMode ? ltpQuery.isFetching : mode === "STOCKS_4LINE" ? fourLineQuery.isFetching : otherLoading;
  const errorMsg = ltpQuery.error?.message ?? (ltpQuery.data?.ok === false ? ltpQuery.data.error : null);
  const lastRefreshed = ltpQuery.dataUpdatedAt ? new Date(ltpQuery.dataUpdatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "";

  const isFoStock = useMemo(() => {
    const sym = (underlying || "").toUpperCase();
    const indexSet = new Set(["NIFTY", "NIFTY50", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX", "INDIA_VIX"]);
    const cryptoOrCommodity = new Set(["BTCUSDT", "ETHUSDT", "SOLUSDT", "GC1!", "SI1!"]);
    return !indexSet.has(sym) && !cryptoOrCommodity.has(sym);
  }, [underlying]);

  const formatExpiryDisplay = useCallback(
    (exp: string, idx: number) => {
      if (!isFoStock) return exp;
      try {
        const parts = exp.split("-");
        if (parts.length === 3) {
          const y = parts[0];
          const mIdx = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          const tag = idx === 0 ? "Monthly" : idx === 1 ? "Next Monthly" : "Far Monthly";
          return `${d} ${months[mIdx]} ${y} (${tag})`;
        }
      } catch {
        // ignore
      }
      return exp;
    },
    [isFoStock],
  );

  const fetchBlastFn = useServerFn(getLtpBlastStocks);

  const loadIndexLtp = () => ltpQuery.refetch();
  const loadStockFourLine = (_symbol: string) => fourLineQuery.refetch();

  // Load LTP Blast Screener Stocks
  const loadBlastScreener = useCallback(async () => {
    setOtherLoading(true);
    try {
      const res = await fetchBlastFn({ data: { filter: "ALL" } });
      if (res.ok && res.stocks) {
        setBlastStocks(res.stocks);
      }
    } catch (e) {
      // ignore
    } finally {
      setOtherLoading(false);
    }
  }, [fetchBlastFn]);

  useEffect(() => {
    if (mode === "LTP_BLAST") loadBlastScreener();
  }, [mode, loadBlastScreener]);

  // Active levels based on LIVE vs 09:20 STATIC
  const activeLevels: ReversalLevels | null = useMemo(() => {
    if (!ltpData) return null;
    if (mode === "STATIC_0920" && ltpData.static0920Snapshot) {
      return ltpData.static0920Snapshot;
    }
    return ltpData.reversalLevels;
  }, [ltpData, mode]);

  const coaScenario: CoaScenarioResult | null = ltpData?.coaScenario ?? null;

  // Additive Option-Chain Intelligence Engine (PAZ, PDI, OVM-9, RSB, Top-Down Range)
  const ocIntelligence = useMemo(() => {
    if (!ltpData) return null;
    return computeOptionChainIntelligence({
      underlying,
      spotPrice: ltpData.spotPrice,
      atmStrike: ltpData.atmStrike,
      expiry,
      callStrikes: ltpData.callStrikes,
      putStrikes: ltpData.putStrikes,
      reversalLevels: activeLevels ?? undefined,
      static0920Snapshot: ltpData.static0920Snapshot,
    });
  }, [ltpData, underlying, expiry, activeLevels]);

  const [alertAudioEnabled, setAlertAudioEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("eaglebaba_oc_alerts") === "true";
    }
    return false;
  });

  const prevRegimeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ocIntelligence) return;
    const currentRegime = ocIntelligence.ovm9.regime;
    if (prevRegimeRef.current && prevRegimeRef.current !== currentRegime && alertAudioEnabled) {
      try {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        }
      } catch {
        // audio optional
      }
    }
    prevRegimeRef.current = currentRegime;
  }, [ocIntelligence, alertAudioEnabled]);

  const toggleAlertAudio = () => {
    setAlertAudioEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("eaglebaba_oc_alerts", String(next));
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-zinc-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Breadcrumb & Controls */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider text-amber-400 mb-1">
            <Sparkles className="w-4 h-4" />
            <span>INSTITUTIONAL QUANTITATIVE DERIVATIVES · COA 1.0</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white flex items-center gap-2">
            AI LTP Calculator & Chart of Accuracy
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl font-sans">
            EagleBABA Proprietary Mathematical Reversal &amp; Diversion Engine (COA 1.0). Dot-to-dot strike reversal prices, 75% WTT/WTB shifting matrix, and 4-line F&amp;O institutional triggers.
          </p>
        </div>

        {/* Global Action Tools */}
        <div className={`flex items-center gap-2.5 ${mode === "OI_SCANNER" ? "hidden" : ""}`}>
          <button
            onClick={() => {
              if (mode === "LIVE" || mode === "STATIC_0920") loadIndexLtp();
              else if (mode === "LTP_BLAST") loadBlastScreener();
              else loadStockFourLine(selectedStock);
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-xs font-mono text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            Refresh Data
          </button>
        </div>
      </header>

      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setMode("LIVE")}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all inline-flex items-center gap-2 ${
            mode === "LIVE"
              ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/20"
              : "bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          ⚡ LIVE AI-LTP
        </button>

        <button
          onClick={() => setMode("STATIC_0920")}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all inline-flex items-center gap-2 ${
            mode === "STATIC_0920"
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-lg shadow-cyan-500/20"
              : "bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          🕘 09:20 STATIC SNAPSHOT
        </button>

        <button
          onClick={() => setMode("STOCKS_4LINE")}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all inline-flex items-center gap-2 ${
            mode === "STOCKS_4LINE"
              ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg shadow-emerald-500/20"
              : "bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          📊 STOCKS 4-LINE (P2/P1/C1/C2)
        </button>

        <button
          onClick={() => setMode("LTP_BLAST")}
          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all inline-flex items-center gap-2 ${
            mode === "LTP_BLAST"
              ? "bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/20"
              : "bg-zinc-900/90 text-zinc-400 border border-zinc-800 hover:text-zinc-200"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          🎯 LTP BLAST SCREENER
        </button>
        <button onClick={() => setMode("OI_SCANNER")} aria-pressed={mode === "OI_SCANNER"} className={`px-4 py-2 rounded border text-xs font-mono ${mode === "OI_SCANNER" ? "border-amber-600 text-amber-300 bg-amber-950/20" : "border-zinc-700 text-zinc-400"}`}>OI DIRECTION SCANNER</button>
      </div>

      {/* Main Content Area */}
      {mode === "OI_SCANNER" && <OiDirectionScanner/>}
      {(mode === "LIVE" || mode === "STATIC_0920") && (
        <div className="space-y-5">
          {/* Top-Down Range & Regime Header */}
          {ocIntelligence && (
            <div className="p-4 rounded-2xl border border-zinc-800 bg-[#0c0e14]/90 shadow-md flex flex-wrap items-center justify-between gap-4 font-mono">
              {/* Left: OVM-9 Regime Badge & Description */}
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide border flex items-center gap-2 ${
                    ocIntelligence.ovm9.badgeColor === "emerald"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : ocIntelligence.ovm9.badgeColor === "rose"
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                      : ocIntelligence.ovm9.badgeColor === "gold"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                      : ocIntelligence.ovm9.badgeColor === "purple"
                      ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                      : "bg-zinc-800/80 text-zinc-300 border-zinc-700"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  OVM-9: {ocIntelligence.ovm9.regime}
                </div>
                <span className="text-[11px] text-zinc-400 hidden sm:inline">
                  {ocIntelligence.ovm9.description}
                </span>
              </div>

              {/* Center: Weekly Range & 09:20 Day Range */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                  <span className="text-zinc-500 text-[10px] font-semibold">WEEKLY RANGE (IV ±{ocIntelligence.topDownRange.weeklyRange.expectedMove}):</span>
                  <span className="text-zinc-200 font-bold">
                    {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.topDownRange.weeklyRange.low.toFixed(2)} - {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.topDownRange.weeklyRange.high.toFixed(2)}
                  </span>
                  {ocIntelligence.topDownRange.weeklyRange.ivExpansion ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      IV EXPANSION ⚡
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      IV NORMAL
                    </span>
                  )}
                </div>

                <div className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center gap-2">
                  <span className="text-zinc-500 text-[10px] font-semibold">09:20 RANGE:</span>
                  <span className="text-zinc-200 font-bold tabular-nums">
                    {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.topDownRange.dayRange0920.low.toFixed(2)} - {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.topDownRange.dayRange0920.high.toFixed(2)}
                  </span>
                  <span className="text-zinc-500 text-[10px] tabular-nums">
                    ({(ocIntelligence.topDownRange.dayRange0920.high - ocIntelligence.topDownRange.dayRange0920.low).toFixed(2)} pts)
                  </span>
                </div>

                {/* Intraday OI vs Volume & Session Flow Badge */}
                <div
                  className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-wrap items-center gap-2"
                  title={ocIntelligence.sessionFlow.deltaOiContrastNote}
                >
                  <span className="text-slate-400 text-[10px] font-semibold">SESSION FLOW:</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 font-semibold">
                    {ocIntelligence.sessionFlow.oiProfile.replace(/_/g, " ")}
                  </span>
                  <span className="text-slate-400 text-[10px] tabular-nums">
                    ATM Vol: <strong className="text-zinc-200">{ocIntelligence.sessionFlow.atmVolumeDominance}</strong>
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                      ocIntelligence.sessionFlow.flowBias === "PUT_FLOW_EDGE"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                        : ocIntelligence.sessionFlow.flowBias === "CALL_FLOW_EDGE"
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                    }`}
                  >
                    {ocIntelligence.sessionFlow.flowBias}
                  </span>
                </div>
              </div>

              {/* Right: Audio Alert Toggle */}
              <button
                type="button"
                onClick={toggleAlertAudio}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono border flex items-center gap-1.5 transition-colors ${
                  alertAudioEnabled
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
                title={alertAudioEnabled ? "Regime alert chime enabled" : "Enable regime audio chime"}
              >
                <Bell className={`w-3.5 h-3.5 ${alertAudioEnabled ? "text-amber-400" : ""}`} />
                <span>{alertAudioEnabled ? "CHIME ON" : "CHIME OFF"}</span>
              </button>
            </div>
          )}

          {/* Top Regime Banner & Key Levels Ribbon */}
          {coaScenario && activeLevels && (
            <div className="p-5 rounded-2xl border border-zinc-800 bg-gradient-to-br from-[#0e111a] via-[#10131e] to-[#0a0c14] shadow-xl space-y-4">
              {/* Regime Badge & Directional Guidance */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`px-4 py-2 rounded-xl font-mono text-sm font-black tracking-wide border shadow-md inline-flex items-center gap-2 ${
                      coaScenario.color === "emerald"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-emerald-500/10"
                        : coaScenario.color === "rose"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-rose-500/10"
                        : coaScenario.color === "amber"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-amber-500/10"
                        : "bg-amber-400/20 text-amber-300 border-amber-400/50 shadow-amber-400/10"
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
                    {coaScenario.badgeText}
                  </div>

                  <div>
                    <div className="text-xs font-mono font-bold text-zinc-200">
                      {coaScenario.name}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Support: <span className="font-bold text-zinc-200">{coaScenario.supportState}</span> ({coaScenario.supportDominantFactor}) · Resistance: <span className="font-bold text-zinc-200">{coaScenario.resistanceState}</span> ({coaScenario.resistanceDominantFactor})
                    </div>
                  </div>
                </div>

                {/* Recommendation pill */}
                <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-300 max-w-xl">
                  <span className="text-amber-400 font-bold mr-1.5">⚡ COA 1.0 RULE:</span>
                  {coaScenario.recommendation}
                </div>
              </div>

              {/* Key Levels Ribbon */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
                {/* EOS */}
                <div
                  className={`p-3 rounded-xl border ${
                    ocIntelligence?.rsbExecution.suppressedSide === "BULLISH"
                      ? "bg-zinc-900/40 border-zinc-800 opacity-50"
                      : "bg-emerald-950/20 border-emerald-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] text-emerald-400 font-bold">
                    <span>EOS (SUPPORT)</span>
                    {ocIntelligence?.rsbExecution.suppressedSide === "BULLISH" ? (
                      <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px]">SUPPRESSED</span>
                    ) : ocIntelligence ? (
                      <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[8px]">
                        {ocIntelligence.pdiBot.pressureState}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`text-lg font-black mt-0.5 tabular-nums ${
                      ocIntelligence?.rsbExecution.suppressedSide === "BULLISH"
                        ? "text-zinc-500 line-through"
                        : "text-emerald-300"
                    }`}
                  >
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.eos.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Strike {activeLevels.supportStrike}
                  </div>
                </div>

                {/* S-Moderate */}
                <div
                  className={`p-3 rounded-xl border ${
                    ocIntelligence?.rsbExecution.suppressedSide === "BULLISH"
                      ? "bg-zinc-900/40 border-zinc-800 opacity-50"
                      : "bg-emerald-950/10 border-emerald-500/20"
                  }`}
                >
                  <div className="text-[10px] text-emerald-400 font-medium">S-MOD (SAFE BUY)</div>
                  <div
                    className={`text-lg font-black mt-0.5 tabular-nums ${
                      ocIntelligence?.rsbExecution.suppressedSide === "BULLISH"
                        ? "text-zinc-500 line-through"
                        : "text-zinc-100"
                    }`}
                  >
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.sModerate.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-emerald-400/80 mt-0.5">
                    {ocIntelligence?.rsbExecution.suppressedSide === "BULLISH"
                      ? "Suppressed (Bloodbath)"
                      : "Safe Support Entry"}
                  </div>
                </div>

                {/* EOR */}
                <div
                  className={`p-3 rounded-xl border ${
                    ocIntelligence?.rsbExecution.suppressedSide === "BEARISH"
                      ? "bg-zinc-900/40 border-zinc-800 opacity-50"
                      : "bg-rose-950/20 border-rose-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] text-rose-400 font-bold">
                    <span>EOR (RESISTANCE)</span>
                    {ocIntelligence?.rsbExecution.suppressedSide === "BEARISH" ? (
                      <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[8px]">SUPPRESSED</span>
                    ) : ocIntelligence ? (
                      <span className="px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 text-[8px]">
                        {ocIntelligence.pdiTop.pressureState}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`text-lg font-black mt-0.5 tabular-nums ${
                      ocIntelligence?.rsbExecution.suppressedSide === "BEARISH"
                        ? "text-zinc-500 line-through"
                        : "text-rose-300"
                    }`}
                  >
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.eor.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Strike {activeLevels.resistanceStrike}
                  </div>
                </div>

                {/* R-Moderate */}
                <div
                  className={`p-3 rounded-xl border ${
                    ocIntelligence?.rsbExecution.suppressedSide === "BEARISH"
                      ? "bg-zinc-900/40 border-zinc-800 opacity-50"
                      : "bg-rose-950/10 border-rose-500/20"
                  }`}
                >
                  <div className="text-[10px] text-rose-400 font-medium">R-MOD (SAFE SELL)</div>
                  <div
                    className={`text-lg font-black mt-0.5 tabular-nums ${
                      ocIntelligence?.rsbExecution.suppressedSide === "BEARISH"
                        ? "text-zinc-500 line-through"
                        : "text-zinc-100"
                    }`}
                  >
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.rModerate.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-rose-400/80 mt-0.5">
                    {ocIntelligence?.rsbExecution.suppressedSide === "BEARISH"
                      ? "Suppressed (Bullrun)"
                      : "Safe Resistance Entry"}
                  </div>
                </div>

                {/* Max Pain / Stop Loss */}
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] text-amber-400 font-bold">MAX PAIN (SL)</div>
                  <div className="text-lg font-black text-rose-400 mt-0.5">
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.maxPainSl.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Next Strike Reversal
                  </div>
                </div>

                {/* Max Gain / Target */}
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] text-cyan-400 font-bold">MAX GAIN (TP)</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    {ltpData?.currencySymbol ?? "₹"}{activeLevels.maxGainTarget.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Opposite Reversal
                  </div>
                </div>
              </div>

              {/* Execution & Invalidation Matrix Card */}
              {ocIntelligence && (
                <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/70 font-mono space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                      <Target className="w-3.5 h-3.5 text-amber-400" />
                      <span>REVERSAL &amp; STRETCH BANDS (RSB) EXECUTION MATRIX</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          ocIntelligence.rsbExecution.tradable
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        }`}
                      >
                        {ocIntelligence.rsbExecution.tradable ? "EXECUTION VALID" : "SETTLEMENT / RISK GATED"}
                      </span>
                      {ocIntelligence.rsbExecution.extendedTolerance && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          RSB-EXT (+1 STRIKE EXPANSION)
                        </span>
                      )}
                      {ocIntelligence.rsbExecution.oneSidedGating !== "NONE" && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            ocIntelligence.rsbExecution.oneSidedGating === "BEARISH_ONLY"
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          }`}
                        >
                          {ocIntelligence.rsbExecution.oneSidedGating === "BEARISH_ONLY"
                            ? "BLOODBATH · BEARISH ONLY"
                            : "BULLRUN · BULLISH ONLY"}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border tabular-nums ${
                          ocIntelligence.rsbExecution.slRiskTier === "TIGHT"
                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                            : ocIntelligence.rsbExecution.slRiskTier === "MODERATE"
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                        }`}
                      >
                        SL {ocIntelligence.rsbExecution.slDistancePts} pts ({ocIntelligence.rsbExecution.slRiskTier})
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {ocIntelligence.rsbExecution.tradeReason}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                    {/* Conservative Entry */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("conservativeEntry")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200"
                      }`}
                    >
                      <div className="text-[9px] text-zinc-400 font-semibold uppercase">Conservative Entry</div>
                      <div className="text-base font-black text-amber-300 mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.conservativeEntry.toFixed(2)}
                      </div>
                    </div>

                    {/* Aggressive Entry */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("aggressiveEntry")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200"
                      }`}
                    >
                      <div className="text-[9px] text-zinc-400 font-semibold uppercase">Aggressive Entry</div>
                      <div className="text-base font-black text-amber-300 mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.aggressiveEntry.toFixed(2)}
                      </div>
                    </div>

                    {/* Invalidation Stop */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("invalidationStop")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-rose-950/20 border-rose-500/30 text-rose-300"
                      }`}
                    >
                      <div className="text-[9px] text-rose-400 font-semibold uppercase flex items-center justify-between">
                        <span>Invalidation Stop</span>
                        <span className="text-[8px] tabular-nums">{ocIntelligence.rsbExecution.slDistancePts}p</span>
                      </div>
                      <div className="text-base font-black mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.invalidationStop.toFixed(2)}
                      </div>
                    </div>

                    {/* Target 1 */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("target1")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      <div className="text-[9px] text-emerald-400 font-semibold uppercase">Target 1 (T1)</div>
                      <div className="text-base font-black mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.target1.toFixed(2)}
                      </div>
                    </div>

                    {/* Target 2 */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("target2")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      <div className="text-[9px] text-emerald-400 font-semibold uppercase">Target 2 (T2)</div>
                      <div className="text-base font-black mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.target2.toFixed(2)}
                      </div>
                    </div>

                    {/* Target 3 */}
                    <div
                      className={`p-2.5 rounded-lg border ${
                        ocIntelligence.rsbExecution.invalidatedLevels.includes("target3")
                          ? "bg-zinc-900/40 border-zinc-800 text-zinc-500 line-through opacity-50"
                          : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                      }`}
                    >
                      <div className="text-[9px] text-emerald-400 font-semibold uppercase flex items-center justify-between">
                        <span>Target 3 (T3)</span>
                        {ocIntelligence.rsbExecution.extendedTolerance && (
                          <span className="text-[8px] px-1 rounded bg-cyan-500/30 text-cyan-200">EXT</span>
                        )}
                      </div>
                      <div className="text-base font-black mt-0.5 tabular-nums">
                        {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.rsbExecution.target3.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* D1 (1:1) Divergence Scalp Plan Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-[11px] tabular-nums">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
                        D1 (1:1) SCALP
                      </span>
                      <span className="text-zinc-300">
                        Entry {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.d1ScalpPlan.entryPrice.toFixed(2)}
                      </span>
                      <span className="text-rose-300">
                        SL {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.d1ScalpPlan.stopLossPrice.toFixed(2)}
                      </span>
                      <span className="text-emerald-300">
                        1:1 Target {ltpData?.currencySymbol ?? "₹"}{ocIntelligence.d1ScalpPlan.targetPrice.toFixed(2)}
                      </span>
                      <span className="text-zinc-400">
                        ({ocIntelligence.d1ScalpPlan.pointDistance} pts / cap {ocIntelligence.d1ScalpPlan.recommendedCapPts} pts)
                      </span>
                    </div>
                    {ocIntelligence.d1ScalpPlan.overExtended ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[10px]">
                        OVER-EXTENDED (&gt;{ocIntelligence.d1ScalpPlan.recommendedCapPts} PTS)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold text-[10px]">
                        WITHIN 25-PT CAP
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Index Selector, Strike Depth & Expiry Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-[#0c0e14]">
            <div className="flex flex-wrap items-center gap-3">
              {/* Categorized Multi-Asset Selector */}
              <label className="text-xs font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                UNDERLYING:
                <select
                  value={underlying}
                  onChange={(e) => {
                    setUnderlying(e.target.value);
                    setExpiry("");
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono focus:outline-none focus:border-amber-500 max-w-[220px]"
                >
                  <optgroup label="── 1. INDIAN INDICES ──">
                    <option value="NIFTY">NIFTY 50</option>
                    <option value="BANKNIFTY">BANK NIFTY</option>
                    <option value="FINNIFTY">FINNIFTY</option>
                    <option value="MIDCPNIFTY">MIDCPNIFTY</option>
                    <option value="SENSEX">BSE SENSEX</option>
                    <option value="BANKEX">BSE BANKEX</option>
                  </optgroup>
                  <optgroup label="── 2. CRYPTO & COMMODITIES ──">
                    <option value="BTCUSDT">BTC/USDT (Bitcoin)</option>
                    <option value="ETHUSDT">ETH/USDT (Ethereum)</option>
                    <option value="SOLUSDT">SOL/USDT (Solana)</option>
                    <option value="GC1!">COMEX GOLD (GC1!)</option>
                    <option value="SI1!">COMEX SILVER (SI1!)</option>
                  </optgroup>
                  <optgroup label="── 3. 200+ F&O EQUITIES ──">
                    {UNIVERSAL_INSTRUMENTS.filter((i) => i.category === "FO_EQUITY").map((inst) => (
                      <option key={inst.symbol} value={inst.symbol}>
                        {inst.symbol} ({inst.name})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

              {/* Quick Strike Depth Selector */}
              <div className="flex items-center gap-1 bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800">
                <span className="text-[10px] font-mono font-semibold text-zinc-500 px-1.5">DEPTH:</span>
                {[5, 10, 15, 20].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setStrikeDepth(d)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                      strikeDepth === d
                        ? "bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                    }`}
                  >
                    {d} Strikes
                  </button>
                ))}
              </div>

              {availableExpiries.length > 0 && (
                <label className="text-xs font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                  EXPIRY:
                  <select
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="px-2.5 py-1.5 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono focus:outline-none focus:border-amber-500"
                  >
                    <option value="">
                      {isFoStock ? "Current Monthly Expiry" : "Current Weekly Expiry"}
                    </option>
                    {availableExpiries.map((exp, idx) => (
                      <option key={exp} value={exp}>
                        {formatExpiryDisplay(exp, idx)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="text-xs font-mono text-zinc-400">
              {lastRefreshed && <span>Refreshed: {lastRefreshed} · </span>}
              <span className="text-amber-400 font-bold">
                SPOT: {ltpData?.currencySymbol ?? "₹"}{ltpData?.spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Enhanced Option Chain Grid */}
          {loading && !ltpData ? (
            <TableSkeleton rows={12} cols={11} />
          ) : ltpData && activeLevels && coaScenario ? (
            <OptionChainTable
              callStrikes={ltpData.callStrikes}
              putStrikes={ltpData.putStrikes}
              spotPrice={ltpData.spotPrice}
              atmStrike={ltpData.atmStrike}
              reversalLevels={activeLevels}
              coaScenario={coaScenario}
              strikeDepth={strikeDepth}
              currencySymbol={ltpData.currencySymbol ?? "₹"}
              strikeOverlays={ocIntelligence?.strikeOverlays}
            />
          ) : (
            <div className="p-8 text-center text-zinc-500 font-mono text-xs border border-zinc-800 rounded-xl bg-zinc-950">
              {errorMsg ?? "No option chain data available."}
            </div>
          )}
        </div>
      )}

      {/* Mode: Stocks 4-Line (P2/P1/C1/C2) */}
      {mode === "STOCKS_4LINE" && fourLineData && (
        <StockFourLineCard
          fourLine={fourLineData}
          onSelectSymbol={(sym) => setSelectedStock(sym)}
        />
      )}

      {/* Mode: LTP Blast Screener */}
      {mode === "LTP_BLAST" && (
        <LtpBlastScreener
          stocks={blastStocks}
          isLoading={loading}
          onRefresh={loadBlastScreener}
          onSelectStock={(sym) => {
            setSelectedStock(sym);
            setMode("STOCKS_4LINE");
          }}
        />
      )}
    </div>
  );
}
