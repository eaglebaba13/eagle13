// Phase 3G — Portfolio backtest aggregator (equal / fixed / risk-parity).
// Consumer of already-computed run reports; preserves tokenized-metal
// identity — never substitutes XAU/XAG.

import type { BacktestRunReport, EquityPoint, PerformanceMetrics } from "./types";
import { computeMetrics } from "./performance";

export type PortfolioWeighting = "EQUAL" | "FIXED" | "RISK_PARITY";

export interface PortfolioInput {
  readonly weighting: PortfolioWeighting;
  readonly fixedWeights?: Readonly<Record<string, number>>;
  readonly runs: readonly BacktestRunReport[];
  readonly startingCapital: number;
  readonly maxSymbolWeight?: number;
}

export interface PortfolioResult {
  readonly weights: Readonly<Record<string, number>>;
  readonly equityCurve: readonly EquityPoint[];
  readonly metrics: PerformanceMetrics;
  readonly correlation: ReadonlyArray<readonly number[]>;
  readonly symbols: readonly string[];
  readonly warnings: readonly string[];
}

function computeWeights(input: PortfolioInput): Record<string, number> {
  const runs = input.runs;
  const weights: Record<string, number> = {};
  if (input.weighting === "EQUAL") {
    const w = runs.length > 0 ? 1 / runs.length : 0;
    for (const r of runs) weights[r.runId] = w;
  } else if (input.weighting === "FIXED") {
    let total = 0;
    for (const r of runs) {
      const w = input.fixedWeights?.[r.runId] ?? 0;
      weights[r.runId] = w;
      total += w;
    }
    if (total > 0) for (const k of Object.keys(weights)) weights[k] /= total;
  } else {
    // Risk parity ∝ 1/stddev(pnl); when a run has zero variance, fall back to equal.
    const vols = runs.map((r) => stdev(r.trades.map((t) => t.netPnl)) || 1e-9);
    const invs = vols.map((v) => 1 / v);
    const total = invs.reduce((a, b) => a + b, 0);
    runs.forEach((r, i) => { weights[r.runId] = total > 0 ? invs[i] / total : 1 / runs.length; });
  }
  const cap = input.maxSymbolWeight;
  if (cap && cap > 0 && cap < 1) {
    let capped = false;
    for (const k of Object.keys(weights)) {
      if (weights[k] > cap) { weights[k] = cap; capped = true; }
    }
    if (capped) {
      const s = Object.values(weights).reduce((a, b) => a + b, 0);
      if (s > 0) for (const k of Object.keys(weights)) weights[k] /= s;
    }
  }
  return weights;
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : 0;
}

export function runPortfolio(input: PortfolioInput): PortfolioResult {
  const weights = computeWeights(input);
  const warnings: string[] = [];
  // Combine trades chronologically, scale P&L by weight.
  type Row = { ts: string; pnl: number };
  const rows: Row[] = [];
  for (const r of input.runs) {
    const w = weights[r.runId] ?? 0;
    for (const t of r.trades) rows.push({ ts: t.exitTs, pnl: t.netPnl * w });
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));

  let equity = input.startingCapital;
  let peak = input.startingCapital;
  const equityCurve: EquityPoint[] = [];
  for (const r of rows) {
    equity += r.pnl;
    peak = Math.max(peak, equity);
    equityCurve.push({ ts: r.ts, equity, drawdown: peak > 0 ? (peak - equity) / peak : 0 });
  }
  const scaledTrades = input.runs.flatMap((r) => {
    const w = weights[r.runId] ?? 0;
    return r.trades.map((t) => ({ ...t, netPnl: t.netPnl * w, grossPnl: t.grossPnl * w }));
  });
  const metrics = computeMetrics(scaledTrades, input.startingCapital);

  const symbols = input.runs.map((r) => r.manifest.symbol);
  const pnlSeries = input.runs.map((r) => r.trades.map((t) => t.netPnl));
  const corr: number[][] = symbols.map((_, i) =>
    symbols.map((__, j) => (i === j ? 1 : correlation(pnlSeries[i], pnlSeries[j]))),
  );
  if (input.runs.some((r) => /PAXG|XAUT|KAG/i.test(r.manifest.symbol))) {
    warnings.push("TOKENIZED_METAL_IDENTITY_PRESERVED");
  }
  return { weights, equityCurve, metrics, correlation: corr, symbols, warnings };
}