// Phase 38 — LTP Blast F&O Stock Screener Modal & View
// Scans 200+ F&O universe for stocks trading at critical P1/P2 or C1/C2 trigger lines with Risk <= 1.

import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Zap, Target, ShieldAlert, ArrowUpRight, ArrowDownRight, RefreshCw, Filter, ExternalLink } from "lucide-react";
import type { StockFourLineLevels } from "@/lib/options/ltp-calculator-engine.server";

interface LtpBlastScreenerProps {
  readonly stocks: readonly StockFourLineLevels[];
  readonly isLoading: boolean;
  readonly onRefresh: () => void;
  readonly lastUpdated?: string;
  readonly onSelectStock?: (symbol: string) => void;
}

export function LtpBlastScreener({
  stocks,
  isLoading,
  onRefresh,
  lastUpdated,
  onSelectStock,
}: LtpBlastScreenerProps) {
  const [filter, setFilter] = useState<"ALL" | "BULLISH" | "BEARISH">("ALL");
  const [search, setSearch] = useState("");

  const filtered = stocks.filter((s) => {
    if (filter === "BULLISH" && s.triggerType !== "BULLISH_C1_C2") return false;
    if (filter === "BEARISH" && s.triggerType !== "BEARISH_P1_P2") return false;
    if (search) {
      const q = search.toUpperCase();
      return s.symbol.includes(q) || s.name.toUpperCase().includes(q) || s.sector.toUpperCase().includes(q);
    }
    return true;
  });

  const bullishCount = stocks.filter((s) => s.triggerType === "BULLISH_C1_C2").length;
  const bearishCount = stocks.filter((s) => s.triggerType === "BEARISH_P1_P2").length;

  return (
    <div className="w-full space-y-4">
      {/* Controls & Metrics Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-[#0f121a]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-zinc-100 font-mono tracking-tight">
                LTP BLAST F&O SCREENER
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                200+ UNIVERSE
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              F&O stocks near P1/P2 or C1/C2 triggers. Review the displayed risk; All Triggers includes moderate-risk candidates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-mono text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors ${
              filter === "ALL"
                ? "bg-amber-500 text-black font-bold shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            All Triggers ({stocks.length})
          </button>
          <button
            onClick={() => setFilter("BULLISH")}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors inline-flex items-center gap-1 ${
              filter === "BULLISH"
                ? "bg-emerald-500 text-black font-bold shadow-sm"
                : "text-zinc-400 hover:text-emerald-400"
            }`}
          >
            🟢 Bullish at C1/C2 ({bullishCount})
          </button>
          <button
            onClick={() => setFilter("BEARISH")}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors inline-flex items-center gap-1 ${
              filter === "BEARISH"
                ? "bg-rose-500 text-black font-bold shadow-sm"
                : "text-zinc-400 hover:text-rose-400"
            }`}
          >
            🔴 Bearish at P1/P2 ({bearishCount})
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search stock, sector..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 px-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      {/* Table */}
      <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-[#0c0e14]">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-[#121620] text-zinc-400 text-[11px] font-semibold">
              <th className="py-2.5 px-3">SYMBOL</th>
              <th className="py-2.5 px-3 text-right">LTP (₹)</th>
              <th className="py-2.5 px-3 text-center">TRIGGER LINE</th>
              <th className="py-2.5 px-3 text-right">DIST %</th>
              <th className="py-2.5 px-3 text-center">RISK</th>
              <th className="py-2.5 px-3 text-center">SIGNAL / ACTION</th>
              <th className="py-2.5 px-3 text-right">TARGET (₹)</th>
              <th className="py-2.5 px-3 text-right">STOP LOSS (₹)</th>
              <th className="py-2.5 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-zinc-500 font-mono text-xs">
                  {isLoading ? "Scanning 200+ F&O stocks..." : "No stocks currently matching trigger criteria."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const isBull = s.triggerType === "BULLISH_C1_C2";
                const riskVal = isBull ? s.bullishRisk : s.bearishRisk;

                const riskBadge =
                  riskVal === 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      0 · PRIME
                    </span>
                  ) : riskVal === 1 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      1 · LOW RISK
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400">
                      {riskVal} · MODERATE
                    </span>
                  );

                const lineBadge =
                  s.nearestLine === "C1" || s.nearestLine === "C2" ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 font-bold">
                      {s.nearestLine} (₹{s.nearestLine === "C1" ? s.c1 : s.c2})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-500/30 font-bold">
                      {s.nearestLine} (₹{s.nearestLine === "P1" ? s.p1 : s.p2})
                    </span>
                  );

                return (
                  <tr
                    key={s.symbol}
                    className="hover:bg-zinc-800/20 transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-100">{s.symbol}</span>
                        <span className="text-[10px] text-zinc-500">{s.sector}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-zinc-200">
                      ₹{s.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {lineBadge}
                    </td>
                    <td className="py-2.5 px-3 text-right text-zinc-300 font-medium">
                      {s.distanceToNearestPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {riskBadge}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">
                      {isBull ? (
                        <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          BUY CALL ({s.nearestLine})
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          BUY PUT ({s.nearestLine})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-emerald-400">
                      ₹{isBull ? s.bullishTarget1 : s.bearishTarget1}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-rose-400">
                      ₹{isBull ? s.bullishSl : s.bearishSl}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {onSelectStock && (
                          <button
                            onClick={() => onSelectStock(s.symbol)}
                            className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
                          >
                            4-Lines
                          </button>
                        )}
                        <a
                          href={`/live-chart?symbol=${s.symbol}`}
                          className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                          title="Open Live Chart"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
