import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  foBanStatusQuery,
  refreshFoBanStatus,
  dispatchFoBanAlertNow,
  type FoBanSecurity,
} from "@/lib/market-data/fo-ban.functions";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Send,
  ExternalLink,
  Search,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Info,
  Clock,
  Layers,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/fo-ban-list")({
  head: () => ({
    meta: [
      { title: "🚫 NSE F&O Ban & MWPL Tracker — Institutional Terminal | EagleBABA" },
      {
        name: "description",
        content:
          "Live NSE Market-Wide Position Limit (MWPL) and F&O Ban list tracker with 95% ban threshold alert, 80% exit watch, and pre-market Telegram intelligence.",
      },
    ],
  }),
  component: FoBanListPage,
});

function FoBanListPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "IN_BAN" | "UPCOMING" | "UNBANNED">("ALL");
  const [telegramStatus, setTelegramStatus] = useState<string | null>(null);

  const { data: report, isLoading, isFetching, refetch } = useQuery(foBanStatusQuery());

  const refreshMutation = useMutation({
    mutationFn: () => refreshFoBanStatus(),
    onSuccess: (newReport) => {
      queryClient.setQueryData(["fo-ban-mwpl-report"], newReport);
    },
  });

  const telegramMutation = useMutation({
    mutationFn: () => dispatchFoBanAlertNow(),
    onSuccess: (res) => {
      setTelegramStatus(res.message);
      setTimeout(() => setTelegramStatus(null), 5000);
    },
    onError: (err: any) => {
      setTelegramStatus(`Failed: ${err.message ?? "Network error"}`);
      setTimeout(() => setTelegramStatus(null), 5000);
    },
  });

  // Filter lists based on search query
  const query = searchQuery.trim().toLowerCase();
  const filterList = (list?: readonly FoBanSecurity[]) => {
    if (!list) return [];
    if (!query) return list;
    return list.filter(
      (item) => item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
    );
  };

  const filteredInBan = useMemo(() => filterList(report?.inBan), [report?.inBan, query]);
  const filteredUpcoming = useMemo(() => filterList(report?.upcomingBan), [report?.upcomingBan, query]);
  const filteredUnbanned = useMemo(() => filterList(report?.recentlyUnbanned), [report?.recentlyUnbanned, query]);

  const lastUpdated = report?.fetchedAt
    ? new Date(report.fetchedAt).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--:--:--";

  return (
    <div className="min-h-screen bg-[#08090C] text-zinc-100 p-3 sm:p-6 lg:p-8 font-sans">
      {/* Background radial glow */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent" />

      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)]">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>NSE F&O Ban List & MWPL Tracker</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-widest font-bold">
                    Official NSE
                  </span>
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">
                  Real-time Market-Wide Position Limit (MWPL) Monitoring • 95% Ban Rule • 80% Exit Watch • Upstox V3 Live Feeds
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons & Status Indicators */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Feed Status Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-zinc-400">Feed:</span>
              <span className="text-amber-400 font-bold">{report?.source ?? "NSE_LIVE"}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{lastUpdated} IST</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium transition-colors border border-zinc-700 disabled:opacity-50"
              title="Force sync official CSV from NSE Archives"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending || isFetching ? "animate-spin text-amber-400" : ""}`} />
              <span>Refresh</span>
            </button>

            {/* Dispatch to Telegram */}
            <button
              onClick={() => telegramMutation.mutate()}
              disabled={telegramMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)] disabled:opacity-50"
              title="Send formatted alert to @EagleBABAAIBOT"
            >
              <Send className={`w-3.5 h-3.5 ${telegramMutation.isPending ? "animate-pulse" : ""}`} />
              <span>{telegramMutation.isPending ? "Dispatching..." : "Send Alert"}</span>
            </button>
          </div>
        </div>

        {/* Telegram Feedback Banner */}
        {telegramStatus && (
          <div className="mt-3 p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/50 text-cyan-200 text-xs font-mono flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>{telegramStatus}</span>
            </div>
            <button onClick={() => setTelegramStatus(null)} className="text-zinc-400 hover:text-white">
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Top KPI Summary Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Card 1: Currently in Ban */}
        <div className="p-4 rounded-xl bg-[#0E1015] border border-rose-500/40 shadow-[0_0_20px_rgba(244,63,94,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl group-hover:bg-rose-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-rose-300 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              Currently In Ban
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-500/40">
              ≥ 95% MWPL
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {report?.inBanCount ?? 0}
            </span>
            <span className="text-xs text-rose-400 font-mono font-medium">Securities Banned</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            Fresh derivative positions strictly prohibited by NSE. Only squaring off permitted.
          </p>
        </div>

        {/* Card 2: Upcoming Ban (>80% MWPL) */}
        <div className="p-4 rounded-xl bg-[#0E1015] border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Near Ban Watchlist
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/40">
              80.0% – 94.9%
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {report?.upcomingBanCount ?? 0}
            </span>
            <span className="text-xs text-amber-400 font-mono font-medium">Possible Entrants</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            High open interest concentration approaching the 95% cutoff trigger.
          </p>
        </div>

        {/* Card 3: Recently Unbanned */}
        <div className="p-4 rounded-xl bg-[#0E1015] border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Recently Unbanned
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
              &lt; 80.0% MWPL
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {report?.recentlyUnbannedCount ?? 0}
            </span>
            <span className="text-xs text-emerald-400 font-mono font-medium">Exit Watch</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            Cooled down below 80% MWPL threshold. Fresh positions legally unlocked.
          </p>
        </div>

        {/* Card 4: F&O Universe Monitored */}
        <div className="p-4 rounded-xl bg-[#0E1015] border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.1)] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-300 font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              F&O Contracts
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-500/40">
              NSE Universe
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {report?.totalFoTracked ?? 200}+
            </span>
            <span className="text-xs text-cyan-400 font-mono font-medium">Instruments Active</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            Automated sync with NSE derivative participants & daily CC position limits.
          </p>
        </div>
      </div>

      {/* Search & Section Tab Navigation */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0E1015] p-3 rounded-xl border border-zinc-800">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                activeTab === "ALL"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-xs"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              All Tracked
            </button>
            <button
              onClick={() => setActiveTab("IN_BAN")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "IN_BAN"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-xs"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <span>🚫 Currently In Ban</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-rose-950 text-rose-300 border border-rose-500/40">
                {report?.inBanCount ?? 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("UPCOMING")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "UPCOMING"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-xs"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <span>⚠️ Near Ban (&gt;80%)</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-950 text-amber-300 border border-amber-500/40">
                {report?.upcomingBanCount ?? 0}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("UNBANNED")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "UNBANNED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-xs"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
              }`}
            >
              <span>✅ Recently Unbanned</span>
              <span className="px-1.5 py-0.2 text-[10px] rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                {report?.recentlyUnbannedCount ?? 0}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search symbol / company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-zinc-900 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 font-mono outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Main Content Sections */}
      <div className="max-w-7xl mx-auto space-y-8">
        {/* SECTION 1: CURRENTLY IN F&O BAN */}
        {(activeTab === "ALL" || activeTab === "IN_BAN") && (
          <div className="rounded-xl bg-[#0E1015] border border-rose-500/30 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-rose-950/20">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  1. Currently In F&O Ban Period (MWPL ≥ 95.0%)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                  {filteredInBan.length} Stock{filteredInBan.length === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-xs text-rose-300/80 font-mono">
                Fresh derivative positions strictly prohibited by exchange
              </span>
            </div>

            {filteredInBan.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 font-mono text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-zinc-300 font-bold">No Securities Currently in Ban</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  All 200+ NSE F&O contracts are open for fresh position building.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Symbol / Name</th>
                      <th className="py-3 px-4">Sector</th>
                      <th className="py-3 px-4">MWPL %</th>
                      <th className="py-3 px-4">Days In Ban</th>
                      <th className="py-3 px-4">Live LTP</th>
                      <th className="py-3 px-4">Day Change</th>
                      <th className="py-3 px-4">Regulatory Action</th>
                      <th className="py-3 px-4 text-right">Terminal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredInBan.map((sec) => (
                      <tr key={sec.symbol} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-300 font-mono text-sm">{sec.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-500/50">
                              BAN
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-normal font-sans mt-0.5 truncate max-w-[180px]">
                            {sec.name}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">{sec.sector}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-rose-500 to-rose-400"
                                style={{ width: `${Math.min(100, sec.mwplPercent)}%` }}
                              />
                            </div>
                            <span className="text-rose-400 font-bold">{sec.mwplPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-200">
                            Day {sec.daysInBan || 1}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-cyan-300">
                          ₹{sec.currentLtp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4">
                          {sec.dayChangePct !== undefined ? (
                            <span
                              className={`flex items-center gap-1 font-bold ${
                                sec.dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {sec.dayChangePct >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              <span>{sec.dayChangePct >= 0 ? "+" : ""}{sec.dayChangePct.toFixed(2)}%</span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[11px] text-rose-300/90 font-medium font-sans">
                            Square-off Only (No fresh OI)
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={`/live-chart?symbol=${sec.symbol}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
                          >
                            <span>Chart</span>
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: UPCOMING BAN WATCHLIST (80.0% - 94.9% MWPL) */}
        {(activeTab === "ALL" || activeTab === "UPCOMING") && (
          <div className="rounded-xl bg-[#0E1015] border border-amber-500/30 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-950/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  2. Upcoming Ban Watchlist (80.0% – 94.9% MWPL)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  {filteredUpcoming.length} Stock{filteredUpcoming.length === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-xs text-amber-300/80 font-mono">
                Sorted by highest MWPL % (approaching 95% threshold)
              </span>
            </div>

            {filteredUpcoming.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 font-mono text-xs">
                <Info className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-80" />
                <p className="text-zinc-300 font-bold">No Securities in Near-Ban Zone</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  All active F&O stocks currently have open interest below 80% MWPL.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Symbol / Name</th>
                      <th className="py-3 px-4">Sector</th>
                      <th className="py-3 px-4">Current MWPL %</th>
                      <th className="py-3 px-4">Distance To 95% Ban</th>
                      <th className="py-3 px-4">Risk Severity</th>
                      <th className="py-3 px-4">Live LTP</th>
                      <th className="py-3 px-4">Day Change</th>
                      <th className="py-3 px-4 text-right">Terminal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredUpcoming.map((sec) => (
                      <tr key={sec.symbol} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-300 font-mono text-sm">{sec.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/50">
                              NEAR BAN
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-normal font-sans mt-0.5 truncate max-w-[180px]">
                            {sec.name}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">{sec.sector}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                                style={{ width: `${Math.min(100, sec.mwplPercent)}%` }}
                              />
                            </div>
                            <span className="text-amber-400 font-bold">{sec.mwplPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-amber-300 font-bold font-mono">
                            {sec.distanceToBan !== undefined ? `${sec.distanceToBan.toFixed(1)}%` : "--"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {sec.mwplPercent >= 90.0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-500/40 text-rose-300 font-bold text-[10px]">
                              HIGH RISK (&gt;90%)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                              WATCH (80-90%)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-cyan-300">
                          ₹{sec.currentLtp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4">
                          {sec.dayChangePct !== undefined ? (
                            <span
                              className={`flex items-center gap-1 font-bold ${
                                sec.dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {sec.dayChangePct >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              <span>{sec.dayChangePct >= 0 ? "+" : ""}{sec.dayChangePct.toFixed(2)}%</span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={`/live-chart?symbol=${sec.symbol}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
                          >
                            <span>Chart</span>
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: RECENTLY UNBANNED STOCKS (EXIT WATCH) */}
        {(activeTab === "ALL" || activeTab === "UNBANNED") && (
          <div className="rounded-xl bg-[#0E1015] border border-emerald-500/30 overflow-hidden shadow-lg">
            <div className="p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white tracking-wide">
                  3. Recently Unbanned Stocks (Dropped Below 80.0% MWPL)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                  {filteredUnbanned.length} Stock{filteredUnbanned.length === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-xs text-emerald-300/80 font-mono">
                Fresh positioning officially permitted after cooling down
              </span>
            </div>

            {filteredUnbanned.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 font-mono text-xs">
                <Info className="w-8 h-8 text-zinc-500 mx-auto mb-2 opacity-80" />
                <p className="text-zinc-300 font-bold">No Stocks Recently Unbanned Today</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Stocks must drop below 80% MWPL after being in ban to qualify for unbanning.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Symbol / Name</th>
                      <th className="py-3 px-4">Sector</th>
                      <th className="py-3 px-4">Current MWPL %</th>
                      <th className="py-3 px-4">Previous Ban Duration</th>
                      <th className="py-3 px-4">Entry Status</th>
                      <th className="py-3 px-4">Live LTP</th>
                      <th className="py-3 px-4">Day Change</th>
                      <th className="py-3 px-4 text-right">Terminal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredUnbanned.map((sec) => (
                      <tr key={sec.symbol} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-300 font-mono text-sm">{sec.symbol}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                              UNBANNED
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-normal font-sans mt-0.5 truncate max-w-[180px]">
                            {sec.name}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">{sec.sector}</td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-24 h-2 rounded-full bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                                style={{ width: `${Math.min(100, sec.mwplPercent)}%` }}
                              />
                            </div>
                            <span className="text-emerald-400 font-bold">{sec.mwplPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-300">
                          {sec.previousBanDays ? `${sec.previousBanDays} trading sessions` : "1 session"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>FRESH ENTRY ELIGIBLE</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-cyan-300">
                          ₹{sec.currentLtp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4">
                          {sec.dayChangePct !== undefined ? (
                            <span
                              className={`flex items-center gap-1 font-bold ${
                                sec.dayChangePct >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {sec.dayChangePct >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              <span>{sec.dayChangePct >= 0 ? "+" : ""}{sec.dayChangePct.toFixed(2)}%</span>
                            </span>
                          ) : (
                            <span className="text-zinc-500">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <a
                            href={`/live-chart?symbol=${sec.symbol}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
                          >
                            <span>Chart</span>
                            <ExternalLink className="w-3 h-3 text-amber-400" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Regulatory Educational Note */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 font-sans space-y-2">
          <div className="flex items-center gap-2 text-zinc-200 font-bold font-mono">
            <Info className="w-4 h-4 text-amber-400" />
            <span>SEBI & NSE Regulatory Framework for F&O Ban & MWPL</span>
          </div>
          <p>
            • <strong>Ban Trigger:</strong> A security enters the F&O ban period when the aggregate open interest (across all exchanges and contracts) crosses <strong>95%</strong> of its Market-Wide Position Limit (MWPL).
          </p>
          <p>
            • <strong>Ban Restrictions:</strong> During the ban period, no fresh long or short positions can be initiated by any client or trading member in any derivative contract of that security. Any increase in open interest attracts heavy exchange penalties.
          </p>
          <p>
            • <strong>Unban Condition:</strong> A banned security exits the ban period only when its aggregate open interest cools down below <strong>80%</strong> of its MWPL.
          </p>
        </div>
      </div>
    </div>
  );
}
