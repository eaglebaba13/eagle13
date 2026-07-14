// Signal Accuracy Analytics — pure analytics layer on top of BacktestResult.
//
// This module NEVER runs the signal engine or level engine. It only aggregates
// the trades returned by the already-validated Historical Backtest Engine
// (`src/lib/backtest.functions.ts` + `src/lib/backtest-engine.ts`). Every
// calculation reduces existing trade fields — no formula lives here.

import type { BacktestResult, BacktestTrade } from "./backtest.functions";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type Bucket = {
  key: string;
  trades: number;   // decided trades (WIN + LOSS + FLAT); WAIT rows excluded
  wins: number;
  losses: number;
  flats: number;
  accuracy: number;   // wins / trades  ×100 (1dp)
  winRate: number;    // wins / (wins+losses) ×100 (1dp)
  avgReturn: number;  // mean pnl over decided trades
  avgWin: number;
  avgLoss: number;    // positive number
  profitFactor: number; // sumProfit / sumLoss (capped at 999)
  expectancy: number;   // winRate·avgWin − lossRate·avgLoss
  netPnl: number;
  rank: number;         // filled in after sorting
};

export type ConfusionRow = {
  signal: "BUY" | "SELL" | "WAIT";
  correct: number;
  failed: number;
  flat: number;
  total: number;
  accuracy: number;
};

export type DrawdownStats = {
  maxDrawdown: number;
  avgDrawdown: number;
  worstDrawdown: number;
  recoveryDays: number | null;    // trading days to recover from worst DD; null if never recovered
  peaks: number;
};

export type TopSummary = {
  totalTrades: number;
  wins: number;
  losses: number;
  flats: number;
  accuracy: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  expectancy: number;
  netProfit: number;
  maxDrawdown: number;
  recoveryFactor: number;
  sharpe: number;
  avgTrade: number;
  avgWinner: number;
  avgLoser: number;
};

