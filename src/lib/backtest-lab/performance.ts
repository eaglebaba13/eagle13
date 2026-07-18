// Phase 3G — Deterministic performance analytics.
// Small-sample warnings; INSUFFICIENT_SAMPLE below 20 trades.

import type { EquityPoint, PerformanceMetrics, SimulatedTrade } from "./types";

const SMALL_SAMPLE_MIN = 20;
const INSUFFICIENT_MIN = 10;

export function buildEquityCurve(
  trades: readonly SimulatedTrade[],
  startingCapital: number,
): EquityPoint[] {
  let equity = startingCapital;
  let peak = startingCapital;
  const out: EquityPoint[] = [];
  for (const t of trades) {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    out.push({ ts: t.exitTs, equity, drawdown });
  }
  return out;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function computeMetrics(
  trades: readonly SimulatedTrade[],
  startingCapital: number,
  fromIso?: string,
  toIso?: string,
): PerformanceMetrics {
  const n = trades.length;
  const rets = trades.map((t) => t.netPnl);
  const returnsPct = trades.map((t) => t.returnPct);
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const breakevens = trades.filter((t) => t.netPnl === 0);
  const grossProfit = wins.reduce((a, b) => a + b.netPnl, 0);
  const grossLoss = losses.reduce((a, b) => a + b.netPnl, 0);
  const netProfit = grossProfit + grossLoss;
  const winRate = n > 0 ? wins.length / n : 0;
  const lossRate = n > 0 ? losses.length / n : 0;
  const equityCurve = buildEquityCurve(trades, startingCapital);
  let maxDrawdown = 0;
  let maxDDBars = 0;
  let peak = startingCapital;
  let peakIdx = 0;
  equityCurve.forEach((p, i) => {
    if (p.equity > peak) { peak = p.equity; peakIdx = i; }
    const dd = peak - p.equity;
    if (dd > maxDrawdown) { maxDrawdown = dd; maxDDBars = i - peakIdx; }
  });
  const maxDDPct = peak > 0 ? maxDrawdown / peak : 0;

  const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : (grossProfit > 0 ? Infinity : null);
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const payoff = losses.length > 0 && avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null;
  const expectancy = n > 0 ? netProfit / n : 0;
  const mu = n > 0 ? rets.reduce((a, b) => a + b, 0) / n : 0;
  const sd = stddev(rets);
  const sharpe = sd > 0 ? mu / sd : null;
  const negatives = rets.filter((r) => r < 0);
  const downsideDev = stddev(negatives);
  const sortino = downsideDev > 0 ? mu / downsideDev : null;
  const calmar = maxDDPct > 0 ? (netProfit / startingCapital) / maxDDPct : null;
  const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : null;

  let longestWinStreak = 0, longestLossStreak = 0, curW = 0, curL = 0;
  for (const t of trades) {
    if (t.netPnl > 0) { curW++; curL = 0; longestWinStreak = Math.max(longestWinStreak, curW); }
    else if (t.netPnl < 0) { curL++; curW = 0; longestLossStreak = Math.max(longestLossStreak, curL); }
    else { curW = 0; curL = 0; }
  }
  const avgHolding = n > 0 ? trades.reduce((a, b) => a + b.holdingBars, 0) / n : 0;
  const totalBars = trades.reduce((a, b) => a + b.holdingBars, 0);

  let cagr: number | null = null;
  if (fromIso && toIso) {
    const y = (Date.parse(toIso) - Date.parse(fromIso)) / (365.25 * 86400_000);
    if (y > 0 && startingCapital > 0 && (startingCapital + netProfit) > 0) {
      cagr = Math.pow((startingCapital + netProfit) / startingCapital, 1 / y) - 1;
    }
  }

  let ulcerIndex: number | null = null;
  if (equityCurve.length >= 2) {
    let p = startingCapital;
    let sumSq = 0;
    for (const q of equityCurve) {
      p = Math.max(p, q.equity);
      const d = p > 0 ? (p - q.equity) / p : 0;
      sumSq += d * d;
    }
    ulcerIndex = Math.sqrt(sumSq / equityCurve.length);
  }

  let sampleWarning: PerformanceMetrics["sampleWarning"] = "OK";
  if (n < INSUFFICIENT_MIN) sampleWarning = "INSUFFICIENT_SAMPLE";
  else if (n < SMALL_SAMPLE_MIN) sampleWarning = "SMALL_SAMPLE";

  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate,
    lossRate,
    grossProfit,
    grossLoss,
    netProfit,
    netReturnPct: startingCapital > 0 ? (netProfit / startingCapital) * 100 : 0,
    cagr,
    avgTrade: n > 0 ? netProfit / n : 0,
    medianTrade: median(rets),
    avgWin,
    avgLoss,
    largestWin: wins.length > 0 ? Math.max(...wins.map((t) => t.netPnl)) : 0,
    largestLoss: losses.length > 0 ? Math.min(...losses.map((t) => t.netPnl)) : 0,
    profitFactor,
    payoffRatio: payoff,
    expectancy,
    sharpe,
    sortino,
    calmar,
    recoveryFactor,
    maxDrawdown,
    maxDrawdownPct: maxDDPct,
    drawdownDurationBars: maxDDBars,
    exposurePct: totalBars,        // caller normalises when bar total known
    avgHoldingBars: avgHolding,
    longestWinStreak,
    longestLossStreak,
    ulcerIndex,
    sampleWarning,
    // used only for downstream consumers
    ...(returnsPct.length ? {} : {}),
  };
}