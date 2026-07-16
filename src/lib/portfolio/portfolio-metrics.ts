// Phase 22 · Stage 1 — Portfolio metrics. Documented formulas.

import type {
  PortfolioAsset,
  PortfolioEquityPoint,
  PortfolioMetrics,
  PortfolioTrade,
  StrategyAllocation,
} from "./portfolio-types";

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / (1000 * 60 * 60 * 24);
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}

function hhi(weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.reduce((s, w) => s + (w / total) * (w / total), 0);
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
  return sorted[idx];
}

export function computePortfolioMetrics(
  assets: readonly PortfolioAsset[],
  allocations: readonly StrategyAllocation[],
  startingCapital: number,
  equity: readonly PortfolioEquityPoint[],
  trades: readonly PortfolioTrade[],
): PortfolioMetrics {
  const netPnl = trades.reduce((a, t) => a + t.scaledPnl, 0);
  const totalReturnPct = startingCapital > 0 ? netPnl / startingCapital : 0;

  const dailyByDate = new Map<string, number>();
  for (const t of trades) dailyByDate.set(t.date, (dailyByDate.get(t.date) ?? 0) + t.scaledPnl);
  const dailyPnl = [...dailyByDate.values()];
  const dailyReturns = dailyPnl.map((v) => v / Math.max(1, startingCapital));

  const vol = stdev(dailyReturns);
  const annualizedVol = vol * Math.sqrt(252);
  const meanRet = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
  const sharpe = vol > 0 ? (meanRet / vol) * Math.sqrt(252) : 0;

  const downside = dailyReturns.filter((r) => r < 0);
  const dnStd = stdev(downside);
  const sortino = dnStd > 0 ? (meanRet / dnStd) * Math.sqrt(252) : 0;

  const wins = trades.filter((t) => t.scaledPnl > 0).reduce((s, t) => s + t.scaledPnl, 0);
  const losses = -trades.filter((t) => t.scaledPnl < 0).reduce((s, t) => s + t.scaledPnl, 0);
  const profitFactor = losses > 0 ? wins / losses : wins > 0 ? Infinity : 0;
  const expectancy = trades.length > 0 ? netPnl / trades.length : 0;

  const maxDD = equity.reduce((m, p) => Math.max(m, p.drawdown), 0);
  const peak = equity.reduce((m, p) => Math.max(m, p.equity), startingCapital);
  const maxDDPct = peak > 0 ? maxDD / peak : 0;
  const calmar = maxDD > 0 && equity.length > 0 ? netPnl / maxDD : 0;
  const recovery = maxDD > 0 ? netPnl / maxDD : 0;

  // Ulcer Index = sqrt(mean(drawdown_pct^2))
  const ddPcts = equity.map((p) => (peak > 0 ? p.drawdown / peak : 0));
  const ulcer = Math.sqrt(ddPcts.reduce((a, b) => a + b * b, 0) / Math.max(1, ddPcts.length));

  const sortedRets = [...dailyReturns].sort((a, b) => a - b);
  const var95 = -percentile(sortedRets, 0.05);
  const tail = sortedRets.slice(0, Math.max(1, Math.ceil(sortedRets.length * 0.05)));
  const cvar95 = tail.length > 0 ? -tail.reduce((a, b) => a + b, 0) / tail.length : 0;
  const tailLoss = tail.reduce((a, b) => a + b, 0);

  const monthly = new Map<string, number>();
  for (const t of trades) {
    const m = t.date.slice(0, 7);
    monthly.set(m, (monthly.get(m) ?? 0) + t.scaledPnl);
  }
  const winningMonths = [...monthly.values()].filter((v) => v > 0).length;
  const losingMonths = [...monthly.values()].filter((v) => v < 0).length;

  const from = equity[0]?.date ?? "";
  const to = equity[equity.length - 1]?.date ?? "";
  const years = daysBetween(from, to) / 365.25;
  const cagr = years > 0 && startingCapital > 0 && startingCapital + netPnl > 0
    ? Math.pow((startingCapital + netPnl) / startingCapital, 1 / years) - 1
    : null;

  const weights = allocations.map((a) => a.weight);
  const hhiStrat = hhi(weights);
  const instrWeights = new Map<string, number>();
  for (const a of allocations) {
    const asset = assets.find((x) => x.id === a.assetId);
    if (!asset) continue;
    instrWeights.set(asset.instrument, (instrWeights.get(asset.instrument) ?? 0) + a.weight);
  }
  const hhiInstr = hhi([...instrWeights.values()]);

  // Diversification ratio = sum(w*vol) / portfolio_vol
  const perAssetVol = assets.map((a) => {
    const daily = new Map<string, number>();
    for (const t of a.trades) daily.set(t.date, (daily.get(t.date) ?? 0) + t.pnl);
    return stdev([...daily.values()]);
  });
  const wSumVol = allocations.reduce((s, a) => {
    const i = assets.findIndex((x) => x.id === a.assetId);
    return s + a.weight * (perAssetVol[i] ?? 0);
  }, 0);
  const portDailyStd = stdev(dailyPnl);
  const divRatio = portDailyStd > 0 ? wSumVol / portDailyStd : 0;

  const activeDays = new Set(trades.map((t) => t.date)).size;
  const totalDays = new Set(equity.map((e) => e.date)).size || 1;
  const exposurePct = activeDays / totalDays;
  const capUtil = Math.min(1, allocations.reduce((s, a) => s + a.weight, 0));

  return {
    totalReturnPct,
    netPnl,
    cagr,
    annualizedVol,
    sharpe,
    sortino,
    calmar,
    profitFactor,
    expectancy,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    recoveryFactor: recovery,
    ulcerIndex: ulcer,
    var95,
    cvar95,
    tailLoss,
    winningMonths,
    losingMonths,
    exposurePct,
    capitalUtilization: capUtil,
    strategyConcentration: hhiStrat,
    instrumentConcentration: hhiInstr,
    diversificationRatio: divRatio,
  };
}