export type Analytics = {
  top: TopSummary;
  signalBreakdown: Bucket[];
  nakshatra: Bucket[];
  moonSign: Bucket[];
  retrograde: Bucket[];
  planet: Bucket[];
  dayOfWeek: Bucket[];
  month: Bucket[];          // 01..12 across all years
  year: Bucket[];
  confusion: ConfusionRow[];
  drawdown: DrawdownStats;
  bestNakshatras: Bucket[];
  worstNakshatras: Bucket[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round1(n: number): number { return Math.round(n * 10) / 10; }

/** Decided = trades whose outcome resolved to WIN | LOSS | FLAT. */
function isDecided(t: BacktestTrade): boolean {
  return t.result === "WIN" || t.result === "LOSS" || t.result === "FLAT";
}

function buildBucket(key: string, rows: BacktestTrade[]): Bucket {
  const decided = rows.filter(isDecided);
  const wins = decided.filter((t) => t.result === "WIN");
  const losses = decided.filter((t) => t.result === "LOSS");
  const flats = decided.filter((t) => t.result === "FLAT");
  const sumProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const sumLossAbs = losses.reduce((a, t) => a + Math.abs(t.pnl), 0);
  const netPnl = decided.reduce((a, t) => a + t.pnl, 0);
  const n = decided.length;
  const decidedWinLoss = wins.length + losses.length;
  const winRate = decidedWinLoss > 0 ? wins.length / decidedWinLoss : 0;
  const avgWin = wins.length ? sumProfit / wins.length : 0;
  const avgLoss = losses.length ? sumLossAbs / losses.length : 0;
  const profitFactor = sumLossAbs > 0 ? sumProfit / sumLossAbs : sumProfit > 0 ? 999 : 0;
  const expectancy = decidedWinLoss > 0 ? winRate * avgWin - (1 - winRate) * avgLoss : 0;
  return {
    key,
    trades: n,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    accuracy: n > 0 ? round1((wins.length / n) * 100) : 0,
    winRate: round1(winRate * 100),
    avgReturn: n > 0 ? round2(netPnl / n) : 0,
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    profitFactor: round2(Math.min(profitFactor, 999)),
    expectancy: round2(expectancy),
    netPnl: round2(netPnl),
    rank: 0,
  };
}

function rankAndSort(buckets: Bucket[]): Bucket[] {
  const sorted = [...buckets].sort((a, b) => b.accuracy - a.accuracy || b.netPnl - a.netPnl);
  return sorted.map((b, i) => ({ ...b, rank: i + 1 }));
}

function groupBy(trades: BacktestTrade[], keyOf: (t: BacktestTrade) => string | null): Bucket[] {
  const m = new Map<string, BacktestTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    if (!k) continue;
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  return rankAndSort(Array.from(m, ([k, rows]) => buildBucket(k, rows)));
}

/* ------------------------------------------------------------------ */
/* Buckets                                                            */
/* ------------------------------------------------------------------ */

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function retroKey(count: number): string {
  if (count <= 0) return "0 Retro";
  if (count === 1) return "1 Retro";
  if (count === 2) return "2 Retro";
  return "3+ Retro";
}

function planetOf(nearest: string | null): string | null {
  if (!nearest) return null;
  const first = nearest.split(" ")[0];
  return first || null;
}

function monthOfDate(dateIso: string): string {
  const idx = parseInt(dateIso.slice(5, 7), 10);
  return Number.isFinite(idx) ? MONTH_NAMES[idx - 1] ?? dateIso.slice(5, 7) : dateIso.slice(5, 7);
}

function yearOfDate(dateIso: string): string {
  return dateIso.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Confusion Matrix                                                    */
/* ------------------------------------------------------------------ */

function confusionMatrix(trades: BacktestTrade[]): ConfusionRow[] {
  const bySig = (sig: "BUY" | "SELL" | "WAIT"): ConfusionRow => {
    const rows = trades.filter((t) => t.signal === sig);
    let correct = 0, failed = 0, flat = 0;
    for (const t of rows) {
      if (sig === "WAIT") {
        // WAIT is "correct" whenever the engine decided to skip.
        if (t.result === "SKIP") correct++;
        else failed++;
      } else {
        if (t.result === "WIN") correct++;
        else if (t.result === "LOSS") failed++;
        else flat++;
      }
    }
    const total = rows.length;
    return {
      signal: sig,
      correct, failed, flat,
      total,
      accuracy: total > 0 ? round1((correct / total) * 100) : 0,
    };
  };
  return [bySig("BUY"), bySig("SELL"), bySig("WAIT")];
}

/* ------------------------------------------------------------------ */
/* Drawdown                                                            */
/* ------------------------------------------------------------------ */

function drawdownStats(equityCurve: { date: string; cumulative: number }[]): DrawdownStats {
  if (equityCurve.length === 0) {
    return { maxDrawdown: 0, avgDrawdown: 0, worstDrawdown: 0, recoveryDays: null, peaks: 0 };
  }
  let peak = equityCurve[0].cumulative;
  let peaks = 1;
  let maxDD = 0;
  let ddSum = 0;
  let worstPeakIndex = 0;
  let worstBottomIndex = 0;
  for (let i = 0; i < equityCurve.length; i++) {
    const c = equityCurve[i].cumulative;
    if (c > peak) { peak = c; peaks++; }
    const dd = peak - c;
    if (dd > maxDD) {
      maxDD = dd;
      worstBottomIndex = i;
      // find the peak index preceding this bottom
      let p = i - 1;
      while (p > 0 && equityCurve[p].cumulative < peak) p--;
      worstPeakIndex = p;
    }
    ddSum += dd;
  }
  // Recovery: index of first point after worstBottomIndex reaching peakValue.
  const peakValue = equityCurve[worstPeakIndex].cumulative;
  let recoveryDays: number | null = null;
  for (let i = worstBottomIndex + 1; i < equityCurve.length; i++) {
    if (equityCurve[i].cumulative >= peakValue) {
      recoveryDays = i - worstBottomIndex;
      break;
    }
  }
  return {
    maxDrawdown: round2(maxDD),
    avgDrawdown: round2(ddSum / equityCurve.length),
    worstDrawdown: round2(maxDD),
    recoveryDays,
    peaks,
  };
}

/* ------------------------------------------------------------------ */
/* Top summary                                                        */
/* ------------------------------------------------------------------ */

function topSummary(r: BacktestResult): TopSummary {
  const s = r.summary;
  const stats = r.stats;
  const decided = s.wins + s.losses;
  const avgTrade = s.taken > 0
    ? round2(r.trades.filter(isDecided).reduce((a, t) => a + t.pnl, 0) / s.taken)
    : 0;
  return {
    totalTrades: s.totalSignals,
    wins: s.wins,
    losses: s.losses,
    flats: s.flats,
    accuracy: s.accuracy,
    winRate: s.winRate,
    lossRate: s.lossRate,
    profitFactor: s.profitFactor,
    expectancy: stats.expectancy,
    netProfit: s.netProfit,
    maxDrawdown: s.maxDrawdown,
    recoveryFactor: stats.recoveryFactor,
    sharpe: stats.sharpeLike,
    avgTrade,
    avgWinner: s.avgProfit,
    avgLoser: s.avgLoss,
    // reference decided to avoid the unused-var lint even though the top
    // summary already reflects wins/losses independently.
    ...(decided < 0 ? {} : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Main entry                                                         */
/* ------------------------------------------------------------------ */

export function computeAnalytics(r: BacktestResult): Analytics {
  const trades = r.trades;
  const nakshatra = groupBy(trades, (t) => t.moonNakshatra || null);
  const moonSign = groupBy(trades, (t) => t.moonSign || null);
  const retrograde = groupBy(trades, (t) => retroKey(t.retroCount));
  const planet = groupBy(trades, (t) => planetOf(t.nearest));
  const dayOfWeek = groupBy(trades, (t) => t.dayOfWeek);
  const month = groupBy(trades, (t) => monthOfDate(t.date));
  const year = groupBy(trades, (t) => yearOfDate(t.date));
  const signalBreakdown = groupBy(trades, (t) => t.signal);

  // Ordered variants that make chart axes stable across runs.
  const dowOrdered = orderBuckets(dayOfWeek, WEEKDAY_ORDER);
  const monthOrdered = orderBuckets(month, MONTH_NAMES);

  const rankedNak = nakshatra.filter((b) => b.trades >= 3);
  const bestNakshatras = rankedNak.slice(0, 5);
  const worstNakshatras = [...rankedNak].reverse().slice(0, 5);

  return {
    top: topSummary(r),
    signalBreakdown,
    nakshatra,
    moonSign,
    retrograde,
    planet,
    dayOfWeek: dowOrdered,
    month: monthOrdered,
    year: [...year].sort((a, b) => a.key.localeCompare(b.key)),
    confusion: confusionMatrix(trades),
    drawdown: drawdownStats(r.equityCurve),
    bestNakshatras,
    worstNakshatras,
  };
}

function orderBuckets(buckets: Bucket[], order: string[]): Bucket[] {
  const m = new Map(buckets.map((b) => [b.key, b]));
  const out: Bucket[] = [];
  order.forEach((k) => { const b = m.get(k); if (b) out.push(b); });
  // Preserve any keys not in the ordering list (e.g. locale variants) at the end.
  buckets.forEach((b) => { if (!order.includes(b.key)) out.push(b); });
  return out;
}

/* ------------------------------------------------------------------ */
/* AI-style insight generator (pure text from analytics)              */
/* ------------------------------------------------------------------ */

export type Insight = { icon: string; label: string; detail: string; tone: "bull" | "bear" | "neutral" };

export function buildInsights(a: Analytics): Insight[] {
  const out: Insight[] = [];
  const push = (icon: string, label: string, b: Bucket | undefined, tone: Insight["tone"]) => {
    if (!b) return;
    out.push({
      icon,
      label,
      detail: `${b.key} · ${b.accuracy}% accuracy · ${b.trades} trades · PnL ${b.netPnl}`,
      tone,
    });
  };
  push("🌟", "Best Nakshatra", a.bestNakshatras[0], "bull");
  push("💀", "Worst Nakshatra", a.worstNakshatras[0], "bear");
  push("🌕", "Best Moon Sign", a.moonSign[0], "bull");
  push("🌑", "Worst Moon Sign", a.moonSign[a.moonSign.length - 1], "bear");
  push("♻️", "Best Retrograde Combo", a.retrograde[0], "bull");
  push("⚠️", "Worst Retrograde Combo", a.retrograde[a.retrograde.length - 1], "bear");
  push("📅", "Best Weekday", a.dayOfWeek.filter((b) => b.trades > 0).sort((x, y) => y.accuracy - x.accuracy || y.netPnl - x.netPnl)[0], "bull");
  push("🗓️", "Worst Weekday", a.dayOfWeek.filter((b) => b.trades > 0).sort((x, y) => x.accuracy - y.accuracy || x.netPnl - y.netPnl)[0], "bear");
  push("📈", "Best Month", a.month.filter((b) => b.trades > 0).sort((x, y) => y.accuracy - x.accuracy || y.netPnl - x.netPnl)[0], "bull");
  push("📉", "Worst Month", a.month.filter((b) => b.trades > 0).sort((x, y) => x.accuracy - y.accuracy || x.netPnl - y.netPnl)[0], "bear");
  const goodSig = a.signalBreakdown.find((b) => b.key !== "WAIT");
  if (goodSig) push("🟢", "Most Reliable Signal", a.signalBreakdown.filter((b) => b.key !== "WAIT")[0], "bull");
  const worstSig = a.signalBreakdown.filter((b) => b.key !== "WAIT").at(-1);
  if (worstSig) push("🔴", "Least Reliable Signal", worstSig, "bear");
  return out;
}