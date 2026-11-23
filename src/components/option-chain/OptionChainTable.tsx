// Phase 38 — Institutional AI LTP Calculator & Option Chain Table
// Implements exact dot-to-dot reversal prices, COA 1.0 dominance highlights (Gold 100%, Cyan WTT ↗, Rose WTB ↘),
// and live ATM spot line.

import React from "react";
import { ArrowUpRight, ArrowDownRight, Target, ShieldAlert, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import type { StrikeDominance, ReversalLevels, CoaScenarioResult } from "@/lib/options/ltp-calculator-engine.server";
import type { StrikeIntelligenceOverlay } from "@/lib/analytics/optionChainIntelligence";

interface OptionChainTableProps {
  readonly callStrikes: readonly StrikeDominance[];
  readonly putStrikes: readonly StrikeDominance[];
  readonly spotPrice: number;
  readonly atmStrike: number;
  readonly reversalLevels: ReversalLevels;
  readonly coaScenario: CoaScenarioResult;
  readonly onSelectStrike?: (strike: number) => void;
  readonly strikeDepth?: number;
  readonly currencySymbol?: string;
  readonly strikeOverlays?: ReadonlyMap<number, StrikeIntelligenceOverlay>;
}

export function OptionChainTable({
  callStrikes,
  putStrikes,
  spotPrice,
  atmStrike,
  reversalLevels,
  coaScenario,
  onSelectStrike,
  strikeDepth = 10,
  currencySymbol = "₹",
  strikeOverlays,
}: OptionChainTableProps) {
  // Combine strikes
  const strikes = React.useMemo(() => {
    const list: Array<{
      strike: number;
      call: StrikeDominance;
      put: StrikeDominance;
      isAtm: boolean;
    }> = [];

    const callMap = new Map<number, StrikeDominance>();
    for (const c of callStrikes) callMap.set(c.strike, c);

    const putMap = new Map<number, StrikeDominance>();
    for (const p of putStrikes) putMap.set(p.strike, p);

    const allStrikeNumbers = Array.from(new Set([...callMap.keys(), ...putMap.keys()])).sort((a, b) => a - b);

    for (const k of allStrikeNumbers) {
      const call = callMap.get(k) ?? {
        strike: k,
        volume: 0,
        volPct: 0,
        oi: 0,
        oiPct: 0,
        ltp: 0,
        iv: null,
        isMaxVol: false,
        isMaxOi: false,
        isWttVol: false,
        isWtbVol: false,
        isWttOi: false,
        isWtbOi: false,
        reversalPrice: k,
      };

      const put = putMap.get(k) ?? {
        strike: k,
        volume: 0,
        volPct: 0,
        oi: 0,
        oiPct: 0,
        ltp: 0,
        iv: null,
        isMaxVol: false,
        isMaxOi: false,
        isWttVol: false,
        isWtbVol: false,
        isWttOi: false,
        isWtbOi: false,
        reversalPrice: k,
      };

      list.push({
        strike: k,
        call,
        put,
        isAtm: k === atmStrike,
      });
    }

    return list;
  }, [callStrikes, putStrikes, atmStrike]);

  const visibleStrikes = React.useMemo(() => {
    if (!strikes || strikes.length === 0) return [];
    if (!strikeDepth || strikeDepth <= 0) return strikes;

    // Find ATM index: match isAtm or exact atmStrike, or closest strike to spotPrice/atmStrike
    let atmIndex = strikes.findIndex((s) => s.isAtm || s.strike === atmStrike);
    if (atmIndex === -1) {
      const target = atmStrike > 0 ? atmStrike : spotPrice;
      let minDiff = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < strikes.length; i++) {
        const diff = Math.abs(strikes[i].strike - target);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }
      atmIndex = bestIdx;
    }

    const start = Math.max(0, atmIndex - strikeDepth);
    const end = Math.min(strikes.length, atmIndex + strikeDepth + 1);
    const sliced = strikes.slice(start, end);

    // Ensure at least one row in the slice is marked as ATM
    if (!sliced.some((s) => s.isAtm)) {
      const target = atmStrike > 0 ? atmStrike : spotPrice;
      let minDiff = Infinity;
      let bestSliceIdx = 0;
      for (let i = 0; i < sliced.length; i++) {
        const diff = Math.abs(sliced[i].strike - target);
        if (diff < minDiff) {
          minDiff = diff;
          bestSliceIdx = i;
        }
      }
      return sliced.map((s, idx) => (idx === bestSliceIdx ? { ...s, isAtm: true } : s));
    }
    return sliced;
  }, [strikes, atmStrike, spotPrice, strikeDepth]);

  // Exactly ONE single index in visibleStrikes where the spot divider is rendered
  const spotDividerIndex = React.useMemo(() => {
    if (!visibleStrikes || visibleStrikes.length === 0 || spotPrice <= 0) return -1;
    // Find first strike strictly greater than spotPrice
    const firstAboveIdx = visibleStrikes.findIndex((s) => s.strike > spotPrice);
    if (firstAboveIdx !== -1) return firstAboveIdx;
    // If all visible strikes are <= spotPrice, place at visibleStrikes.length
    return visibleStrikes.length;
  }, [visibleStrikes, spotPrice]);

  const fmt = (n: number | null | undefined): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    return n >= 1000000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString("en-IN");
  };

  const fmtPrice = (n: number | null | undefined): string => {
    if (n == null || !Number.isFinite(n)) return "—";
    return `${currencySymbol}${n.toFixed(2)}`;
  };

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-zinc-800 bg-[#0c0e14] shadow-2xl">
      <table className="w-full border-collapse text-left font-mono text-xs select-none">
        <thead>
          <tr className="border-b border-zinc-800 bg-[#121620] text-zinc-400 font-semibold tracking-wider text-[11px]">
            <th colSpan={5} className="py-2.5 px-3 text-center border-r border-zinc-800 text-emerald-400 bg-emerald-950/20">
              CALLS (RESISTANCE SIDE)
            </th>
            <th className="py-2.5 px-3 text-center bg-zinc-900 text-amber-300 font-bold border-r border-zinc-800">
              STRIKE
            </th>
            <th colSpan={5} className="py-2.5 px-3 text-center text-rose-400 bg-rose-950/20">
              PUTS (SUPPORT SIDE)
            </th>
          </tr>
          <tr className="border-b border-zinc-800 bg-[#161a26] text-zinc-400 text-[10px]">
            <th className="py-2 px-2 text-right">OI</th>
            <th className="py-2 px-2 text-right">Vol</th>
            <th className="py-2 px-2 text-right">IV</th>
            <th className="py-2 px-2 text-right">LTP</th>
            <th className="py-2 px-2.5 text-right font-bold text-cyan-300 bg-cyan-950/30 border-r border-zinc-800">
              CALL REVERSAL
            </th>
            <th className="py-2 px-3 text-center font-bold text-zinc-100 bg-zinc-900/80 border-r border-zinc-800">
              STRIKE
            </th>
            <th className="py-2 px-2.5 text-left font-bold text-rose-300 bg-rose-950/30 border-r border-zinc-800">
              PUT REVERSAL
            </th>
            <th className="py-2 px-2 text-left">LTP</th>
            <th className="py-2 px-2 text-left">IV</th>
            <th className="py-2 px-2 text-left">Vol</th>
            <th className="py-2 px-2 text-left">OI</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {visibleStrikes.map((row, idx) => {
            const isAtm = row.isAtm;
            const isEos = row.strike === reversalLevels.supportStrike;
            const isEor = row.strike === reversalLevels.resistanceStrike;
            const overlay = strikeOverlays?.get(row.strike);

            // Call highlight styling
            let callVolClass = "text-zinc-300";
            let callVolBadge: React.ReactNode = null;
            if (row.call.isMaxVol) {
              callVolClass = "bg-amber-500/20 text-amber-300 font-bold";
              callVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  100%
                </span>
              );
            } else if (row.call.isWttVol) {
              callVolClass = "bg-cyan-500/20 text-cyan-300 font-medium";
              callVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 inline-flex items-center">
                  {row.call.volPct}% ↗
                </span>
              );
            } else if (row.call.isWtbVol) {
              callVolClass = "bg-rose-500/20 text-rose-300 font-medium";
              callVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-400/20 text-rose-300 border border-rose-400/40 inline-flex items-center">
                  {row.call.volPct}% ↘
                </span>
              );
            }

            let callOiClass = "text-zinc-300";
            let callOiBadge: React.ReactNode = null;
            if (row.call.isMaxOi) {
              callOiClass = "bg-amber-500/20 text-amber-300 font-bold";
              callOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  100%
                </span>
              );
            } else if (row.call.isWttOi) {
              callOiClass = "bg-cyan-500/20 text-cyan-300 font-medium";
              callOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 inline-flex items-center">
                  {row.call.oiPct}% ↗
                </span>
              );
            } else if (row.call.isWtbOi) {
              callOiClass = "bg-rose-500/20 text-rose-300 font-medium";
              callOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-400/20 text-rose-300 border border-rose-400/40 inline-flex items-center">
                  {row.call.oiPct}% ↘
                </span>
              );
            }

            // Put highlight styling
            let putVolClass = "text-zinc-300";
            let putVolBadge: React.ReactNode = null;
            if (row.put.isMaxVol) {
              putVolClass = "bg-amber-500/20 text-amber-300 font-bold";
              putVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  100%
                </span>
              );
            } else if (row.put.isWttVol) {
              putVolClass = "bg-cyan-500/20 text-cyan-300 font-medium";
              putVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 inline-flex items-center">
                  {row.put.volPct}% ↗
                </span>
              );
            } else if (row.put.isWtbVol) {
              putVolClass = "bg-rose-500/20 text-rose-300 font-medium";
              putVolBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-400/20 text-rose-300 border border-rose-400/40 inline-flex items-center">
                  {row.put.volPct}% ↘
                </span>
              );
            }

            let putOiClass = "text-zinc-300";
            let putOiBadge: React.ReactNode = null;
            if (row.put.isMaxOi) {
              putOiClass = "bg-amber-500/20 text-amber-300 font-bold";
              putOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  100%
                </span>
              );
            } else if (row.put.isWttOi) {
              putOiClass = "bg-cyan-500/20 text-cyan-300 font-medium";
              putOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 inline-flex items-center">
                  {row.put.oiPct}% ↗
                </span>
              );
            } else if (row.put.isWtbOi) {
              putOiClass = "bg-rose-500/20 text-rose-300 font-medium";
              putOiBadge = (
                <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-400/20 text-rose-300 border border-rose-400/40 inline-flex items-center">
                  {row.put.oiPct}% ↘
                </span>
              );
            }

            const rowBg = isAtm
              ? "bg-amber-950/20 border-y border-amber-500/40"
              : isEor
              ? "bg-rose-950/10"
              : isEos
              ? "bg-emerald-950/10"
              : "hover:bg-zinc-800/30 transition-colors";

            return (
              <React.Fragment key={row.strike}>
                {/* Spot divider inserted strictly once before the first strike above spot */}
                {idx === spotDividerIndex && spotPrice > 0 && (
                  <tr className="bg-gradient-to-r from-cyan-950/60 via-amber-950/60 to-rose-950/60 border-y border-amber-400/40">
                    <td colSpan={11} className="py-1 px-4 text-center">
                      <div className="flex items-center justify-center gap-3 text-amber-300 text-[11px] font-bold">
                        <span className="w-16 h-px bg-amber-400/40" />
                        <span>
                          ● SPOT PRICE: {currencySymbol}
                          {spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal">
                          (ATM Strike: {atmStrike})
                        </span>
                        <span className="w-16 h-px bg-amber-400/40" />
                      </div>
                    </td>
                  </tr>
                )}

                <tr className={rowBg} onClick={() => onSelectStrike?.(row.strike)}>
                  {/* Call Side */}
                  <td className={`py-2 px-2 text-right ${callOiClass}`}>
                    {fmt(row.call.oi)}
                    {callOiBadge}
                  </td>
                  <td className={`py-2 px-2 text-right ${callVolClass}`}>
                    {fmt(row.call.volume)}
                    {callVolBadge}
                  </td>
                  <td className="py-2 px-2 text-right text-zinc-400">
                    {row.call.iv ? `${row.call.iv.toFixed(1)}%` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-emerald-400">
                    {fmtPrice(row.call.ltp)}
                  </td>
                  <td className="py-2 px-2.5 text-right font-bold text-cyan-300 bg-cyan-950/20 border-r border-zinc-800">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-900/40 border border-cyan-500/30 text-[11px]">
                      {fmtPrice(row.call.reversalPrice)}
                    </span>
                    {overlay?.isPazRes && (
                      <span className="ml-1 text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/50 uppercase tracking-wider">
                        PAZ-Res
                      </span>
                    )}
                    {isEor && !overlay?.isPazRes && (
                      <span className="ml-1 text-[8px] font-extrabold text-rose-400 uppercase tracking-wider">
                        [EOR]
                      </span>
                    )}
                    {overlay && (overlay.isCallAnchorChallenger || (overlay.callPdiPct >= 75 && !overlay.isPazRes)) && (
                      <div className="text-[9px] text-cyan-400 font-mono mt-0.5 flex items-center justify-end gap-1">
                        <span className="h-1 bg-cyan-400/80 rounded-full inline-block" style={{ width: `${Math.min(30, overlay.callPdiPct * 0.3)}px` }} />
                        <span>{overlay.callPdiLabel}</span>
                      </div>
                    )}
                  </td>

                  {/* Strike Column */}
                  <td className="py-2 px-3 text-center font-bold text-zinc-100 bg-zinc-900/90 border-r border-zinc-800">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{row.strike.toLocaleString("en-IN")}</span>
                      {isAtm && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ATM
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Put Side */}
                  <td className="py-2 px-2.5 text-left font-bold text-rose-300 bg-rose-950/20 border-r border-zinc-800">
                    <span className="px-1.5 py-0.5 rounded bg-rose-900/40 border border-rose-500/30 text-[11px]">
                      {fmtPrice(row.put.reversalPrice)}
                    </span>
                    {overlay?.isPazSup && (
                      <span className="ml-1 text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 uppercase tracking-wider">
                        PAZ-Sup
                      </span>
                    )}
                    {isEos && !overlay?.isPazSup && (
                      <span className="ml-1 text-[8px] font-extrabold text-emerald-400 uppercase tracking-wider">
                        [EOS]
                      </span>
                    )}
                    {overlay && (overlay.isPutAnchorChallenger || (overlay.putPdiPct >= 75 && !overlay.isPazSup)) && (
                      <div className="text-[9px] text-rose-400 font-mono mt-0.5 flex items-center justify-start gap-1">
                        <span className="h-1 bg-rose-400/80 rounded-full inline-block" style={{ width: `${Math.min(30, overlay.putPdiPct * 0.3)}px` }} />
                        <span>{overlay.putPdiLabel}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-left font-medium text-rose-400">
                    {fmtPrice(row.put.ltp)}
                  </td>
                  <td className="py-2 px-2 text-left text-zinc-400">
                    {row.put.iv ? `${row.put.iv.toFixed(1)}%` : "—"}
                  </td>
                  <td className={`py-2 px-2 text-left ${putVolClass}`}>
                    {fmt(row.put.volume)}
                    {putVolBadge}
                  </td>
                  <td className={`py-2 px-2 text-left ${putOiClass}`}>
                    {fmt(row.put.oi)}
                    {putOiBadge}
                  </td>
                </tr>

                {/* If spot price is above all visible strikes, render strictly once after the final row */}
                {idx === visibleStrikes.length - 1 && spotDividerIndex === visibleStrikes.length && spotPrice > 0 && (
                  <tr className="bg-gradient-to-r from-cyan-950/60 via-amber-950/60 to-rose-950/60 border-y border-amber-400/40">
                    <td colSpan={11} className="py-1 px-4 text-center">
                      <div className="flex items-center justify-center gap-3 text-amber-300 text-[11px] font-bold">
                        <span className="w-16 h-px bg-amber-400/40" />
                        <span>
                          ● SPOT PRICE: {currencySymbol}
                          {spotPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal">
                          (ATM Strike: {atmStrike})
                        </span>
                        <span className="w-16 h-px bg-amber-400/40" />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
