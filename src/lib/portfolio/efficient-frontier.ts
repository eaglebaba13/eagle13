// Phase 22 · Stage 3 — Deterministic efficient frontier via constrained
// grid search. Research-only. No convex solver — outputs are labelled as
// grid-search approximations.
//
// The engine enumerates weight vectors on a uniform simplex grid (Σw = 1),
// discards portfolios that violate constraints, and classifies the rest
// into a Pareto-efficient frontier (max return for a given volatility bucket).

import {
  computeAlignedReturns,
  portfolioReturn,
  portfolioVariance,
  annualize,
  type AlignedReturns,
} from "./aligned-returns";
import type {
  PortfolioAsset,
  PortfolioConstraints,
} from "./portfolio-types";

export type FrontierInput = {
  readonly candidates: readonly PortfolioAsset[];
  readonly startingCapital: number;
  readonly constraints?: PortfolioConstraints;
  /** Grid step for weights (0..1). Default 0.1. Values < 0.05 refuse to run. */
  readonly weightStep?: number;
  readonly minWeight?: number;
  readonly maxWeight?: number;
  readonly targetReturn?: number;
  readonly targetVol?: number;
  /** Hard cap on generated combinations. Default 20_000. */
  readonly maxCombinations?: number;
};

export type FrontierPoint = {
  readonly weights: readonly number[];
  readonly assetIds: readonly string[];
  readonly expectedReturn: number; // annualised
  readonly volatility: number; // annualised
  readonly sharpe: number;
  readonly diversificationRatio: number;
  readonly dominated: boolean;
  readonly efficient: boolean;
};

export type FrontierResult = {
  readonly method: "GRID_SEARCH_CONSTRAINED";
  readonly disclaimer: string;
  readonly assetIds: readonly string[];
  readonly feasible: readonly FrontierPoint[];
  readonly rejected: number;
  readonly frontier: readonly FrontierPoint[];
  readonly minVariance: FrontierPoint | null;
  readonly maxSharpe: FrontierPoint | null;
  readonly maxDiversification: FrontierPoint | null;
  readonly targetReturnPortfolio: FrontierPoint | null;
  readonly targetVolPortfolio: FrontierPoint | null;
  readonly combinationsExplored: number;
  readonly cappedByLimit: boolean;
};

function* simplex(n: number, steps: number): Generator<number[]> {
  // enumerate integer compositions of `steps` into n bins → weights = bin/steps
  const bins = new Array<number>(n).fill(0);
  function* rec(idx: number, remaining: number): Generator<number[]> {
    if (idx === n - 1) {
      bins[idx] = remaining;
      yield bins.slice();
      return;
    }
    for (let k = 0; k <= remaining; k++) {
      bins[idx] = k;
      yield* rec(idx + 1, remaining - k);
    }
  }
  yield* rec(0, steps);
}

function violatesConstraints(
  weights: readonly number[],
  assets: readonly PortfolioAsset[],
  cons: PortfolioConstraints | undefined,
  minW: number,
  maxW: number,
): boolean {
  for (const w of weights) {
    if (w > 0 && w < minW) return true;
    if (w > maxW) return true;
  }
  if (!cons) return false;
  if (cons.maxWeightPerStrategy != null) {
    const byStrat = new Map<string, number>();
    for (let i = 0; i < assets.length; i++) {
      byStrat.set(assets[i].strategy, (byStrat.get(assets[i].strategy) ?? 0) + weights[i]);
    }
    for (const w of byStrat.values()) if (w > cons.maxWeightPerStrategy + 1e-9) return true;
  }
  if (cons.maxWeightPerInstrument != null) {
    const byI = new Map<string, number>();
    for (let i = 0; i < assets.length; i++) {
      byI.set(assets[i].instrument, (byI.get(assets[i].instrument) ?? 0) + weights[i]);
    }
    for (const w of byI.values()) if (w > cons.maxWeightPerInstrument + 1e-9) return true;
  }
  if (cons.maxWeightPerTimeframe != null) {
    const byT = new Map<string, number>();
    for (let i = 0; i < assets.length; i++) {
      byT.set(assets[i].timeframe, (byT.get(assets[i].timeframe) ?? 0) + weights[i]);
    }
    for (const w of byT.values()) if (w > cons.maxWeightPerTimeframe + 1e-9) return true;
  }
  if (cons.minDiversificationCount != null) {
    const active = weights.filter((w) => w > 1e-9).length;
    if (active < cons.minDiversificationCount) return true;
  }
  if (cons.maxLeverage != null) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > cons.maxLeverage + 1e-9) return true;
  }
  return false;
}

