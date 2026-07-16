// Phase 21.9 · Stage 1 — Explainable Strategy Optimizer.
//
// Pure, deterministic, research-only. Consumes existing research outputs
// (sensitivity cells, walk-forward, Monte Carlo, robustness, recommendation
// validation, data quality) and recommends a *stable parameter region*
// (never a single isolated cell) for SMC_V1 or ASTRO_SMC_HYBRID_V1.
//
// Never mutates production defaults. Never touches broker / decision / risk
// / live paths. Never changes upstream Run IDs. Every score is transparent:
// raw metric → normalised → weight → contribution → reason. Hard safety
// gates block a recommendation regardless of score.

import type {
  ParameterCombination,
  ParameterSpec,
  SensitivityCell,
  SensitivityClassification,
  SensitivityMetrics,
} from "./parameter-sensitivity";
import type { RobustnessStatus } from "./robustness";
import type { ReliabilityRating } from "./recommendation-validator";

export const EXPLAINABLE_OPTIMIZER_VERSION = "EXPLAINABLE_OPTIMIZER_V1" as const;
export const EXPLAINABLE_OPTIMIZER_DISCLAIMER =
  "RESEARCH OPTIMIZATION ONLY — NO PRODUCTION PARAMETER CHANGES";

export type OptimizerStrategyId = "SMC_V1" | "ASTRO_SMC_HYBRID_V1";
export type OptimizerDataQuality = "GOOD" | "PARTIAL" | "UNAVAILABLE";

export type ObjectiveWeights = {
  readonly oosExpectancy: number;
  readonly walkForwardStability: number;
  readonly monteCarloP5: number;
  readonly robustness: number;
  readonly profitFactorConsistency: number;
  readonly drawdownResilience: number;
  readonly sensitivityPlateauQuality: number;
  readonly recommendationCalibration: number;
};

export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveWeights = Object.freeze({
  oosExpectancy: 0.2,
  walkForwardStability: 0.15,
  monteCarloP5: 0.15,
  robustness: 0.15,
  profitFactorConsistency: 0.1,
  drawdownResilience: 0.1,
  sensitivityPlateauQuality: 0.1,
  recommendationCalibration: 0.05,
});

export type SafetyGateConfig = {
  readonly minTrades: number;
  readonly minWalkForwardWindows: number;
  readonly minNeighbors: number;
  readonly ruinThresholdRatio: number;
  readonly minCalibrationRating: ReliabilityRating;
};

export const DEFAULT_SAFETY_GATES: SafetyGateConfig = Object.freeze({
  minTrades: 20,
  minWalkForwardWindows: 3,
  minNeighbors: 2,
  ruinThresholdRatio: 0.9,
  minCalibrationRating: "FAIR",
});

export type OptimizerAggregateInputs = {
  readonly walkForwardStability: number;
  readonly oosConsistency: number;
  readonly walkForwardWindows: number;
  readonly monteCarloP5FinalEquity: number;
  readonly monteCarloMedianFinalEquity: number;
  readonly monteCarloSimulations: number;
  readonly startingCapital: number;
  readonly robustnessStatus: RobustnessStatus;
  readonly robustnessScore: number;
  readonly sensitivityClassification: SensitivityClassification;
  readonly profitFactorConsistency: number;
  readonly calibrationRating: ReliabilityRating;
  readonly crossAssetConsistency: number;
  readonly dataQuality: OptimizerDataQuality;
};

export type OptimizerConfig = {
  readonly weights?: Partial<ObjectiveWeights>;
  readonly gates?: Partial<SafetyGateConfig>;
};

export type OptimizerRunInput = {
  readonly strategy: OptimizerStrategyId;
  readonly formulaVersion: string;
  readonly baseRunId: string;
  readonly researchRunIds: Readonly<Record<string, string>>;
  readonly parameterSpace: readonly ParameterSpec[];
  readonly sensitivityCells: readonly SensitivityCell[];
  readonly aggregate: OptimizerAggregateInputs;
  readonly provider: string;
  readonly from: string;
  readonly to: string;
  readonly dataHash: string;
  readonly costs?: string;
  readonly config?: OptimizerConfig;
};

