// Phase 21.3 · Shared statistics — thin extension around `buildStats` that
// optionally slices trades by adapter-provided dimensions (safe/risky, cube
// grade, planet, L-family, time-of-day, star, retrograde, pivot). Adapters
// that don't emit these metadata fields see byte-identical output to
// `buildStats` alone.

import { buildStats, type StatBundle, type TradeStat } from "../backtest-engine";
import type { HistoricalTrade } from "./result";

export type DimensionSlice = { key: string; stats: StatBundle; count: number };

function toTradeStat(t: HistoricalTrade): TradeStat {
  return { result: t.outcome, pnl: t.pnl, pnlPct: 0 };
}

function sliceBy(
  trades: readonly HistoricalTrade[],
  pick: (t: HistoricalTrade) => string | null | undefined,
): DimensionSlice[] {
  const groups = new Map<string, HistoricalTrade[]>();
  for (const t of trades) {
    const k = pick(t);
    if (k == null || k === "") continue;
    const bucket = groups.get(k) ?? [];
    bucket.push(t);
    groups.set(k, bucket);
  }
  const out: DimensionSlice[] = [];
  for (const [key, bucket] of groups) {
    const decided = bucket
      .filter((t) => t.outcome === "WIN" || t.outcome === "LOSS" || t.outcome === "FLAT")
      .map(toTradeStat);
    const netPnl = bucket.reduce((a, b) => a + b.pnl, 0);
    out.push({ key, count: bucket.length, stats: buildStats(decided, bucket.length, netPnl, 0) });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

export type UnifiedStats = {
  overall: StatBundle;
  dimensions: {
    safeRisky?: DimensionSlice[];
    cubeGrade?: DimensionSlice[];
    planet?: DimensionSlice[];
    lFamily?: DimensionSlice[];
    timeOfDay?: DimensionSlice[];
    star?: DimensionSlice[];
    retrograde?: DimensionSlice[];
    pivot?: DimensionSlice[];
  };
};

export function buildUnifiedStats(
  trades: readonly HistoricalTrade[],
  netPnl: number,
  maxDrawdown: number,
): UnifiedStats {
  const decided = trades
    .filter((t) => t.outcome === "WIN" || t.outcome === "LOSS" || t.outcome === "FLAT")
    .map(toTradeStat);
  const overall = buildStats(decided, trades.length, netPnl, maxDrawdown);

  const md = (t: HistoricalTrade) => t.metadata as Record<string, unknown>;
  const pickStr = (t: HistoricalTrade, k: string): string | null => {
    const v = md(t)[k];
    return typeof v === "string" ? v : null;
  };

  const dims: UnifiedStats["dimensions"] = {};
  const safeRisky = sliceBy(trades, (t) => pickStr(t, "safeRisky"));
  if (safeRisky.length) dims.safeRisky = safeRisky;
  const cubeGrade = sliceBy(trades, (t) => pickStr(t, "cubeGrade"));
  if (cubeGrade.length) dims.cubeGrade = cubeGrade;
  const planet = sliceBy(trades, (t) => pickStr(t, "planet"));
  if (planet.length) dims.planet = planet;
  const lFamily = sliceBy(trades, (t) => pickStr(t, "sourceLevel"));
  if (lFamily.length) dims.lFamily = lFamily;
  const timeOfDay = sliceBy(trades, (t) => pickStr(t, "timeOfDayBucket"));
  if (timeOfDay.length) dims.timeOfDay = timeOfDay;
  const star = sliceBy(trades, (t) => pickStr(t, "moonNakshatra"));
  if (star.length) dims.star = star;
  const retro = sliceBy(trades, (t) => pickStr(t, "retrograde"));
  if (retro.length) dims.retrograde = retro;
  const pivot = sliceBy(trades, (t) => pickStr(t, "pivotConfluence"));
  if (pivot.length) dims.pivot = pivot;

  return { overall, dimensions: dims };
}
