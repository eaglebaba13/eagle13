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

  return (
    <div className="absolute top-2 left-14 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg text-xs font-mono select-none shadow-xl pointer-events-none">
      {/* Symbol & Timeframe */}
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-zinc-100 font-sans tracking-wide">
          {instrument?.name ?? instrument?.symbol ?? "Symbol"}
        </span>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-amber-300">
          {intervalLabel}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-1 rounded bg-emerald-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            LIVE
          </span>
        ) : null}
      </div>

      <div className="hidden sm:block text-zinc-600">|</div>

      {/* OHLC Readout */}
      <div className="flex items-center gap-2 text-[11px]">
        <div>
          <span className="text-zinc-500">O </span>
          <span className="text-zinc-200">
            {currencySymbol}
            {o.toLocaleString("en-IN", { maximumFractionDigits: o < 10 ? 4 : 2 })}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">H </span>
          <span className="text-emerald-400">
            {currencySymbol}
            {h.toLocaleString("en-IN", { maximumFractionDigits: h < 10 ? 4 : 2 })}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">L </span>
          <span className="text-rose-400">
            {currencySymbol}
            {l.toLocaleString("en-IN", { maximumFractionDigits: l < 10 ? 4 : 2 })}
          </span>
        </div>
        <div>
          <span className="text-zinc-500">C </span>
          <span className={`font-semibold ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
            {currencySymbol}
            {c.toLocaleString("en-IN", { maximumFractionDigits: c < 10 ? 4 : 2 })}
          </span>
        </div>
      </div>

      {/* Change & Change% Badge */}
      <div
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
          isUp
            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
            : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
        }`}
      >
        {isUp ? "+" : ""}
        {change.toFixed(2)} ({isUp ? "+" : ""}
        {changePct.toFixed(2)}%)
      </div>

      {/* Volume */}
      {vol != null && vol > 0 ? (
        <div className="hidden md:flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-500">Vol:</span>
          <span>{vol >= 1000000 ? `${(vol / 1000000).toFixed(2)}M` : vol >= 1000 ? `${(vol / 1000).toFixed(1)}K` : vol}</span>
        </div>
      ) : null}
    </div>
  );
}
