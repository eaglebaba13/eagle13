// Phase 38 — Institutional AI LTP Calculator & Chart of Accuracy (COA 1.0) Station
// Inspired by Investing Daddy's Mathematical Framework.
//
// Features:
// 1. Percentage Dominance & Shifting Matrix (100% Strong, >=75% WTT / WTB).
// 2. Chart of Accuracy (COA 1.0) 9-Scenario Classifier Banner.
// 3. Exact Dot-to-Dot Reversal Columns (Call Reversal & Put Reversal).
// 4. Mode Switcher: [LIVE AI-LTP] [09:20 STATIC] [STOCKS 4-LINE] [LTP BLAST SCREENER].
// 5. Key Levels Ribbon: EOS, S-Mod, EOR, R-Mod, Max Pain SL, Max Gain Target.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

import {
  getLtpCalculatorData,
  getLtpBlastStocks,
  getStockFourLineData,
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
import { TableSkeleton } from "@/components/ui/table-skeleton";
import type { OptionUnderlying } from "@/lib/option-chain/types";

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

type CalculatorMode = "LIVE" | "STATIC_0920" | "STOCKS_4LINE" | "LTP_BLAST";

function LtpCalculatorPage() {
  const [mode, setMode] = useState<CalculatorMode>("LIVE");
  const [underlying, setUnderlying] = useState<OptionUnderlying>("NIFTY");
  const [expiry, setExpiry] = useState<string>("");
  const [selectedStock, setSelectedStock] = useState<string>("RELIANCE");
  const [useMock, setUseMock] = useState(false);

  // Data states
  const [ltpData, setLtpData] = useState<LtpCalculatorOutput | null>(null);
  const [availableExpiries, setAvailableExpiries] = useState<readonly string[]>([]);
  const [blastStocks, setBlastStocks] = useState<StockFourLineLevels[]>([]);
  const [fourLineData, setFourLineData] = useState<StockFourLineLevels | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");

  const fetchLtpFn = useServerFn(getLtpCalculatorData);
  const fetchBlastFn = useServerFn(getLtpBlastStocks);
  const fetchFourLineFn = useServerFn(getStockFourLineData);

  // Load Main Index LTP Calculator
  const loadIndexLtp = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchLtpFn({
        data: {
          underlying,
          expiry: expiry || undefined,
          useMock,
        },
      });

      if (res.ok && res.data) {
        setLtpData(res.data);
        if (res.availableExpiries) setAvailableExpiries(res.availableExpiries);
        setLastRefreshed(new Date().toLocaleTimeString("en-IN"));
      } else {
        setErrorMsg(res.error ?? "Failed to load option chain data");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message.slice(0, 160) : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [fetchLtpFn, underlying, expiry, useMock]);

  // Load LTP Blast Screener Stocks
  const loadBlastScreener = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchBlastFn({ data: { filter: "ALL" } });
      if (res.ok && res.stocks) {
        setBlastStocks(res.stocks);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [fetchBlastFn]);

  // Load Single Stock 4-Line Data
  const loadStockFourLine = useCallback(
    async (sym: string) => {
      setLoading(true);
      try {
        const res = await fetchFourLineFn({ data: { symbol: sym } });
        if (res.ok && res.fourLine) {
          setFourLineData(res.fourLine);
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [fetchFourLineFn],
  );

  useEffect(() => {
    if (mode === "LIVE" || mode === "STATIC_0920") {
      loadIndexLtp();
    } else if (mode === "LTP_BLAST") {
      loadBlastScreener();
    } else if (mode === "STOCKS_4LINE") {
      loadStockFourLine(selectedStock);
    }
  }, [mode, underlying, expiry, selectedStock, loadIndexLtp, loadBlastScreener, loadStockFourLine]);

  // Active levels based on LIVE vs 09:20 STATIC
  const activeLevels: ReversalLevels | null = useMemo(() => {
    if (!ltpData) return null;
    if (mode === "STATIC_0920" && ltpData.static0920Snapshot) {
      return ltpData.static0920Snapshot;
    }
    return ltpData.reversalLevels;
  }, [ltpData, mode]);

  const coaScenario: CoaScenarioResult | null = ltpData?.coaScenario ?? null;

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
            Mathematical reversal & diversion engine inspired by Investing Daddy's COA 1.0 framework. Dot-to-dot reversal prices, 75% WTT/WTB shifting matrix, and 4-line F&O triggers.
          </p>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2.5">
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

          <button
            onClick={() => setUseMock((m) => !m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors border ${
              useMock
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
            }`}
          >
            {useMock ? "Mock Mode ON" : "Live Upstox Feed"}
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
      </div>

      {/* Main Content Area */}
      {(mode === "LIVE" || mode === "STATIC_0920") && (
        <div className="space-y-5">
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
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400 font-bold">EOS (SUPPORT)</div>
                  <div className="text-lg font-black text-emerald-300 mt-0.5">
                    ₹{activeLevels.eos.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Strike {activeLevels.supportStrike}
                  </div>
                </div>

                {/* S-Moderate */}
                <div className="p-3 rounded-xl bg-emerald-950/10 border border-emerald-500/20">
                  <div className="text-[10px] text-emerald-400 font-medium">S-MOD (SAFE BUY)</div>
                  <div className="text-lg font-black text-zinc-100 mt-0.5">
                    ₹{activeLevels.sModerate.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-emerald-400/80 mt-0.5">
                    Safe Support Entry
                  </div>
                </div>

                {/* EOR */}
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/30">
                  <div className="text-[10px] text-rose-400 font-bold">EOR (RESISTANCE)</div>
                  <div className="text-lg font-black text-rose-300 mt-0.5">
                    ₹{activeLevels.eor.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Strike {activeLevels.resistanceStrike}
                  </div>
                </div>

                {/* R-Moderate */}
                <div className="p-3 rounded-xl bg-rose-950/10 border border-rose-500/20">
                  <div className="text-[10px] text-rose-400 font-medium">R-MOD (SAFE SELL)</div>
                  <div className="text-lg font-black text-zinc-100 mt-0.5">
                    ₹{activeLevels.rModerate.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-rose-400/80 mt-0.5">
                    Safe Resistance Entry
                  </div>
                </div>

                {/* Max Pain / Stop Loss */}
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] text-amber-400 font-bold">MAX PAIN (SL)</div>
                  <div className="text-lg font-black text-rose-400 mt-0.5">
                    ₹{activeLevels.maxPainSl.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Next Strike Reversal
                  </div>
                </div>

                {/* Max Gain / Target */}
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <div className="text-[10px] text-cyan-400 font-bold">MAX GAIN (TP)</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">
                    ₹{activeLevels.maxGainTarget.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-zinc-400 mt-0.5">
                    Opposite Reversal
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Index Selector & Expiry Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-[#0c0e14]">
            <div className="flex items-center gap-3">
              <label className="text-xs font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                UNDERLYING:
                <select
                  value={underlying}
                  onChange={(e) => {
                    setUnderlying(e.target.value as OptionUnderlying);
                    setExpiry("");
                  }}
                  className="px-2.5 py-1 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono focus:outline-none focus:border-amber-500"
                >
                  <option value="NIFTY">NIFTY 50</option>
                  <option value="BANKNIFTY">BANK NIFTY</option>
                </select>
              </label>

              {availableExpiries.length > 0 && (
                <label className="text-xs font-mono text-zinc-400 font-semibold flex items-center gap-1.5">
                  EXPIRY:
                  <select
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="px-2.5 py-1 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Current Weekly Expiry</option>
                    {availableExpiries.map((exp) => (
                      <option key={exp} value={exp}>
                        {exp}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="text-xs font-mono text-zinc-400">
              {lastRefreshed && <span>Refreshed: {lastRefreshed} · </span>}
              <span className="text-amber-400 font-bold">
                SPOT: ₹{ltpData?.spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