export type ObjectiveContribution = {
  readonly key: keyof ObjectiveWeights;
  readonly weight: number;
  readonly rawValue: number;
  readonly normalisedScore: number;
  readonly contribution: number;
  readonly formula: string;
};

export type OverfitRisk = "LOW" | "MODERATE" | "HIGH" | "REJECTED";
export type OptimizerConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type OptimizerAlternativeLabel = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export type SafeRange = Readonly<Record<string, { readonly min: number; readonly max: number }>>;

export type CandidateRegion = {
  readonly center: ParameterCombination;
  readonly neighborCount: number;
  readonly safeRange: SafeRange;
  readonly objectiveScore: number;
  readonly cellIndices: readonly number[];
  readonly meanExpectancy: number;
  readonly meanNetPnl: number;
  readonly meanProfitFactor: number;
  readonly meanDrawdown: number;
  readonly meanTrades: number;
  readonly monteCarloP5: number;
};

export type RejectedRegion = {
  readonly center: ParameterCombination;
  readonly objectiveScore: number;
  readonly reasons: readonly string[];
};

export type OptimizerAlternative = CandidateRegion & {
  readonly label: OptimizerAlternativeLabel;
  readonly expectedBehavior: string;
  readonly overfitRisk: OverfitRisk;
  readonly confidence: OptimizerConfidence;
};

export type OptimizerExplanation = {
  readonly kind: "ACCEPT" | "REJECT" | "PREFER" | "NOTE";
  readonly parameter?: string;
  readonly message: string;
  readonly evidence: Readonly<Record<string, number | string>>;
};

export type OptimizerResult = {
  readonly version: typeof EXPLAINABLE_OPTIMIZER_VERSION;
  readonly disclaimer: typeof EXPLAINABLE_OPTIMIZER_DISCLAIMER;
  readonly strategy: OptimizerStrategyId;
  readonly formulaVersion: string;
  readonly runId: string;
  readonly recommendedRegion: CandidateRegion | null;
  readonly recommendedParameters: ParameterCombination | null;
  readonly alternatives: readonly OptimizerAlternative[];
  readonly rejectedRegions: readonly RejectedRegion[];
  readonly objectiveContributions: readonly ObjectiveContribution[];
  readonly objectiveScore: number;
  readonly overfitRisk: OverfitRisk;
  readonly confidence: OptimizerConfidence;
  readonly explanations: readonly OptimizerExplanation[];
  readonly weights: ObjectiveWeights;
  readonly gates: SafetyGateConfig;
  readonly evidence: Readonly<Record<string, number | string>>;
  readonly rejectionReasons: readonly string[];
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function mergeWeights(w?: Partial<ObjectiveWeights>): ObjectiveWeights {
  return { ...DEFAULT_OBJECTIVE_WEIGHTS, ...(w ?? {}) };
}
function mergeGates(g?: Partial<SafetyGateConfig>): SafetyGateConfig {
  return { ...DEFAULT_SAFETY_GATES, ...(g ?? {}) };
}
const RATING_RANK: Record<ReliabilityRating, number> = {
  UNRELIABLE: 0, POOR: 1, FAIR: 2, GOOD: 3, EXCELLENT: 4,
};
function ratingMeets(actual: ReliabilityRating, min: ReliabilityRating): boolean {
  return RATING_RANK[actual] >= RATING_RANK[min];
}
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function sensitivityPlateauQuality(c: SensitivityClassification): number {
  switch (c) {
    case "STABLE_PLATEAU": return 1;
    case "MONOTONIC": return 0.7;
    case "NARROW_OPTIMUM": return 0.2;
    case "ERRATIC": return 0.05;
    default: return 0;
  }
}
function calibrationScore(r: ReliabilityRating): number {
  return RATING_RANK[r] / 4;
}

function neighborsOf(
  index: number,
  cells: readonly SensitivityCell[],
  space: readonly ParameterSpec[],
): readonly number[] {
  const target = cells[index].params;
  const out: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (i === index) continue;
    if (cells[i].metrics === null) continue;
    const other = cells[i].params;
    let dist = 0;
    let ok = true;
    for (const spec of space) {
      const a = target[spec.name] ?? 0;
      const b = other[spec.name] ?? 0;
      const step = Math.max(1e-9, spec.step);
      const d = Math.abs(a - b) / step;
      if (d > 1.0001) { ok = false; break; }
      dist += d;
    }
    if (ok && dist > 0 && dist <= 1.0001) out.push(i);
  }
  return out;
}

