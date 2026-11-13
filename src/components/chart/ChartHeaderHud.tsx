import React from "react";
import type { HudData } from "./TradingViewLightweightChart";
import type { UniversalInstrument } from "@/lib/market-data/fo-universe";

interface ChartHeaderHudProps {
  readonly instrument: UniversalInstrument | null;
  readonly intervalLabel: string;
  readonly hud: HudData | null;
  readonly latestCandle?: {
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume?: number | null;
  } | null;
  readonly isLive: boolean;
}

export function ChartHeaderHud({
  instrument,
  intervalLabel,
  hud,
  latestCandle,
  isLive,
}: ChartHeaderHudProps) {
  const activeOhlc = hud ?? latestCandle;
  if (!activeOhlc) return null;

  const o = activeOhlc.open;
  const h = activeOhlc.high;
  const l = activeOhlc.low;
  const c = activeOhlc.close;
  const change = c - o;
  const changePct = o > 0 ? (change / o) * 100 : 0;
  const isUp = change >= 0;
  const vol = hud?.volume ?? latestCandle?.volume;

  const currencySymbol =
    instrument?.currency === "INR" ? "₹" : instrument?.currency === "USDT" ? "₮" : "$";

  const formatPrice = (val: number) => {
    return `${currencySymbol}${val.toLocaleString("en-IN", {
      maximumFractionDigits: val < 10 ? 4 : 2,
    })}`;
  };

  const formatVol = (v: number) => {
    if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(2)}Cr`;
    if (v >= 100_000) return `${(v / 100_000).toFixed(2)}L`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  return (
    <div className="absolute top-1.5 left-12 z-20 flex items-center gap-2.5 px-3 py-1 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-md text-[11px] font-mono select-none shadow-lg pointer-events-none whitespace-nowrap overflow-hidden text-zinc-300">
      {/* Symbol & Timeframe */}
      <span className="font-bold text-amber-300 font-sans tracking-wide">
        {instrument?.name ?? instrument?.symbol ?? "Symbol"}
      </span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-zinc-300">
        {intervalLabel}
      </span>
      {isLive ? (
        <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-semibold px-1 rounded bg-emerald-500/10">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          LIVE
        </span>
      ) : null}

      <span className="text-zinc-600 hidden sm:inline">|</span>

      {/* Sleek 1-Line Compact OHLC */}
      <span>
        O: <strong className="text-zinc-100 font-medium">{formatPrice(o)}</strong>
      </span>
      <span>
        H: <strong className="text-emerald-400 font-medium">{formatPrice(h)}</strong>
      </span>
      <span>
        L: <strong className="text-rose-400 font-medium">{formatPrice(l)}</strong>
      </span>
      <span>
        C: <strong className={`${isUp ? "text-emerald-400" : "text-rose-400"} font-medium`}>{formatPrice(c)}</strong>
      </span>

      {/* Change & Change% Badge */}
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          isUp
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
        }`}
      >
        {isUp ? "+" : ""}
        {change.toFixed(2)} ({isUp ? "+" : ""}
        {changePct.toFixed(2)}%)
      </span>

      {/* Volume */}
      {vol != null && vol > 0 ? (
        <span className="hidden xl:inline text-zinc-400">
          <span className="text-zinc-600">·</span> Vol: <strong className="text-zinc-300 font-medium">{formatVol(vol)}</strong>
        </span>
      ) : null}
    </div>
  );
}
