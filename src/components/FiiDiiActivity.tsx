import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { fiiDiiQuery, type FiiDiiRow } from "@/lib/fiidii.functions";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const fmtCr = (n: number | undefined | null) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "₹0 Cr";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString("en-IN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  return `${sign}₹${abs} Cr`;
};

const fmtContracts = (n: number | undefined | null) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${sign}${abs}`;
};

function SentimentBadge({ sentiment }: { sentiment?: string }) {
  const s = sentiment ?? "NEUTRAL";
  if (s === "BULLISH") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
        BULLISH
      </span>
    );
  }
  if (s === "MILDLY_BULLISH") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
        <TrendingUp className="w-3.5 h-3.5 text-teal-300" />
        MILDLY BULLISH
      </span>
    );
  }
  if (s === "BEARISH") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
        BEARISH
      </span>
    );
  }
  if (s === "MILDLY_BEARISH") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <TrendingDown className="w-3.5 h-3.5 text-amber-300" />
        MILDLY BEARISH
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/50">
      <Activity className="w-3.5 h-3.5 text-zinc-400" />
      NEUTRAL
    </span>
  );
}

function NetCell({ value }: { value: number }) {
  const isPos = value > 0;
  const isNeg = value < 0;
  const color = isPos ? "text-emerald-400" : isNeg ? "text-rose-400" : "text-zinc-400";
  return (
    <td className={`px-3 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap ${color}`}>
      {fmtCr(value)}
    </td>
  );
}

function ContractsCell({ value }: { value: number }) {
  const isPos = value > 0;
  const isNeg = value < 0;
  const color = isPos ? "text-emerald-400" : isNeg ? "text-rose-400" : "text-zinc-400";
  return (
    <td className={`px-3 py-2.5 text-right font-mono text-xs font-semibold whitespace-nowrap ${color}`}>
      {fmtContracts(value)}
    </td>
  );
}

export function FiiDiiActivity() {
  const { data, isFetching } = useSuspenseQuery(fiiDiiQuery());
  const [showAllRows, setShowAllRows] = useState(false);

  const fii = data.fii ?? { buy: 0, sell: 0, net: 0 };
  const dii = data.dii ?? { buy: 0, sell: 0, net: 0 };
  const fno = data.fno ?? {
    fiiIndexFuturesNet: 0,
    fiiIndexOptionsNet: 0,
    sentiment: "NEUTRAL",
  };
  const status = data.status ?? "EOD_CONFIRMED";
  const rows = data.rows ?? [];
  const combinedNet = fii.net + dii.net;
  const isLive = status === "LIVE";

  const displayedRows = showAllRows ? rows : rows.slice(0, 5);

  return (
    <section
      aria-label="FII and DII activity"
      className="card-institutional bg-zinc-900/50 border border-amber-500/20 backdrop-blur-md rounded-xl p-4 sm:p-5 transition-all hover:border-amber-500/40 shadow-xl"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-4 border-b border-zinc-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Landmark className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm sm:text-base font-bold text-zinc-100 tracking-wider">
                {"FII & DII INSTITUTIONAL FLOWS"}
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                  isLive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                {isLive ? "LIVE SESSION" : "EOD CONFIRMED"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
              <Calendar className="w-3 h-3 text-zinc-500" />
              <span>Session: {data.date || "Latest"}</span>
              <span className="text-zinc-600">•</span>
              <span>{isFetching ? "↻ Refreshing…" : "₹ Crore Cash · F&O OI"}</span>
            </div>
          </div>
        </div>

        {/* Sentiment & Combined Flow summary */}
        <div className="flex items-center gap-2.5 sm:self-center">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
              Institutional Sentiment
            </span>
            <div className="mt-0.5">
              <SentimentBadge sentiment={fno.sentiment} />
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Institutional Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {/* FII / FPI Flow Card */}
        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-2">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-300/90">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              FII / FPI Cash Flow
            </span>
            <span className="text-[10px] text-zinc-500">Foreign Flow</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono ${
                fii.net > 0
                  ? "text-emerald-400"
                  : fii.net < 0
                    ? "text-rose-400"
                    : "text-zinc-300"
              }`}
            >
              {fmtCr(fii.net)}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400">
              {fii.net > 0 ? "Net Buyers" : fii.net < 0 ? "Net Sellers" : "Flat"}
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>
              Buy: <span className="text-zinc-200">₹{fii.buy.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr</span>
            </span>
            <span>
              Sell: <span className="text-zinc-200">₹{fii.sell.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr</span>
            </span>
          </div>
        </div>

        {/* DII Domestic Flow Card */}
        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-2">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-300/90">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              DII Domestic Flow
            </span>
            <span className="text-[10px] text-zinc-500">Domestic Flow</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span
              className={`text-xl sm:text-2xl font-bold font-mono ${
                dii.net > 0
                  ? "text-emerald-400"
                  : dii.net < 0
                    ? "text-rose-400"
                    : "text-zinc-300"
              }`}
            >
              {fmtCr(dii.net)}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wide text-zinc-400">
              {dii.net > 0 ? "Net Buyers" : dii.net < 0 ? "Net Sellers" : "Flat"}
            </span>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>
              Buy: <span className="text-zinc-200">₹{dii.buy.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr</span>
            </span>
            <span>
              Sell: <span className="text-zinc-200">₹{dii.sell.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr</span>
            </span>
          </div>
        </div>

        {/* F&O Derivatives (FII OI) Card */}
        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-2">
            <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-amber-300/90">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              {"F&O Derivatives (OI)"}
            </span>
            <span className="text-[10px] text-zinc-500">NSE Contracts</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-zinc-400">Index Futures Net:</span>
              <span
                className={`font-bold ${
                  fno.fiiIndexFuturesNet > 0
                    ? "text-emerald-400"
                    : fno.fiiIndexFuturesNet < 0
                      ? "text-rose-400"
                      : "text-zinc-300"
                }`}
              >
                {fmtContracts(fno.fiiIndexFuturesNet)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs font-mono">
              <span className="text-zinc-400">Index Options Net:</span>
              <span
                className={`font-bold ${
                  fno.fiiIndexOptionsNet > 0
                    ? "text-emerald-400"
                    : fno.fiiIndexOptionsNet < 0
                      ? "text-rose-400"
                      : "text-zinc-300"
                }`}
              >
                {fmtContracts(fno.fiiIndexOptionsNet)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>Net Flow (FII+DII):</span>
            <span
              className={`font-bold ${
                combinedNet > 0
                  ? "text-emerald-400"
                  : combinedNet < 0
                    ? "text-rose-400"
                    : "text-zinc-300"
              }`}
            >
              {fmtCr(combinedNet)}
            </span>
          </div>
        </div>
      </div>

      {/* Historical Sessions Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80">
          <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
            Recent Trading Sessions Flow History
          </span>
          {rows.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllRows((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              {showAllRows ? (
                <>
                  <span>Show Top 5</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>View All ({rows.length})</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-400 bg-zinc-900/30">
                <th className="px-3.5 py-2.5 text-left font-bold">Session Date</th>
                <th className="px-3.5 py-2.5 text-right font-bold">FII Cash Net</th>
                <th className="px-3.5 py-2.5 text-right font-bold">DII Cash Net</th>
                <th className="px-3.5 py-2.5 text-right font-bold">FII Fut (OI)</th>
                <th className="px-3.5 py-2.5 text-right font-bold">Combined Flow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {displayedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-xs font-mono text-zinc-500"
                  >
                    No historical records available.
                  </td>
                </tr>
              ) : (
                displayedRows.map((r: FiiDiiRow) => {
                  const comb = (r.fiiCash ?? 0) + (r.diiCash ?? 0);
                  return (
                    <tr
                      key={r.date}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 font-mono text-xs font-semibold text-zinc-200 whitespace-nowrap">
                        {r.label || r.date}
                      </td>
                      <NetCell value={r.fiiCash} />
                      <NetCell value={r.diiCash} />
                      <ContractsCell value={r.fiiFuture} />
                      <NetCell value={comb} />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
