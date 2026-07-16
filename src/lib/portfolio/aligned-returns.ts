// Phase 22 · Stage 3 — Shared aligned daily-return utilities used by the
// efficient frontier, risk-budget, and recommendation engines. Pure and
// deterministic. Never mutates source trades.

import type { PortfolioAsset } from "./portfolio-types";

export type AlignedReturns = {
  readonly assetIds: readonly string[];
  readonly dates: readonly string[];
  /** returns[i][t] = daily return of asset i on date t (pnl / startingCapital). */
  readonly returns: ReadonlyArray<readonly number[]>;
  readonly means: readonly number[];
  readonly stdevs: readonly number[];
  /** Covariance matrix (n × n) on aligned observations. */
  readonly cov: ReadonlyArray<readonly number[]>;
};

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1));
}

function covariance(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

export function computeAlignedReturns(
  assets: readonly PortfolioAsset[],
  startingCapital: number,
): AlignedReturns {
  const cap = Math.max(1, startingCapital);
  const series = assets.map((a) => {
    const m = new Map<string, number>();
    for (const t of a.trades) m.set(t.date, (m.get(t.date) ?? 0) + t.pnl);
    return m;
  });
  let common: Set<string> | null = null;
  for (const s of series) {
    const keys = new Set(s.keys());
    if (common == null) common = keys;
    else {
      const nx = new Set<string>();
      for (const k of common) if (keys.has(k)) nx.add(k);
      common = nx;
    }
  }
  const dates = [...(common ?? new Set<string>())].sort();
  const returns = series.map((s) => dates.map((d) => (s.get(d) ?? 0) / cap));
  const means = returns.map((r) => (r.length > 0 ? r.reduce((a, b) => a + b, 0) / r.length : 0));
  const stdevs = returns.map(stdev);
  const n = assets.length;
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const c = covariance(returns[i], returns[j]);
      cov[i][j] = c;
      cov[j][i] = c;
    }
  }
  return { assetIds: assets.map((a) => a.id), dates, returns, means, stdevs, cov };
}

export function portfolioReturn(weights: readonly number[], means: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < weights.length; i++) s += weights[i] * (means[i] ?? 0);
  return s;
}

export function portfolioVariance(
  weights: readonly number[],
  cov: ReadonlyArray<readonly number[]>,
): number {
  let s = 0;
  const n = weights.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      s += weights[i] * weights[j] * (cov[i]?.[j] ?? 0);
    }
  }
  return Math.max(0, s);
}

export function portfolioVol(
  weights: readonly number[],
  cov: ReadonlyArray<readonly number[]>,
): number {
  return Math.sqrt(portfolioVariance(weights, cov));
}

export function annualize(mean: number, vol: number): { ret: number; vol: number; sharpe: number } {
  const r = mean * 252;
  const v = vol * Math.sqrt(252);
  const s = v > 0 ? r / v : 0;
  return { ret: r, vol: v, sharpe: s };
}