// Phase 21.6 · Stage 1 — Parameter sensitivity analysis.
// Pure. Never mutates production defaults. The caller supplies a runner that
// executes the existing unified backtest for a given parameter set; this
// module owns only grid generation, surface metrics and classification.

export type ParameterSpec = {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
};

export type ParameterCombination = Readonly<Record<string, number>>;

export type SensitivityMetrics = {
  readonly trades: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly netPnl: number;
  readonly maxDrawdown: number;
  readonly recoveryFactor: number;
  readonly stabilityScore: number;
  readonly oosScore: number;
  readonly monteCarloMedian: number;
  readonly monteCarloP5: number;
};

export type SensitivityCell = {
  readonly params: ParameterCombination;
  readonly metrics: SensitivityMetrics | null; // null ⇒ insufficient data / not run
  readonly reason?: string;
};

export type SensitivityClassification =
  | "STABLE_PLATEAU"
  | "NARROW_OPTIMUM"
  | "MONOTONIC"
  | "ERRATIC"
  | "INSUFFICIENT_DATA";

export type SensitivitySurface = {
  readonly primaryMetric: keyof SensitivityMetrics;
  readonly classification: SensitivityClassification;
  readonly bestParams: ParameterCombination | null;
  readonly worstParams: ParameterCombination | null;
  readonly stabilityBand: { readonly p25: number; readonly p50: number; readonly p75: number };
  readonly meanValue: number;
  readonly stdDev: number;
  readonly reason: string;
};