function safeRangeFrom(
  center: ParameterCombination,
  groupCells: readonly SensitivityCell[],
  space: readonly ParameterSpec[],
): SafeRange {
  const out: Record<string, { min: number; max: number }> = {};
  for (const spec of space) {
    let mn = center[spec.name] ?? 0;
    let mx = mn;
    for (const c of groupCells) {
      const v = c.params[spec.name] ?? 0;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    out[spec.name] = { min: mn, max: mx };
  }
  return out;
}

function cellObjective(
  cell: SensitivityCell,
  agg: OptimizerAggregateInputs,
  weights: ObjectiveWeights,
): { score: number; contributions: ObjectiveContribution[] } {
  const m = cell.metrics;
  if (!m) return { score: 0, contributions: [] };
  const mcRatio = agg.startingCapital > 0 ? m.monteCarloP5 / agg.startingCapital : 0;
  const mcScore = clamp01((mcRatio - 0.8) / 0.4);
  const ddScore = clamp01(1 - m.maxDrawdown / Math.max(1e-9, agg.startingCapital * 0.5));
  const pfScore = clamp01((m.profitFactor - 1) / 1.5);
  const expScore = clamp01(m.expectancy / 5);
  const sensScore = sensitivityPlateauQuality(agg.sensitivityClassification);
  const wfScore = clamp01(agg.walkForwardStability);
  const robScore = clamp01(agg.robustnessScore);
  const calibScore = calibrationScore(agg.calibrationRating);

  const contributions: ObjectiveContribution[] = [
    { key: "oosExpectancy", weight: weights.oosExpectancy, rawValue: m.expectancy, normalisedScore: expScore, contribution: weights.oosExpectancy * expScore, formula: "clamp(expectancy / 5, 0, 1)" },
    { key: "walkForwardStability", weight: weights.walkForwardStability, rawValue: agg.walkForwardStability, normalisedScore: wfScore, contribution: weights.walkForwardStability * wfScore, formula: "clamp(walkForwardStability, 0, 1)" },
    { key: "monteCarloP5", weight: weights.monteCarloP5, rawValue: mcRatio, normalisedScore: mcScore, contribution: weights.monteCarloP5 * mcScore, formula: "clamp((mcP5/capital-0.8)/0.4, 0, 1)" },
    { key: "robustness", weight: weights.robustness, rawValue: agg.robustnessScore, normalisedScore: robScore, contribution: weights.robustness * robScore, formula: "clamp(robustnessScore, 0, 1)" },
    { key: "profitFactorConsistency", weight: weights.profitFactorConsistency, rawValue: m.profitFactor, normalisedScore: pfScore, contribution: weights.profitFactorConsistency * pfScore, formula: "clamp((pf-1)/1.5, 0, 1)" },
    { key: "drawdownResilience", weight: weights.drawdownResilience, rawValue: m.maxDrawdown, normalisedScore: ddScore, contribution: weights.drawdownResilience * ddScore, formula: "clamp(1 - maxDD/(capital*0.5), 0, 1)" },
    { key: "sensitivityPlateauQuality", weight: weights.sensitivityPlateauQuality, rawValue: 0, normalisedScore: sensScore, contribution: weights.sensitivityPlateauQuality * sensScore, formula: `surface=${agg.sensitivityClassification}` },
    { key: "recommendationCalibration", weight: weights.recommendationCalibration, rawValue: 0, normalisedScore: calibScore, contribution: weights.recommendationCalibration * calibScore, formula: `calibration=${agg.calibrationRating}` },
  ];
  const totalWeight = contributions.reduce((a, c) => a + c.weight, 0) || 1;
  const score = contributions.reduce((a, c) => a + c.contribution, 0) / totalWeight;
  return { score, contributions };
}

function evaluateGates(
  cell: SensitivityCell,
  agg: OptimizerAggregateInputs,
  neighborCount: number,
  gates: SafetyGateConfig,
): readonly string[] {
  const reasons: string[] = [];
  const m = cell.metrics;
  if (!m) { reasons.push("NO_METRICS"); return reasons; }
  if (m.trades < gates.minTrades) reasons.push(`MIN_TRADES: ${m.trades} < ${gates.minTrades}`);
  if (m.expectancy <= 0) reasons.push(`NON_POSITIVE_OOS_EXPECTANCY: ${m.expectancy.toFixed(2)}`);
  if (agg.startingCapital > 0) {
    const ratio = m.monteCarloP5 / agg.startingCapital;
    if (ratio < gates.ruinThresholdRatio) reasons.push(`MONTE_CARLO_RUIN_RISK: p5/capital=${ratio.toFixed(2)} < ${gates.ruinThresholdRatio}`);
  }
  if (neighborCount < gates.minNeighbors) reasons.push(`INSUFFICIENT_NEIGHBORS: ${neighborCount} < ${gates.minNeighbors}`);
  return reasons;
}

function meanBy(cells: SensitivityCell[], f: (m: SensitivityMetrics) => number): number {
  const vals = cells.map((c) => c.metrics ? f(c.metrics) : NaN).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function buildRegion(
  index: number,
  neighborIdx: readonly number[],
  cells: readonly SensitivityCell[],
  space: readonly ParameterSpec[],
  agg: OptimizerAggregateInputs,
  weights: ObjectiveWeights,
): CandidateRegion {
  const center = cells[index];
  const groupCells = [center, ...neighborIdx.map((i) => cells[i])].filter(
    (c): c is SensitivityCell & { metrics: SensitivityMetrics } => c.metrics !== null,
  );
  const scores = groupCells.map((c) => cellObjective(c, agg, weights).score);
  const objectiveScore = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  return {
    center: center.params,
    neighborCount: neighborIdx.length,
    safeRange: safeRangeFrom(center.params, groupCells, space),
    objectiveScore,
    cellIndices: [index, ...neighborIdx],
    meanExpectancy: meanBy(groupCells, (m) => m.expectancy),
    meanNetPnl: meanBy(groupCells, (m) => m.netPnl),
    meanProfitFactor: meanBy(groupCells, (m) => m.profitFactor),
    meanDrawdown: meanBy(groupCells, (m) => m.maxDrawdown),
    meanTrades: meanBy(groupCells, (m) => m.trades),
    monteCarloP5: meanBy(groupCells, (m) => m.monteCarloP5),
  };
}

function overfitRiskOf(agg: OptimizerAggregateInputs, region: CandidateRegion): OverfitRisk {
  if (agg.robustnessStatus === "OVERFIT") return "REJECTED";
  if (agg.sensitivityClassification === "NARROW_OPTIMUM" || agg.sensitivityClassification === "ERRATIC") return "HIGH";
  if (region.neighborCount <= 1) return "HIGH";
  if (agg.sensitivityClassification === "MONOTONIC") return "MODERATE";
  if (region.neighborCount >= 3 && agg.sensitivityClassification === "STABLE_PLATEAU") return "LOW";
  return "MODERATE";
}

function confidenceOf(
  agg: OptimizerAggregateInputs,
  region: CandidateRegion,
  runnerUp: CandidateRegion | null,
): OptimizerConfidence {
  const margin = runnerUp ? region.objectiveScore - runnerUp.objectiveScore : region.objectiveScore;
  const strong =
    agg.walkForwardWindows >= 5 &&
    agg.monteCarloSimulations >= 200 &&
    region.meanTrades >= 40 &&
    ratingMeets(agg.calibrationRating, "GOOD") &&
    agg.dataQuality === "GOOD" &&
    region.neighborCount >= 3 &&
    margin >= 0.05;
  if (strong) return "HIGH";
  const partial =
    agg.walkForwardWindows >= 3 &&
    region.meanTrades >= 20 &&
    ratingMeets(agg.calibrationRating, "FAIR") &&
    agg.dataQuality !== "UNAVAILABLE" &&
    region.neighborCount >= 2;
  if (partial) return "MEDIUM";
  const weak = region.meanTrades >= 10 && agg.walkForwardWindows >= 2;
  if (weak) return "LOW";
  return "INSUFFICIENT";
}

export function computeOptimizerRunId(input: {
  strategy: OptimizerStrategyId;
  formulaVersion: string;
  baseRunId: string;
  researchRunIds: Readonly<Record<string, string>>;
  parameterSpace: readonly ParameterSpec[];
  weights: ObjectiveWeights;
  gates: SafetyGateConfig;
  provider: string;
  from: string;
  to: string;
  dataHash: string;
  costs?: string;
}): string {
  const spaceKey = input.parameterSpace.map((s) => `${s.name}:${s.min}:${s.max}:${s.step}`).join(",");
  const rrids = Object.keys(input.researchRunIds).sort().map((k) => `${k}=${input.researchRunIds[k]}`).join(",");
  const wKey = Object.entries(input.weights).sort().map(([k, v]) => `${k}=${v}`).join(",");
  const gKey = Object.entries(input.gates).sort().map(([k, v]) => `${k}=${v}`).join(",");
  const key = [
    input.strategy, input.formulaVersion, input.baseRunId, rrids, spaceKey,
    wKey, gKey, input.provider, input.from, input.to, input.dataHash, input.costs ?? "",
  ].join("|");
  return `EXPLAINABLE_OPTIMIZER_V1:${fnv1a(key)}`;
}

function labelAlt(
  region: CandidateRegion,
  label: OptimizerAlternativeLabel,
  behavior: string,
  agg: OptimizerAggregateInputs,
): OptimizerAlternative {
  return {
    ...region,
    label,
    expectedBehavior: behavior,
    overfitRisk: overfitRiskOf(agg, region),
    confidence: confidenceOf(agg, region, null),
  };
}

function dedupeRegions(alts: OptimizerAlternative[]): OptimizerAlternative[] {
  const seen = new Set<string>();
  const out: OptimizerAlternative[] = [];
  for (const a of alts) {
    const key = JSON.stringify(a.center);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

export function runExplainableOptimization(input: OptimizerRunInput): OptimizerResult {
  const weights = mergeWeights(input.config?.weights);
  const gates = mergeGates(input.config?.gates);
  const explanations: OptimizerExplanation[] = [];
  const rejections: RejectedRegion[] = [];
  const rejectionReasons: string[] = [];

  const runId = computeOptimizerRunId({
    strategy: input.strategy,
    formulaVersion: input.formulaVersion,
    baseRunId: input.baseRunId,
    researchRunIds: input.researchRunIds,
    parameterSpace: input.parameterSpace,
    weights, gates,
    provider: input.provider, from: input.from, to: input.to,
    dataHash: input.dataHash, costs: input.costs,
  });

  const aggregateBlockers: string[] = [];
  if (input.aggregate.robustnessStatus === "OVERFIT") aggregateBlockers.push("ROBUSTNESS_OVERFIT");
  if (input.aggregate.sensitivityClassification === "NARROW_OPTIMUM") aggregateBlockers.push("SENSITIVITY_NARROW_OPTIMUM");
  if (input.aggregate.sensitivityClassification === "ERRATIC") aggregateBlockers.push("SENSITIVITY_ERRATIC");
  if (input.aggregate.sensitivityClassification === "INSUFFICIENT_DATA") aggregateBlockers.push("SENSITIVITY_INSUFFICIENT_DATA");
  if (input.aggregate.dataQuality === "UNAVAILABLE") aggregateBlockers.push("DATA_QUALITY_UNAVAILABLE");
  if (input.aggregate.walkForwardWindows < gates.minWalkForwardWindows) aggregateBlockers.push(`INSUFFICIENT_WF_WINDOWS: ${input.aggregate.walkForwardWindows} < ${gates.minWalkForwardWindows}`);
  if (!ratingMeets(input.aggregate.calibrationRating, gates.minCalibrationRating)) aggregateBlockers.push(`CALIBRATION_BELOW_${gates.minCalibrationRating}: ${input.aggregate.calibrationRating}`);

  const validCells = input.sensitivityCells
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.metrics !== null);

  const candidates: Array<{ region: CandidateRegion; index: number; gateReasons: readonly string[] }> = [];
  for (const { c, i } of validCells) {
    const neighborIdx = neighborsOf(i, input.sensitivityCells, input.parameterSpace);
    const gateReasons = evaluateGates(c, input.aggregate, neighborIdx.length, gates);
    const region = buildRegion(i, neighborIdx, input.sensitivityCells, input.parameterSpace, input.aggregate, weights);
    candidates.push({ region, index: i, gateReasons });
  }

  candidates.sort((a, b) => b.region.objectiveScore - a.region.objectiveScore);

  const accepted = candidates.filter((c) => c.gateReasons.length === 0 && aggregateBlockers.length === 0);
  const rejected = candidates.filter((c) => c.gateReasons.length > 0 || aggregateBlockers.length > 0);
  for (const r of rejected) {
    const reasons = [...aggregateBlockers, ...r.gateReasons];
    rejections.push({ center: r.region.center, objectiveScore: r.region.objectiveScore, reasons });
  }

  const objectiveContributions = validCells.length > 0
    ? cellObjective(validCells[0].c, input.aggregate, weights).contributions
    : [];

  if (aggregateBlockers.length > 0) {
    rejectionReasons.push(...aggregateBlockers);
    for (const b of aggregateBlockers) {
      explanations.push({ kind: "REJECT", message: `Aggregate gate: ${b}`, evidence: { blocker: b } });
    }
  }

  if (accepted.length === 0) {
    return {
      version: EXPLAINABLE_OPTIMIZER_VERSION,
      disclaimer: EXPLAINABLE_OPTIMIZER_DISCLAIMER,
      strategy: input.strategy,
      formulaVersion: input.formulaVersion,
      runId,
      recommendedRegion: null,
      recommendedParameters: null,
      alternatives: [],
      rejectedRegions: rejections,
      objectiveContributions,
      objectiveScore: 0,
      overfitRisk: aggregateBlockers.length > 0 ? "REJECTED" : "HIGH",
      confidence: "INSUFFICIENT",
      explanations,
      weights, gates,
      evidence: {
        acceptedCells: 0,
        totalCells: input.sensitivityCells.length,
        blockers: aggregateBlockers.join(",") || "PER_CELL_GATES",
      },
      rejectionReasons,
    };
  }

  const winner = accepted[0].region;
  const runnerUp = accepted[1]?.region ?? null;
  const overfitRisk = overfitRiskOf(input.aggregate, winner);
  const confidence = confidenceOf(input.aggregate, winner, runnerUp);

  const byDd = [...accepted].sort((a, b) => a.region.meanDrawdown - b.region.meanDrawdown);
  const byExpectancy = [...accepted].sort((a, b) => b.region.meanExpectancy - a.region.meanExpectancy);

  const conservative = byDd[0].region;
  const balanced = winner;
  const aggressive = byExpectancy[0].region;

  const alternatives = dedupeRegions([
    labelAlt(conservative, "CONSERVATIVE", "Prioritises drawdown resilience.", input.aggregate),
    labelAlt(balanced, "BALANCED", "Best composite objective score.", input.aggregate),
    labelAlt(aggressive, "AGGRESSIVE", "Prioritises expectancy — accepts wider drawdown.", input.aggregate),
  ]);

  explanations.push({
    kind: "ACCEPT",
    message: `Recommended region has ${winner.neighborCount} adjacent stable cells with mean expectancy ${winner.meanExpectancy.toFixed(2)}.`,
    evidence: {
      neighborCount: winner.neighborCount,
      meanExpectancy: Number(winner.meanExpectancy.toFixed(4)),
      meanProfitFactor: Number(winner.meanProfitFactor.toFixed(4)),
      objectiveScore: Number(winner.objectiveScore.toFixed(4)),
      surface: input.aggregate.sensitivityClassification,
    },
  });
  if (runnerUp) {
    explanations.push({
      kind: "PREFER",
      message: `Preferred over runner-up by score margin ${(winner.objectiveScore - runnerUp.objectiveScore).toFixed(3)}.`,
      evidence: {
        winnerScore: Number(winner.objectiveScore.toFixed(4)),
        runnerUpScore: Number(runnerUp.objectiveScore.toFixed(4)),
      },
    });
  }
  for (const r of rejections.slice(0, 5)) {
    explanations.push({
      kind: "REJECT",
      message: `Rejected region ${JSON.stringify(r.center)}: ${r.reasons.join("; ")}`,
      evidence: { objectiveScore: Number(r.objectiveScore.toFixed(4)) },
    });
  }

  return {
    version: EXPLAINABLE_OPTIMIZER_VERSION,
    disclaimer: EXPLAINABLE_OPTIMIZER_DISCLAIMER,
    strategy: input.strategy,
    formulaVersion: input.formulaVersion,
    runId,
    recommendedRegion: winner,
    recommendedParameters: winner.center,
    alternatives,
    rejectedRegions: rejections,
    objectiveContributions,
    objectiveScore: winner.objectiveScore,
    overfitRisk,
    confidence,
    explanations,
    weights, gates,
    evidence: {
      acceptedCells: accepted.length,
      totalCells: input.sensitivityCells.length,
      surface: input.aggregate.sensitivityClassification,
      robustness: input.aggregate.robustnessStatus,
      calibration: input.aggregate.calibrationRating,
      walkForwardWindows: input.aggregate.walkForwardWindows,
      monteCarloSimulations: input.aggregate.monteCarloSimulations,
      dataQuality: input.aggregate.dataQuality,
    },
    rejectionReasons,
  };
}

export const SMC_OPTIMIZER_PARAMETERS = [
  "minScore", "structureWindow", "fvgValidityBars", "obValidityBars",
  "cooldownBars", "atrStopMultiplier", "rr", "maxHoldBars",
] as const;
export type SmcOptimizerParameter = (typeof SMC_OPTIMIZER_PARAMETERS)[number];

export const HYBRID_OPTIMIZER_PARAMETERS = [
  "astroWeight", "smcWeight", "agreementBonus", "dataQualityWeight",
  "hybridThreshold", "smcMinScore", "atrStopMultiplier", "rr",
] as const;
export type HybridOptimizerParameter = (typeof HYBRID_OPTIMIZER_PARAMETERS)[number];