function diversificationRatio(
  weights: readonly number[],
  aligned: AlignedReturns,
): number {
  let wSumVol = 0;
  for (let i = 0; i < weights.length; i++) wSumVol += weights[i] * (aligned.stdevs[i] ?? 0);
  const portVol = Math.sqrt(portfolioVariance(weights, aligned.cov));
  return portVol > 0 ? wSumVol / portVol : 0;
}

function markFrontier(points: FrontierPoint[]): FrontierPoint[] {
  // Group by volatility bucket → efficient = point with max return per bucket
  // Point is dominated if another point has ≥return AND ≤vol AND strictly better on one.
  const arr = points.map((p) => ({ ...p }));
  for (let i = 0; i < arr.length; i++) {
    let dominated = false;
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const a = arr[j];
      const b = arr[i];
      if (
        a.expectedReturn >= b.expectedReturn &&
        a.volatility <= b.volatility &&
        (a.expectedReturn > b.expectedReturn || a.volatility < b.volatility)
      ) {
        dominated = true;
        break;
      }
    }
    arr[i].dominated = dominated;
    arr[i].efficient = !dominated;
  }
  return arr;
}

export function computeEfficientFrontier(input: FrontierInput): FrontierResult {
  const disclaimer =
    "PORTFOLIO RESEARCH ONLY — grid-search approximation, NOT a convex solver. Not a live allocation instruction.";
  const { candidates, startingCapital, constraints, targetReturn, targetVol } = input;
  const step = input.weightStep ?? 0.1;
  const minW = input.minWeight ?? 0;
  const maxW = input.maxWeight ?? 1;
  const maxComb = input.maxCombinations ?? 20000;

  const assetIds = candidates.map((c) => c.id);
  if (candidates.length < 2 || step < 0.05) {
    return {
      method: "GRID_SEARCH_CONSTRAINED",
      disclaimer,
      assetIds,
      feasible: [],
      rejected: 0,
      frontier: [],
      minVariance: null,
      maxSharpe: null,
      maxDiversification: null,
      targetReturnPortfolio: null,
      targetVolPortfolio: null,
      combinationsExplored: 0,
      cappedByLimit: false,
    };
  }

  const aligned = computeAlignedReturns(candidates, startingCapital);
  const steps = Math.max(2, Math.round(1 / step));

  const feasible: FrontierPoint[] = [];
  let rejected = 0;
  let explored = 0;
  let capped = false;
  for (const bins of simplex(candidates.length, steps)) {
    explored++;
    if (explored > maxComb) { capped = true; break; }
    const weights = bins.map((b) => b / steps);
    if (violatesConstraints(weights, candidates, constraints, minW, maxW)) { rejected++; continue; }
    const meanDaily = portfolioReturn(weights, aligned.means);
    const volDaily = Math.sqrt(portfolioVariance(weights, aligned.cov));
    const ann = annualize(meanDaily, volDaily);
    feasible.push({
      weights,
      assetIds,
      expectedReturn: ann.ret,
      volatility: ann.vol,
      sharpe: ann.sharpe,
      diversificationRatio: diversificationRatio(weights, aligned),
      dominated: false,
      efficient: false,
    });
  }

  const classified = markFrontier(feasible);
  const frontier = classified.filter((p) => p.efficient).sort((a, b) => a.volatility - b.volatility);

  const minVariance = classified.reduce<FrontierPoint | null>((best, p) =>
    best == null || p.volatility < best.volatility ? p : best, null);
  const maxSharpe = classified.reduce<FrontierPoint | null>((best, p) =>
    best == null || p.sharpe > best.sharpe ? p : best, null);
  const maxDiversification = classified.reduce<FrontierPoint | null>((best, p) =>
    best == null || p.diversificationRatio > best.diversificationRatio ? p : best, null);

  let targetReturnPortfolio: FrontierPoint | null = null;
  if (targetReturn != null) {
    targetReturnPortfolio = classified.reduce<FrontierPoint | null>((best, p) => {
      if (p.expectedReturn < targetReturn) return best;
      return best == null || p.volatility < best.volatility ? p : best;
    }, null);
  }
  let targetVolPortfolio: FrontierPoint | null = null;
  if (targetVol != null) {
    targetVolPortfolio = classified.reduce<FrontierPoint | null>((best, p) => {
      if (p.volatility > targetVol) return best;
      return best == null || p.expectedReturn > best.expectedReturn ? p : best;
    }, null);
  }

  return {
    method: "GRID_SEARCH_CONSTRAINED",
    disclaimer,
    assetIds,
    feasible: classified,
    rejected,
    frontier,
    minVariance,
    maxSharpe,
    maxDiversification,
    targetReturnPortfolio,
    targetVolPortfolio,
    combinationsExplored: explored,
    cappedByLimit: capped,
  };
}