// Phase 21.9 · Stage 2 — Before vs After parameter comparison.
// Pure. Consumes the sensitivity cells + optimizer result and produces a
// side-by-side view for the UI. Never recomputes upstream research.

import type {
  ParameterCombination,
  SensitivityCell,
  SensitivityMetrics,
} from "./parameter-sensitivity";
import type {
  OptimizerAggregateInputs,
  OptimizerResult,
} from "./explainable-optimizer";

export type ComparisonMetrics = {
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly netPnl: number;
  readonly trades: number;
  readonly monteCarloP5: number;
  readonly monteCarloMedian: number;
  readonly oosScore: number;
  readonly stabilityScore: number;
};

export type ComparisonSide = {
  readonly label: "CURRENT" | "RECOMMENDED";
  readonly params: ParameterCombination | null;
  readonly metrics: ComparisonMetrics | null;
  readonly missing: readonly string[];
};

export type ComparisonDelta = {
  readonly key: keyof ComparisonMetrics;
  readonly current: number;
  readonly recommended: number;
  readonly delta: number;
  readonly pct: number | null;
  readonly favorsRecommended: boolean;
};

export type ComparisonReport = {
  readonly current: ComparisonSide;
  readonly recommended: ComparisonSide;
  readonly deltas: readonly ComparisonDelta[];
  readonly recommendationConfidence: OptimizerResult["confidence"];
  readonly overfitRisk: OptimizerResult["overfitRisk"];
};

const KEYS: readonly (keyof ComparisonMetrics)[] = [
  "profitFactor",
  "expectancy",
  "maxDrawdown",
  "netPnl",
  "trades",
  "monteCarloP5",
  "monteCarloMedian",
  "oosScore",
  "stabilityScore",
];

// Higher-is-better for every metric except maxDrawdown.
const HIGHER_IS_BETTER: Record<keyof ComparisonMetrics, boolean> = {
  profitFactor: true,
  expectancy: true,
  maxDrawdown: false,
  netPnl: true,
  trades: true,
  monteCarloP5: true,
  monteCarloMedian: true,
  oosScore: true,
  stabilityScore: true,
};

function pickMetrics(m: SensitivityMetrics): ComparisonMetrics {
  return {
    profitFactor: m.profitFactor,
    expectancy: m.expectancy,
    maxDrawdown: m.maxDrawdown,
    netPnl: m.netPnl,
    trades: m.trades,
    monteCarloP5: m.monteCarloP5,
    monteCarloMedian: m.monteCarloMedian,
    oosScore: m.oosScore,
    stabilityScore: m.stabilityScore,
  };
}

function findCell(
  cells: readonly SensitivityCell[],
  params: ParameterCombination | null | undefined,
): SensitivityCell | null {
  if (!params) return null;
  for (const c of cells) {
    let match = true;
    for (const k of Object.keys(params)) {
      const a = params[k];
      const b = c.params[k];
      if (a === undefined || b === undefined) { match = false; break; }
      if (Math.abs(a - b) > 1e-6) { match = false; break; }
    }
    if (match) return c;
  }
  return null;
}

export function buildBeforeAfterReport(input: {
  readonly currentParameters: ParameterCombination | null;
  readonly cells: readonly SensitivityCell[];
  readonly optimizer: OptimizerResult;
  readonly aggregate: OptimizerAggregateInputs;
}): ComparisonReport {
  const currentCell = findCell(input.cells, input.currentParameters);
  const currentSide: ComparisonSide = {
    label: "CURRENT",
    params: input.currentParameters,
    metrics: currentCell?.metrics ? pickMetrics(currentCell.metrics) : null,
    missing: currentCell?.metrics ? [] : ["current_cell_missing_in_sensitivity_grid"],
  };
  const recommendedCell = findCell(input.cells, input.optimizer.recommendedParameters);
  const recommendedSide: ComparisonSide = {
    label: "RECOMMENDED",
    params: input.optimizer.recommendedParameters,
    metrics: recommendedCell?.metrics ? pickMetrics(recommendedCell.metrics) : null,
    missing: recommendedCell?.metrics ? [] : ["recommended_cell_missing_in_sensitivity_grid"],
  };
  const deltas: ComparisonDelta[] = [];
  if (currentSide.metrics && recommendedSide.metrics) {
    for (const k of KEYS) {
      const cur = currentSide.metrics[k];
      const rec = recommendedSide.metrics[k];
      const delta = rec - cur;
      const pct = cur !== 0 ? delta / Math.abs(cur) : null;
      const favorsRecommended = HIGHER_IS_BETTER[k] ? rec > cur : rec < cur;
      deltas.push({ key: k, current: cur, recommended: rec, delta, pct, favorsRecommended });
    }
  }
  return {
    current: currentSide,
    recommended: recommendedSide,
    deltas,
    recommendationConfidence: input.optimizer.confidence,
    overfitRisk: input.optimizer.overfitRisk,
  };
}