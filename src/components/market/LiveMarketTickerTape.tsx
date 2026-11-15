import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLiveCandleSSE, type LiveSSEState } from "@/hooks/use-live-candle-sse";
import { getMarketData, type IndexQuote } from "@/lib/market.functions";
import { resolveUpstoxDailyChange } from "@/lib/upstox-quote-mapper";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface TickerItemData {
  symbol: string;
  ltp: number | null;
  change: number | null;
  changePct: number | null;
}

export function buildTickerItem(
  symbol: string,
  expectedSymbol: string,
  state: LiveSSEState,
  candidate?: IndexQuote | null,
): TickerItemData {
  const quote = candidate?.symbol === expectedSymbol ? candidate : null;
  const daily = quote?.dailyQuote?.source === "UPSTOX" ? quote.dailyQuote : null;
  const status = state.status;
  const liveTime = Date.parse(status?.lastTick ?? "");
  const quoteTime = Date.parse(quote?.providerTime ?? "");
  const useLive = status?.provider === "UPSTOX_V3_WS" && status.lastLtp != null &&
    !(Number.isFinite(quoteTime) && (!Number.isFinite(liveTime) || liveTime < quoteTime));
  const ltp = useLive ? status.lastLtp : quote?.livePrice ?? null;
  const delta = resolveUpstoxDailyChange({
    lastPrice: ltp,
    change: useLive ? status.change : daily?.change,
    changePct: useLive ? status.changePct : daily?.changePct,
    prevClose: daily?.prevClose,
  });
  return { symbol, ltp, ...delta };
}

export const LiveMarketTickerTape = memo(function LiveMarketTickerTape() {
  const { state: nifty } = useLiveCandleSSE("NIFTY50", 60000);
  const { state: bank } = useLiveCandleSSE("BANKNIFTY", 60000);
  const { state: sensex } = useLiveCandleSSE("SENSEX", 60000);
  const { state: vix } = useLiveCandleSSE("INDIA_VIX", 60000);
  const { data } = useQuery({
    queryKey: ["market-data"],
    queryFn: () => getMarketData(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const items = [
    buildTickerItem("NIFTY 50", "^NSEI", nifty, data?.nifty),
    buildTickerItem("BANK NIFTY", "^NSEBANK", bank, data?.banknifty),
    buildTickerItem("BSE SENSEX", "^BSESN", sensex, data?.sensex),
    buildTickerItem("INDIA VIX", "^INDIAVIX", vix, data?.vix),
  ];
  const isStreaming = [nifty, bank, sensex, vix].some(
    (state) => state.connected && state.status?.provider === "UPSTOX_V3_WS" && state.status.freshness === "LIVE",
  );

  return (
    <div aria-label="Live market ticker" className="relative z-20 flex h-8 w-full select-none items-center overflow-hidden border-b border-white/10 dark:border-white/10 border-slate-200 bg-slate-100 dark:bg-zinc-950/90 text-xs backdrop-blur-md">
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-slate-200 dark:border-white/10 bg-slate-200 dark:bg-zinc-950/95 px-3 py-1 shadow-md">
        <span className={`h-2 w-2 rounded-full ${isStreaming ? "bg-emerald-500" : "bg-amber-400"}`} />
        <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-800 dark:text-zinc-300">
          {isStreaming ? "UPSTOX V3 LIVE" : "UPSTOX / LAST QUOTE"}
        </span>
      </div>
      <div className="eb-ticker relative flex flex-1 overflow-hidden">
        <div className="eb-ticker-track flex items-center gap-8 whitespace-nowrap">
          {[0, 1].map((track) => items.map((item) => {
            const positive = item.change !== null && item.change > 0;
            const negative = item.change !== null && item.change < 0;
            return (
              <div key={`${track}-${item.symbol}`} aria-hidden={track === 1 ? true : undefined} className="inline-flex items-center gap-2 font-mono">
                <span className="font-bold tracking-wide text-slate-700 dark:text-zinc-300">{item.symbol}</span>
                <span className="font-semibold text-slate-950 dark:text-zinc-100">
                  {item.ltp === null ? "-" : item.ltp.toLocaleString("en-IN", {
                    minimumFractionDigits: item.symbol === "INDIA VIX" ? 2 : 1,
                    maximumFractionDigits: item.symbol === "INDIA VIX" ? 2 : 1,
                  })}
                </span>
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${positive ? "text-emerald-500 dark:text-emerald-400" : negative ? "text-rose-500 dark:text-rose-400" : "text-slate-500 dark:text-zinc-400"}`}>
                  {positive ? <TrendingUp size={12} /> : negative ? <TrendingDown size={12} /> : null}
                  {item.change === null ? "-" : `${positive ? "+" : ""}${item.change.toFixed(1)}`}
                  {" ("}{item.changePct === null ? "-" : `${item.changePct.toFixed(2)}%`}{")"}
                </span>
                <span className="text-slate-400 dark:text-zinc-600">·</span>
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
});
