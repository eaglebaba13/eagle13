// Phase 38 — Stocks 4-Line Mode Visualizer (P2, P1, C1, C2)
// EagleBABA proprietary 4-line institutional framework for F&O equities.

import React from "react";
import { Target, ShieldAlert, ArrowUpRight, ArrowDownRight, Layers, ExternalLink, Zap } from "lucide-react";
import type { StockFourLineLevels } from "@/lib/options/ltp-calculator-engine.server";

interface StockFourLineCardProps {
  readonly fourLine: StockFourLineLevels;
  readonly onSelectSymbol?: (symbol: string) => void;
  readonly availableSymbols?: readonly string[];
}

export function StockFourLineCard({
  fourLine,
  onSelectSymbol,
  availableSymbols = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "AUBANK",
    "PNB",
    "TATASTEEL",
    "BHARTIARTL",
    "ITC",
  ],
}: StockFourLineCardProps) {
  const {
    symbol,
    name,
    sector,
    ltp,
    p2,
    p1,
    c1,
    c2,
    bullishEntry,
    bullishSl,
    bullishTarget1,
    bullishTarget2,
    bearishEntry,
    bearishSl,
    bearishTarget1,
    bearishTarget2,
    bullishRisk,
    bearishRisk,
    nearestLine,
    distanceToNearestPct,
  } = fourLine;

  // Percentage height for visual line ladder
  const range = Math.max(1, p2 - c2);
  const getPercent = (val: number) => {
    const raw = ((val - c2) / range) * 100;
    return Math.max(5, Math.min(95, raw));
  };

  const ltpPercent = getPercent(ltp);

  return (
    <div className="w-full space-y-4">
      {/* Symbol Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-zinc-800 bg-[#0f121a]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-mono text-zinc-400 font-semibold mr-1">WATCHLIST:</span>
          {availableSymbols.map((s) => (
            <button
              key={s}
              onClick={() => onSelectSymbol?.(s)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors ${
                s === symbol
                  ? "bg-amber-500 text-black font-bold shadow-sm"
                  : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <a
          href={`/live-chart?symbol=${symbol}&p2=${p2.toFixed(2)}&p1=${p1.toFixed(2)}&c1=${c1.toFixed(2)}&c2=${c2.toFixed(2)}`}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-mono text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
          Plot 4-Lines on Chart
        </a>
      </div>

      {/* Main 4-Line Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Visual Ladder Panel */}
        <div className="lg:col-span-5 p-5 rounded-xl border border-zinc-800 bg-[#0c0e14] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-zinc-100 font-mono">{symbol}</h3>
                <p className="text-[11px] text-zinc-500 font-mono">{name} · {sector}</p>
              </div>
              <div className="text-right font-mono">
                <div className="text-xl font-bold text-amber-400">
                  ₹{ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-zinc-400">
                  Nearest: <span className="font-bold text-zinc-200">{nearestLine}</span> ({distanceToNearestPct.toFixed(2)}%)
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-400 mb-6">
              Institutional 4-Line Boundary Framework: P2 (Top Res), P1 (Inner Res), C1 (Inner Sup), C2 (Bottom Sup).
            </p>
          </div>

          {/* Visual Lines Ladder */}
          <div className="relative h-64 w-full bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4 font-mono select-none">
            {/* P2 Line */}
            <div className="absolute left-3 right-3 top-3 border-b-2 border-dashed border-rose-500/80 flex items-center justify-between text-xs pb-1">
              <span className="text-rose-400 font-bold bg-zinc-900/90 px-1.5 rounded">
                P2 (TOP RESISTANCE)
              </span>
              <span className="text-rose-300 font-bold bg-zinc-900/90 px-1.5 rounded">
                ₹{p2.toFixed(2)}
              </span>
            </div>

            {/* P1 Line */}
            <div className="absolute left-3 right-3 top-20 border-b-2 border-rose-500 flex items-center justify-between text-xs pb-1">
              <span className="text-rose-400 font-bold bg-zinc-900/90 px-1.5 rounded">
                P1 (INNER RESISTANCE)
              </span>
              <span className="text-rose-300 font-bold bg-zinc-900/90 px-1.5 rounded">
                ₹{p1.toFixed(2)}
              </span>
            </div>

            {/* Dynamic Live Price Marker */}
            <div
              className="absolute left-1 right-1 border-y border-amber-400 bg-amber-500/20 px-3 py-1 flex items-center justify-between text-xs font-bold text-amber-300 transition-all duration-300 z-10"
              style={{ bottom: `${ltpPercent}%` }}
            >
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                LIVE SPOT LTP
              </span>
              <span>₹{ltp.toFixed(2)}</span>
            </div>

            {/* C1 Line */}
            <div className="absolute left-3 right-3 bottom-20 border-b-2 border-emerald-500 flex items-center justify-between text-xs pb-1">
              <span className="text-emerald-400 font-bold bg-zinc-900/90 px-1.5 rounded">
                C1 (INNER SUPPORT)
              </span>
              <span className="text-emerald-300 font-bold bg-zinc-900/90 px-1.5 rounded">
                ₹{c1.toFixed(2)}
              </span>
            </div>

            {/* C2 Line */}
            <div className="absolute left-3 right-3 bottom-3 border-b-2 border-dashed border-emerald-500/80 flex items-center justify-between text-xs pb-1">
              <span className="text-emerald-400 font-bold bg-zinc-900/90 px-1.5 rounded">
                C2 (BOTTOM SUPPORT)
              </span>
              <span className="text-emerald-300 font-bold bg-zinc-900/90 px-1.5 rounded">
                ₹{c2.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Execution Blueprint Panels */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
          {/* Bullish Trade Plan (Long / CE) */}
          <div className="p-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-emerald-900/40 pb-2 mb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <ArrowUpRight className="w-4 h-4" />
                  BULLISH LONG BLUEPRINT
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  RISK: {bullishRisk} / 4
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Entry Trigger Zone:</span>
                  <span className="font-bold text-emerald-300">₹{c1.toFixed(2)} (or ₹{c2.toFixed(2)})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Target 1 (P1):</span>
                  <span className="font-bold text-zinc-100">₹{bullishTarget1.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Target 2 (P2 Max Gain):</span>
                  <span className="font-bold text-emerald-400">₹{bullishTarget2.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Stop Loss (Max Pain):</span>
                  <span className="font-bold text-rose-400">₹{bullishSl.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-900/40 text-[11px] text-zinc-400">
              💡 <span className="text-zinc-200">Rule:</span> Buy Call only when price touches C1/C2 with Bullish Risk ≤ 1. Exit 50% at P1, hold balance to P2.
            </div>
          </div>

          {/* Bearish Trade Plan (Short / PE) */}
          <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-rose-900/40 pb-2 mb-3">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                  <ArrowDownRight className="w-4 h-4" />
                  BEARISH SHORT BLUEPRINT
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  RISK: {bearishRisk} / 4
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Entry Trigger Zone:</span>
                  <span className="font-bold text-rose-300">₹{p1.toFixed(2)} (or ₹{p2.toFixed(2)})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Target 1 (C1):</span>
                  <span className="font-bold text-zinc-100">₹{bearishTarget1.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Target 2 (C2 Max Gain):</span>
                  <span className="font-bold text-rose-400">₹{bearishTarget2.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Stop Loss (Max Pain):</span>
                  <span className="font-bold text-rose-400">₹{bearishSl.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-rose-900/40 text-[11px] text-zinc-400">
              💡 <span className="text-zinc-200">Rule:</span> Buy Put only when price touches P1/P2 with Bearish Risk ≤ 1. Exit 50% at C1, hold balance to C2.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
