// Phase 36 — ICT Unicorn Multi-Asset Radar & SMT Divergence View
// Displays live algorithmic sweeps, market structure shifts (MSS), breaker/FVG retests,
// and cross-asset institutional SMT divergence correlation cards.

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  getUnicornRadar,
  getSMTDivergence,
  type UnicornSetup,
  type SMTDivergence,
} from "@/lib/orderflow/unicorn.functions";
import {
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  ExternalLink,
  ArrowUpRight,
  Radar,
} from "lucide-react";

export interface IctUnicornRadarViewProps {
  className?: string;
  defaultCategory?: string;
}

export function IctUnicornRadarView({
  className = "",
  defaultCategory = "ALL",
}: IctUnicornRadarViewProps) {
  const [radarCategory, setRadarCategory] = useState<string>(defaultCategory);

  const fetchUnicorn = useServerFn(getUnicornRadar);
  const fetchSMT = useServerFn(getSMTDivergence);

  const { data: radarSetups = [] } = useQuery<UnicornSetup[]>({
    queryKey: ["unicorn-radar-signals"],
    queryFn: () => fetchUnicorn(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: smtDivergences = [] } = useQuery<SMTDivergence[]>({
    queryKey: ["smt-divergence-signals"],
    queryFn: () => fetchSMT(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredRadarSetups = useMemo(() => {
    if (radarCategory === "ALL") return radarSetups;
    return radarSetups.filter((s) => s.category === radarCategory);
  }, [radarSetups, radarCategory]);

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Top Header / Context Ribbon */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Radar size={18} className="text-amber-400 animate-pulse" />
            <span>🦄 ICT Unicorn Multi-Asset Radar &amp; SMT Engine</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5 font-mono">
            Liquidity Sweeps · Displacement MSS · Breaker Blocks · FVG Discount/Premium Retests · SMT Divergence
          </p>
        </div>
        <Link
          to="/live-chart"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-mono font-semibold transition-all shrink-0 self-start sm:self-auto shadow-[0_0_12px_rgba(245,158,11,0.2)]"
        >
          <span>Open Live Chart</span>
          <ArrowUpRight size={14} />
        </Link>
      </div>

      {/* 1. SMT Divergence Correlation Monitor */}
      <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3 mb-3">
          <div>
            <h4 className="text-xs sm:text-sm font-mono font-bold text-amber-300 flex items-center gap-2">
              <Radio size={14} className="text-amber-400 animate-pulse" />
              SMT DIVERGENCE CORRELATION MONITOR (INSTITUTIONAL CRACKS)
            </h4>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Synchronous structural swing cracks between correlated asset pairs · Smart Money accumulation &amp; distribution
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 self-start sm:self-auto">
            {smtDivergences.length} ACTIVE SMT CORRELATIONS
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {smtDivergences.map((smt) => {
            const isBullish = smt.type === "BULLISH_SMT";
            return (
              <div
                key={smt.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 flex flex-col justify-between hover:border-amber-500/40 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-xs font-mono font-bold text-zinc-200">
                      {smt.pairName}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {smt.timeframe}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                        isBullish
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                          : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                      }`}
                    >
                      {isBullish ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {isBullish ? "BULLISH SMT DIVERGENCE" : "BEARISH SMT DIVERGENCE"}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono bg-zinc-900/60 p-2 rounded border border-zinc-800/80 mb-2">
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>{smt.asset1.name}:</span>
                      <span className="font-bold text-amber-300">
                        {smt.asset1.swingType} (₹{smt.asset1.swingBPrice.toLocaleString()})
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-zinc-300">
                      <span>{smt.asset2.name}:</span>
                      <span
                        className={`font-bold ${
                          isBullish ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {smt.asset2.swingType} (₹{smt.asset2.swingBPrice.toLocaleString()})
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-400 font-mono leading-relaxed line-clamp-2">
                    {smt.summary}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-zinc-500">{smt.targetLiquidity}</span>
                  <span className="text-amber-400 font-bold">
                    {smt.confidenceScore}% Confluence
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. ICT Unicorn Multi-Asset Algorithmic Scanner */}
      <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4">
          <div>
            <h4 className="text-xs sm:text-sm font-mono font-bold text-amber-300 flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              ICT UNICORN MULTI-ASSET SCANNER MATRIX
            </h4>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
              High-probability algorithmic setups across Indices, Sectors, 200+ F&amp;O Equities, ETFs, and Commodities/Crypto
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "ALL", label: `ALL (${radarSetups.length})` },
              { id: "INDEX", label: `INDICES (${radarSetups.filter((s) => s.category === "INDEX").length})` },
              { id: "SECTOR", label: `SECTORS (${radarSetups.filter((s) => s.category === "SECTOR").length})` },
              { id: "FO_EQUITY", label: `F&O (${radarSetups.filter((s) => s.category === "FO_EQUITY").length})` },
              { id: "ETF", label: `ETFS (${radarSetups.filter((s) => s.category === "ETF").length})` },
              { id: "COMMODITY_CRYPTO", label: `COMMODITY/CRYPTO (${radarSetups.filter((s) => s.category === "COMMODITY_CRYPTO").length})` },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setRadarCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                  radarCategory === cat.id
                    ? "bg-amber-500 text-black border border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                    : "text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 border border-zinc-800"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Setups Table */}
        {filteredRadarSetups.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-500">
            No active ICT Unicorn setups detected in the selected category.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Asset &amp; TF</th>
                  <th className="py-2.5 px-3">Setup &amp; Direction</th>
                  <th className="py-2.5 px-3">Trigger Zone (FVG)</th>
                  <th className="py-2.5 px-3">SL / Invalidation</th>
                  <th className="py-2.5 px-3">Target (ERL)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredRadarSetups.map((setup) => {
                  const isBullish = setup.direction === "BULLISH";
                  return (
                    <tr
                      key={setup.id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-zinc-100">
                            {setup.displayName}
                          </span>
                          <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                            {setup.timeframe}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {setup.symbol} · {setup.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            isBullish
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                              : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                          }`}
                        >
                          {setup.direction}
                        </span>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {setup.sweepType} @ {setup.sweepLevel.toLocaleString()}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-amber-300 font-bold">
                          {setup.triggerZone.low.toLocaleString()} – {setup.triggerZone.high.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-rose-400">
                        {setup.invalidationSL.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-400 font-bold">
                          {setup.targetPrice.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-1">
                          (1:{setup.riskRewardRatio.toFixed(1)} RR)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            setup.status === "Triggered"
                              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                              : setup.status === "Retest Ready"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)] animate-pulse"
                                : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                          }`}
                        >
                          {setup.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-400 text-[10px]">
                        {setup.timeElapsed}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <a
                          href={`/live-chart?symbol=${setup.symbol}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-medium rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                        >
                          Inspect Chart
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
