import { memo, useMemo } from "react";
import { useLiveCandleSSE } from "@/hooks/use-live-candle-sse";
import { TrendingUp, TrendingDown, Activity, Sparkles, ShieldCheck } from "lucide-react";

export interface TickerItemData {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
  badge?: string;
  isPositive?: boolean;
}

export const LiveMarketTickerTape = memo(function LiveMarketTickerTape() {
  const { state: niftyState } = useLiveCandleSSE("NIFTY50", 60000);
  const { state: bankNiftyState } = useLiveCandleSSE("BANKNIFTY", 60000);
  const { state: sensexState } = useLiveCandleSSE("SENSEX", 60000);
  const { state: vixState } = useLiveCandleSSE("INDIA_VIX", 60000);

  // Derive live or baseline quotes
  const niftyLtp = niftyState.currentCandle?.close ?? niftyState.status?.lastLtp ?? 23960.6;
  const niftyOpen = niftyState.currentCandle?.open ?? 23910.0;
  const niftyChange = niftyLtp - niftyOpen;
  const niftyChangePct = (niftyChange / niftyOpen) * 100;

  const bankLtp = bankNiftyState.currentCandle?.close ?? bankNiftyState.status?.lastLtp ?? 55913.6;
  const bankOpen = bankNiftyState.currentCandle?.open ?? 55750.0;
  const bankChange = bankLtp - bankOpen;
  const bankChangePct = (bankChange / bankOpen) * 100;

  const sensexLtp = sensexState.currentCandle?.close ?? sensexState.status?.lastLtp ?? 80234.0;
  const sensexOpen = sensexState.currentCandle?.open ?? 80100.0;
  const sensexChange = sensexLtp - sensexOpen;
  const sensexChangePct = (sensexChange / sensexOpen) * 100;

  const vixVal = vixState.currentCandle?.close ?? vixState.status?.lastLtp ?? 13.72;

  const isStreaming =
    niftyState.connected || bankNiftyState.connected || sensexState.connected || vixState.connected;

  const items: TickerItemData[] = useMemo(
    () => [
      {
        symbol: "NIFTY 50",
        name: "NSE Benchmark",
        ltp: niftyLtp,
        change: niftyChange,
        changePct: niftyChangePct,
        isPositive: niftyChange >= 0,
      },
      {
        symbol: "BANK NIFTY",
        name: "Banking Index",
        ltp: bankLtp,
        change: bankChange,
        changePct: bankChangePct,
        isPositive: bankChange >= 0,
      },
      {
        symbol: "BSE SENSEX",
        name: "BSE Benchmark",
        ltp: sensexLtp,
        change: sensexChange,
        changePct: sensexChangePct,
        isPositive: sensexChange >= 0,
      },
      {
        symbol: "INDIA VIX",
        name: "Volatility Index",
        ltp: vixVal,
        change: -0.18,
        changePct: -1.29,
        badge: vixVal < 15 ? "LOW VOLATILITY" : vixVal < 20 ? "NORMAL VOL" : "HIGH VOL",
        isPositive: false,
      },
      {
        symbol: "COMBINED PCR",
        name: "Options Put-Call Ratio",
        ltp: 1.08,
        change: 0.04,
        changePct: 3.8,
        badge: "MILD BULLISH",
        isPositive: true,
      },
      {
        symbol: "CPR RANGE",
        name: "Daily Central Pivot",
        ltp: 23950.0,
        change: 45.0,
        changePct: 0.19,
        badge: "TC: 24,010 · BC: 23,890",
        isPositive: true,
      },
      {
        symbol: "ASTRO HARMONIC",
        name: "Planetary Turning Window",
        ltp: 180.0,
        change: 0.0,
        changePct: 0.0,
        badge: "REVERSAL WINDOW ACTIVE",
        isPositive: true,
      },
      {
        symbol: "SMC REGIME",
        name: "Order Flow Bias",
        ltp: 1.25,
        change: 0.12,
        changePct: 10.6,
        badge: "INSTITUTIONAL ACCUMULATION",
        isPositive: true,
      },
    ],
    [
      niftyLtp,
      niftyChange,
      niftyChangePct,
      bankLtp,
      bankChange,
      bankChangePct,
      sensexLtp,
      sensexChange,
      sensexChangePct,
      vixVal,
    ],
  );

  return (
    <div className="relative flex h-8 w-full items-center overflow-hidden border-b border-white/10 bg-zinc-950/90 text-xs backdrop-blur-md select-none z-20">
      {/* Pinned Left Status Indicator */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 border-r border-white/10 bg-zinc-950/95 px-3 py-1 shadow-md">
        <span className="relative flex h-2 w-2">
          {isStreaming ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500/80" />
          )}
        </span>
        <span className="font-mono text-[10px] font-semibold tracking-wider text-emerald-400">
          UPSTOX V3 LIVE
        </span>
      </div>

      {/* Scrolling Ticker Track */}
      <div className="eb-ticker relative flex flex-1 overflow-hidden" style={{ width: "100%" }}>
        <div className="eb-ticker-track flex items-center gap-8 whitespace-nowrap">
          {/* First pass */}
          {items.map((item, idx) => (
            <div key={`track1-${item.symbol}-${idx}`} className="inline-flex items-center gap-2 font-mono">
              <span className="font-bold text-zinc-300 tracking-wide">{item.symbol}</span>
              <span className="font-semibold text-zinc-100">
                {item.symbol === "COMBINED PCR" || item.symbol === "SMC REGIME" || item.symbol === "INDIA VIX"
                  ? item.ltp.toFixed(2)
                  : item.symbol === "ASTRO HARMONIC"
                  ? `${item.ltp.toFixed(0)}°`
                  : item.ltp.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              {item.badge ? (
                <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {item.badge}
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                    item.isPositive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {item.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {item.isPositive ? "+" : ""}
                  {item.change.toFixed(1)} ({item.changePct.toFixed(2)}%)
                </span>
              )}
              <span className="text-zinc-600">·</span>
            </div>
          ))}

          {/* Duplicated track for infinite smooth loop */}
          {items.map((item, idx) => (
            <div key={`track2-${item.symbol}-${idx}`} className="inline-flex items-center gap-2 font-mono">
              <span className="font-bold text-zinc-300 tracking-wide">{item.symbol}</span>
              <span className="font-semibold text-zinc-100">
                {item.symbol === "COMBINED PCR" || item.symbol === "SMC REGIME" || item.symbol === "INDIA VIX"
                  ? item.ltp.toFixed(2)
                  : item.symbol === "ASTRO HARMONIC"
                  ? `${item.ltp.toFixed(0)}°`
                  : item.ltp.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              {item.badge ? (
                <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {item.badge}
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                    item.isPositive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {item.isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {item.isPositive ? "+" : ""}
                  {item.change.toFixed(1)} ({item.changePct.toFixed(2)}%)
                </span>
              )}
              <span className="text-zinc-600">·</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
