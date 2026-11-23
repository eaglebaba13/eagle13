import React, { useMemo } from "react";
import type { HudData } from "./TradingViewLightweightChart";
import type { UniversalInstrument } from "@/lib/market-data/fo-universe";
import type { LtpCalculatorOutput } from "@/lib/options/ltp-calculator-engine.server";
import { buildShiftingChartLevels } from "@/lib/chart/ltp-overlay";

interface ChartHeaderHudProps {
  readonly instrument: UniversalInstrument | null;
  readonly intervalLabel: string;
  readonly hud: HudData | null;
  readonly latestCandle?: {
    readonly time?: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume?: number | null;
  } | null;
  readonly isLive: boolean;
  readonly ltpData?: LtpCalculatorOutput | null;
  readonly ltpState?: "hidden" | "loading" | "unavailable" | "ready";
  readonly ltpProvider?: string;
  readonly ltpQuality?: string;
  readonly prevClose?: number | null;
}

export function ChartHeaderHud({
  instrument,
  intervalLabel,
  hud,
  latestCandle,
  isLive,
  ltpData,
  ltpState = "hidden",
  ltpProvider,
  ltpQuality,
  prevClose,
}: ChartHeaderHudProps) {
  const activeOhlc = hud ?? latestCandle;
  const isCrosshairActive = hud != null;
  const t = hud?.time ?? latestCandle?.time;
  const shiftingLevels = useMemo(() => buildShiftingChartLevels(ltpData ?? null), [ltpData]);

  const istTimeStr = useMemo(() => {
    if (!t || !Number.isFinite(t)) return null;
    try {
      const date = new Date(t > 1e11 ? t : t * 1000);
      if (isNaN(date.getTime())) return null;
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return null;
    }
  }, [t]);

  if (!activeOhlc) return null;

  const o = activeOhlc.open;
  const c = activeOhlc.close;
  const h = Math.max(activeOhlc.high, o, c);
  const l = Math.min(activeOhlc.low, o, c);

  const baseline =
    !isCrosshairActive && prevClose != null && prevClose > 0
      ? prevClose
      : o;
  const change = Number.isFinite(c) && Number.isFinite(baseline) ? c - baseline : 0;
  const changePct = Number.isFinite(baseline) && baseline > 0 ? (change / baseline) * 100 : 0;
  const isUp = change >= 0;
  const vol = hud?.volume ?? latestCandle?.volume;

  const isUsd = Boolean(
    instrument?.currency === "USD" ||
      instrument?.currency === "USDT" ||
      (instrument?.symbol &&
        /^(BTCUSDT|ETHUSDT|SOLUSDT|XRPUSDT|GC1!|SI1!|GOLD|SILVER)$/i.test(instrument.symbol)),
  );
  const currencySymbol = isUsd ? "$" : "₹";

  const formatPrice = (val?: number | null) => {
    if (val == null || !Number.isFinite(val)) return "--";
    return `${currencySymbol}${val.toLocaleString(isUsd ? "en-US" : "en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: val < 10 ? 4 : 2,
    })}`;
  };

  const formatVol = (v?: number | null) => {
    if (v == null || !Number.isFinite(v)) return "--";
    if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(2)}Cr`;
    if (v >= 100_000) return `${(v / 100_000).toFixed(2)}L`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  return (
    <div className="absolute top-1.5 left-12 right-2 z-20 max-w-full font-mono text-[11px] select-none pointer-events-none text-zinc-300">
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-1 bg-zinc-950/90 backdrop-blur-md border border-white/10 rounded-md shadow-lg">
      {/* Symbol & Timeframe */}
      <span className="font-bold text-amber-300 font-sans tracking-wide">
        {instrument?.name ?? instrument?.symbol ?? "Symbol"}
      </span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-zinc-300">
        {intervalLabel}
      </span>
      {istTimeStr ? (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-amber-300/90 bg-amber-500/10 border border-amber-500/20">
          {istTimeStr} IST
        </span>
      ) : null}
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
    {ltpState !== "hidden" && (
      <div role="status" aria-label="AI-LTP COA 1.0" className="mt-1 rounded-md border border-amber-500/20 bg-zinc-950/95 px-3 py-1.5 shadow-lg pointer-events-auto">
        {ltpState === "loading" ? <span className="text-amber-300">AI-LTP COA 1.0 · Loading calculator snapshot…</span> :
          !ltpData ? <span className="text-amber-300">AI-LTP COA 1.0 · Calculator unavailable</span> : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[9px] font-bold tracking-wider text-zinc-500">AI-LTP COA 1.0</span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${ltpData.coaScenario.color === "emerald" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : ltpData.coaScenario.color === "rose" ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                {ltpData.coaScenario.name} ({ltpData.coaScenario.tag})
              </span>
              <span>Support: <strong>{ltpData.coaScenario.supportState}</strong> ({ltpData.reversalLevels.supportStrike} PE)</span>
              <span>Resistance: <strong>{ltpData.coaScenario.resistanceState}</strong> ({ltpData.reversalLevels.resistanceStrike} CE)</span>
              <span className="text-emerald-300">EOS: {formatPrice(ltpData.reversalLevels.eos)}</span>
              <span className="text-rose-300">EOR: {formatPrice(ltpData.reversalLevels.eor)}</span>
              <span className="text-amber-300">SL: {formatPrice(ltpData.reversalLevels.maxPainSl)}</span>
              {ltpState === "unavailable" && <span className="text-amber-400">STALE · Refresh unavailable</span>}
            </div>
            <div aria-label="WTB and WTT reversal levels" className="mt-1 flex flex-wrap gap-1 text-[10px]">
              {shiftingLevels.length ? shiftingLevels.map((level) => (
                <span key={level.id} title={level.detail} className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5">
                  <strong style={{ color: level.color }}>{level.name}</strong>{" "}
                  <span className="text-zinc-200">{formatPrice(level.price)}</span>{" "}
                  <span className="text-zinc-500">{level.detail}</span>
                </span>
              )) : <span className="text-zinc-500">No active WTB/WTT challenger levels</span>}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-400" title={ltpData.coaScenario.recommendation}>
              {ltpData.coaScenario.recommendation}
              <span className="ml-2 text-zinc-500">{ltpProvider} {ltpQuality}</span>
            </p>
          </>
        )}
      </div>
    )}
    </div>
  );
}
