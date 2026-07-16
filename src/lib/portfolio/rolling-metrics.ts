// Phase 22 · Stage 2 — Rolling analytics for portfolio equity curves.
// Deterministic, dependency-free. Reads portfolio result only; never runs
// upstream research.

import type { PortfolioEquityPoint, PortfolioTrade } from "./portfolio-types";

export type RollingSeries = {
  readonly dates: readonly string[];
  readonly equity: readonly number[];
  readonly drawdown: readonly number[];
  readonly rollingReturn: readonly number[];
  readonly rollingVol: readonly number[];
  readonly rollingSharpe: readonly number[];
};

export type MonthlyHeatmapCell = {
  readonly year: number;
  readonly month: number; // 1..12
  readonly pnl: number;
};

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}

export function buildRollingSeries(
  equity: readonly PortfolioEquityPoint[],
  trades: readonly PortfolioTrade[],
  startingCapital: number,
  window = 20,
): RollingSeries {
  const dates = equity.map((p) => p.date);
  const equityVals = equity.map((p) => p.equity);
  const drawdown = equity.map((p) => p.drawdown);

  const byDate = new Map<string, number>();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.scaledPnl);
  const dailyReturns = dates.map((d) => (byDate.get(d) ?? 0) / Math.max(1, startingCapital));

  const rollingReturn: number[] = [];
  const rollingVol: number[] = [];
  const rollingSharpe: number[] = [];

  for (let i = 0; i < dailyReturns.length; i++) {
    const s = Math.max(0, i - window + 1);
    const slice = dailyReturns.slice(s, i + 1);
    const mean = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    const vol = stdev(slice);
    rollingReturn.push(mean * 252);
    rollingVol.push(vol * Math.sqrt(252));
    rollingSharpe.push(vol > 0 ? (mean / vol) * Math.sqrt(252) : 0);
  }

  return { dates, equity: equityVals, drawdown, rollingReturn, rollingVol, rollingSharpe };
}

export function buildMonthlyHeatmap(trades: readonly PortfolioTrade[]): readonly MonthlyHeatmapCell[] {
  const byMonth = new Map<string, number>();
  for (const t of trades) {
    const key = t.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.scaledPnl);
  }
  const out: MonthlyHeatmapCell[] = [];
  for (const [k, pnl] of byMonth) {
    const [y, m] = k.split("-").map((n) => Number(n));
    out.push({ year: y, month: m, pnl });
  }
  return out.sort((a, b) => (a.year - b.year) || (a.month - b.month));
}