function nearlyEqual(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

// -- Grid generation. Deterministic, cross-product of specs.
export function generateParameterGrid(specs: readonly ParameterSpec[]): ParameterCombination[] {
  if (specs.length === 0) return [{}];
  const axes: Array<{ name: string; values: number[] }> = specs.map((s) => {
    if (s.step <= 0 || s.max < s.min) throw new Error(`INVALID_GRID: ${s.name} min=${s.min} max=${s.max} step=${s.step}`);
    const vals: number[] = [];
    for (let v = s.min; v <= s.max + 1e-9; v += s.step) vals.push(Number(v.toFixed(6)));
    return { name: s.name, values: vals };
  });
  const out: ParameterCombination[] = [];
  const cursor = new Array<number>(axes.length).fill(0);
  while (true) {
    const combo: Record<string, number> = {};
    for (let i = 0; i < axes.length; i++) combo[axes[i].name] = axes[i].values[cursor[i]];
    out.push(combo);
    let k = axes.length - 1;
    while (k >= 0) {
      cursor[k]++;
      if (cursor[k] < axes[k].values.length) break;
      cursor[k] = 0; k--;
    }
    if (k < 0) break;
  }
  return out;
}

// -- Runner wrapper. Purely orchestration.
export async function runParameterSensitivity(
  combos: readonly ParameterCombination[],
  runFn: (params: ParameterCombination) => Promise<SensitivityMetrics | null>,
): Promise<SensitivityCell[]> {
  const cells: SensitivityCell[] = [];
  for (const params of combos) {
    try {
      const metrics = await runFn(params);
      if (!metrics || metrics.trades < 5) {
        cells.push({ params, metrics: null, reason: metrics ? `INSUFFICIENT_DATA: trades=${metrics.trades}` : "NO_METRICS" });
      } else {
        cells.push({ params, metrics });
      }
    } catch (e) {
      cells.push({ params, metrics: null, reason: e instanceof Error ? e.message : "RUN_ERROR" });
    }
  }
  return cells;
}

// -- Surface classification. Uses a caller-selected metric.
export function classifySensitivitySurface(
  cells: readonly SensitivityCell[],
  metric: keyof SensitivityMetrics = "expectancy",
): SensitivitySurface {
  const valid = cells.filter((c): c is SensitivityCell & { metrics: SensitivityMetrics } => c.metrics !== null);
  if (valid.length < 3) {
    return {
      primaryMetric: metric,
      classification: "INSUFFICIENT_DATA",
      bestParams: null, worstParams: null,
      stabilityBand: { p25: 0, p50: 0, p75: 0 },
      meanValue: 0, stdDev: 0,
      reason: `INSUFFICIENT_DATA: only ${valid.length} valid parameter cells (need ≥ 3)`,
    };
  }
  const values = valid.map((c) => c.metrics[metric] as number);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const range = sorted[sorted.length - 1] - sorted[0];
  const cv = mean !== 0 ? std / Math.abs(mean) : std > 0 ? Infinity : 0;

  const bestIdx = values.indexOf(sorted[sorted.length - 1]);
  const worstIdx = values.indexOf(sorted[0]);

  // Monotonic: strictly increasing/decreasing when ordered by the first param axis.
  const firstKey = Object.keys(valid[0].params)[0];
  const orderedByFirst = [...valid].sort((a, b) => (a.params[firstKey] ?? 0) - (b.params[firstKey] ?? 0));
  let inc = 0, dec = 0;
  for (let i = 1; i < orderedByFirst.length; i++) {
    const prev = orderedByFirst[i - 1].metrics[metric] as number;
    const curr = orderedByFirst[i].metrics[metric] as number;
    if (curr > prev) inc++;
    else if (curr < prev) dec++;
  }
  const totalPairs = orderedByFirst.length - 1;
  const monotonicScore = Math.max(inc, dec) / Math.max(1, totalPairs);

  // Plateau: many values close to the top.
  const top = sorted[sorted.length - 1];
  const secondTop = sorted.length >= 2 ? sorted[sorted.length - 2] : top;
  const peakDominance = Math.abs(secondTop) > 1e-9 ? Math.abs(top) / Math.abs(secondTop) : (top !== 0 ? Infinity : 1);
  const eps = Math.max(1e-9, Math.abs(top) * 0.1);
  const plateauCount = values.filter((v) => nearlyEqual(v, top, eps)).length;
  const plateauFrac = plateauCount / values.length;

  let classification: SensitivityClassification;
  let reason: string;
  if (range === 0) {
    classification = "STABLE_PLATEAU";
    reason = "All parameter combinations produced the same metric value.";
  } else if (monotonicScore >= 0.9) {
    classification = "MONOTONIC";
    reason = `${(monotonicScore * 100).toFixed(0)}% of adjacent cells move in one direction along ${firstKey}.`;
  } else if (peakDominance >= 5 && plateauFrac <= 0.2) {
    classification = "NARROW_OPTIMUM";
    reason = `Peak dominates (top/second=${peakDominance.toFixed(1)}×) with plateau share ${(plateauFrac * 100).toFixed(0)}%.`;
  } else if (cv > 1.0 && plateauFrac <= 0.2) {
    classification = "ERRATIC";
    reason = `High dispersion (cv=${cv.toFixed(2)}) with no dominant direction.`;
  } else if (plateauFrac >= 0.4 && cv < 0.25) {
    classification = "STABLE_PLATEAU";
    reason = `${(plateauFrac * 100).toFixed(0)}% of cells are within 10% of the peak; coefficient of variation ${cv.toFixed(2)}.`;
  } else if (plateauFrac <= 0.15 && cv > 0.5) {
    classification = "NARROW_OPTIMUM";
    reason = `Peak isolated to ${(plateauFrac * 100).toFixed(0)}% of cells; coefficient of variation ${cv.toFixed(2)}.`;
  } else {
    classification = "STABLE_PLATEAU";
    reason = `Moderate dispersion (cv=${cv.toFixed(2)}) with plateau share ${(plateauFrac * 100).toFixed(0)}%.`;
  }

  return {
    primaryMetric: metric,
    classification,
    bestParams: valid[bestIdx].params,
    worstParams: valid[worstIdx].params,
    stabilityBand: { p25: q(0.25), p50: q(0.5), p75: q(0.75) },
    meanValue: mean,
    stdDev: std,
    reason,
  };
}

// -- Deterministic Run ID.
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function computeSensitivityRunId(input: {
  baseRunId: string;
  researchRunId?: string;
  strategy: string;
  formula: string;
  grid: readonly ParameterSpec[];
  from: string;
  to: string;
  dataHash: string;
}): string {
  const gridKey = input.grid
    .map((s) => `${s.name}:${s.min}:${s.max}:${s.step}`)
    .join(",");
  const key = [input.baseRunId, input.researchRunId ?? "", input.strategy, input.formula, gridKey, input.from, input.to, input.dataHash].join("|");
  return `SENSITIVITY_V1:${fnv1a(key)}`;
}

export const SENSITIVITY_VERSION = "SENSITIVITY_V1";

// -- Named parameter grids (SMC + Hybrid) for the UI.
export const SMC_PARAMETER_KEYS = [
  "minScore",
  "structureWindow",
  "fvgValidityBars",
  "obValidityBars",
  "cooldownBars",
  "atrStopMultiplier",
  "rr",
] as const;
export type SmcParameterKey = (typeof SMC_PARAMETER_KEYS)[number];

export const HYBRID_PARAMETER_KEYS = [
  "astroWeight",
  "smcWeight",
  "agreementBonus",
  "dataQualityWeight",
  "hybridThreshold",
] as const;
export type HybridParameterKey = (typeof HYBRID_PARAMETER_KEYS)[number];
