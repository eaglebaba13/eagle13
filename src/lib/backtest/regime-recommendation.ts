// Phase 21.8 · Stage 1 — Deterministic strategy recommendation engine.
//
// Pure, research-only. Consumes existing research outputs (walk-forward,
// Monte Carlo, sensitivity, robustness, batch results) and ranks the
// existing strategy set by regime / instrument / timeframe. Never fetches
// data, never mutates inputs, never touches broker/decision/risk engines,
// never changes Run IDs of any upstream module.
//
// Every score is transparent: raw metric → normalised → weight →
// contribution → reason. Hard safety gates block a recommendation
// regardless of score.

import type { SensitivityClassification } from "./parameter-sensitivity";
import type { MarketRegime } from "./market-regime";
import type { RobustnessStatus } from "./robustness";

export const REGIME_RECOMMENDATION_VERSION = "REGIME_RECOMMENDATION_V1" as const;

export type RecommendationStrategyId =
  | "ASTRO"
  | "LEGACY"
  | "ABSOLUTE"
  | "SMC_V1"
  | "ASTRO_SMC_HYBRID_V1";

export type RecommendationFormulaId = string;

export type RecommendationDataQuality = "GOOD" | "PARTIAL" | "UNAVAILABLE";

export type RecommendationStatus =
  | "STRONG_RECOMMENDATION"
  | "RECOMMENDATION"
  | "CONDITIONAL"
  | "WAIT_FOR_MORE_DATA"
  | "AVOID"
  | "NO_VALID_STRATEGY"
  | "DATA_INCOMPLETE";

export type ScoringWeights = {
  readonly oosConsistency: number;
  readonly robustness: number;
  readonly monteCarloP5: number;
  readonly profitFactorConsistency: number;
  readonly expectancyConsistency: number;
  readonly drawdownResilience: number;
  readonly sensitivityPlateauQuality: number;
  readonly crossAssetConsistency: number;
  readonly sampleAdequacy: number;
  readonly dataQuality: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = Object.freeze({
  oosConsistency: 0.20,
  robustness: 0.20,
  monteCarloP5: 0.15,
  profitFactorConsistency: 0.10,
  expectancyConsistency: 0.10,
  drawdownResilience: 0.10,
  sensitivityPlateauQuality: 0.05,
  crossAssetConsistency: 0.05,
  sampleAdequacy: 0.03,
  dataQuality: 0.02,
});

export type SafetyThresholds = {
  readonly minTradeCount: number;
  readonly minCoveragePct: number;
  readonly minRegimeSamples: number;
  readonly maxDrawdownPct: number;
  readonly ruinP5RatioMin: number; // MC p5 / startingCapital
};

export const DEFAULT_SAFETY_THRESHOLDS: SafetyThresholds = Object.freeze({
  minTradeCount: 30,
  minCoveragePct: 0.5,
  minRegimeSamples: 10,
  maxDrawdownPct: 0.4,
  ruinP5RatioMin: 0.75,
});

export type StrategyEvidence = {
  readonly strategy: RecommendationStrategyId;
  readonly formula: RecommendationFormulaId;
  readonly formulaVersion: string;
  readonly runId: string | null;
  readonly researchRunId?: string | null;
  readonly walkForwardRunId?: string | null;
  readonly monteCarloRunId?: string | null;
  readonly sensitivityRunId?: string | null;
  readonly robustnessRunId?: string | null;
  readonly batchRunId?: string | null;
  readonly provider?: string | null;
  readonly dataHash?: string | null;

  readonly tradeCount: number;
  readonly coverage: number; // 0..1
  readonly regimeSampleSize: number;

  readonly oosExpectancy: number; // validation expectancy
  readonly oosConsistency: number; // 0..1
  readonly profitFactorConsistency: number; // 0..1
  readonly expectancyConsistency: number; // 0..1
  readonly crossAssetConsistency: number; // 0..1
  readonly walkForwardWindows: number;

  readonly monteCarloAvailable: boolean;
  readonly monteCarloP5FinalEquity: number | null;
  readonly monteCarloMedianFinalEquity: number | null;
  readonly startingCapital: number;
  readonly maxDrawdownPct: number; // 0..1

  readonly sensitivityAvailable: boolean;
  readonly sensitivityClassification: SensitivityClassification | null;

  readonly robustnessStatus: RobustnessStatus | null;
  readonly robustnessScore: number | null; // 0..1

  readonly dataQuality: RecommendationDataQuality;
  readonly causalityOk: boolean;
};

export type ScoreComponent = {
  readonly key: keyof ScoringWeights;
  readonly raw: number;
  readonly normalized: number; // 0..1
  readonly weight: number;
  readonly contribution: number; // normalized * weight
  readonly reason: string;
};

export type HardGateResult = {
  readonly key: string;
  readonly passed: boolean;
  readonly reason: string;
};

export type StrategyRanking = {
  readonly strategy: RecommendationStrategyId;
  readonly formula: RecommendationFormulaId;
  readonly runId: string | null;
  readonly score: number; // 0..1
  readonly components: readonly ScoreComponent[];
  readonly gates: readonly HardGateResult[];
  readonly blocked: boolean;
  readonly blockingReasons: readonly string[];
  readonly reasons: readonly string[]; // supporting reasons for score
};

export type RegimeRecommendation = {
  readonly version: typeof REGIME_RECOMMENDATION_VERSION;
  readonly regime: MarketRegime;
  readonly instrument: string;
  readonly timeframe: string;
  readonly recommendedStrategy: RecommendationStrategyId | null;
  readonly recommendedFormula: RecommendationFormulaId | null;
  readonly recommendationStatus: RecommendationStatus;
  readonly confidence: number; // 0..1
  readonly score: number; // 0..1
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly rankings: readonly StrategyRanking[];
  readonly rejectedStrategies: readonly StrategyRanking[];
  readonly metricContributions: readonly ScoreComponent[];
  readonly sampleAdequacy: {
    readonly tradeCount: number;
    readonly regimeSampleSize: number;
    readonly walkForwardWindows: number;
    readonly adequate: boolean;
  };
  readonly evidence: {
    readonly strategies: readonly StrategyEvidence[];
    readonly weights: ScoringWeights;
    readonly thresholds: SafetyThresholds;
  };
  readonly runId: string;
};

// ---------------------------------------------------------------------------
// Utilities

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function sensitivityToNorm(c: SensitivityClassification | null): number {
  switch (c) {
    case "STABLE_PLATEAU":
      return 1;
    case "MONOTONIC":
      return 0.7;
    case "NARROW_OPTIMUM":
      return 0.25;
    case "ERRATIC":
      return 0.05;
    case "INSUFFICIENT_DATA":
    case null:
    default:
      return 0.3; // neutral-low when missing
  }
}

function dataQualityToNorm(q: RecommendationDataQuality): number {
  return q === "GOOD" ? 1 : q === "PARTIAL" ? 0.5 : 0;
}

// ---------------------------------------------------------------------------
// Scoring

function scoreStrategy(
  ev: StrategyEvidence,
  weights: ScoringWeights,
): { score: number; components: ScoreComponent[]; reasons: string[] } {
  const mcRatio =
    ev.monteCarloAvailable && ev.monteCarloP5FinalEquity != null && ev.startingCapital > 0
      ? ev.monteCarloP5FinalEquity / ev.startingCapital
      : 0.5; // neutral when unavailable
  const ddResilience = clamp01(1 - ev.maxDrawdownPct);
  const sensNorm = sensitivityToNorm(ev.sensitivityClassification);
  const sampleNorm = clamp01(ev.tradeCount / 200);
  const dqNorm = dataQualityToNorm(ev.dataQuality);

  const components: ScoreComponent[] = [
    {
      key: "oosConsistency",
      raw: ev.oosConsistency,
      normalized: clamp01(ev.oosConsistency),
      weight: weights.oosConsistency,
      contribution: clamp01(ev.oosConsistency) * weights.oosConsistency,
      reason: `oosConsistency=${ev.oosConsistency.toFixed(3)}`,
    },
    {
      key: "robustness",
      raw: ev.robustnessScore ?? 0,
      normalized: clamp01(ev.robustnessScore ?? 0),
      weight: weights.robustness,
      contribution: clamp01(ev.robustnessScore ?? 0) * weights.robustness,
      reason: `robustness=${(ev.robustnessScore ?? 0).toFixed(3)} status=${ev.robustnessStatus ?? "N/A"}`,
    },
    {
      key: "monteCarloP5",
      raw: mcRatio,
      normalized: clamp01(mcRatio),
      weight: weights.monteCarloP5,
      contribution: clamp01(mcRatio) * weights.monteCarloP5,
      reason: `MC p5/start=${mcRatio.toFixed(3)}`,
    },
    {
      key: "profitFactorConsistency",
      raw: ev.profitFactorConsistency,
      normalized: clamp01(ev.profitFactorConsistency),
      weight: weights.profitFactorConsistency,
      contribution: clamp01(ev.profitFactorConsistency) * weights.profitFactorConsistency,
      reason: `pfConsistency=${ev.profitFactorConsistency.toFixed(3)}`,
    },
    {
      key: "expectancyConsistency",
      raw: ev.expectancyConsistency,
      normalized: clamp01(ev.expectancyConsistency),
      weight: weights.expectancyConsistency,
      contribution: clamp01(ev.expectancyConsistency) * weights.expectancyConsistency,
      reason: `expConsistency=${ev.expectancyConsistency.toFixed(3)}`,
    },
    {
      key: "drawdownResilience",
      raw: ev.maxDrawdownPct,
      normalized: ddResilience,
      weight: weights.drawdownResilience,
      contribution: ddResilience * weights.drawdownResilience,
      reason: `maxDD=${(ev.maxDrawdownPct * 100).toFixed(1)}%`,
    },
    {
      key: "sensitivityPlateauQuality",
      raw: sensNorm,
      normalized: sensNorm,
      weight: weights.sensitivityPlateauQuality,
      contribution: sensNorm * weights.sensitivityPlateauQuality,
      reason: `sensitivity=${ev.sensitivityClassification ?? "N/A"}`,
    },
    {
      key: "crossAssetConsistency",
      raw: ev.crossAssetConsistency,
      normalized: clamp01(ev.crossAssetConsistency),
      weight: weights.crossAssetConsistency,
      contribution: clamp01(ev.crossAssetConsistency) * weights.crossAssetConsistency,
      reason: `crossAsset=${ev.crossAssetConsistency.toFixed(3)}`,
    },
    {
      key: "sampleAdequacy",
      raw: ev.tradeCount,
      normalized: sampleNorm,
      weight: weights.sampleAdequacy,
      contribution: sampleNorm * weights.sampleAdequacy,
      reason: `trades=${ev.tradeCount}`,
    },
    {
      key: "dataQuality",
      raw: dqNorm,
      normalized: dqNorm,
      weight: weights.dataQuality,
      contribution: dqNorm * weights.dataQuality,
      reason: `dataQuality=${ev.dataQuality}`,
    },
  ];
  const score = components.reduce((s, c) => s + c.contribution, 0);
  const reasons = components
    .slice()
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((c) => `${c.key}: ${c.reason} (contrib=${c.contribution.toFixed(3)})`);
  return { score: clamp01(score), components, reasons };
}

// ---------------------------------------------------------------------------
// Hard gates

function evaluateGates(
  ev: StrategyEvidence,
  thresholds: SafetyThresholds,
  expectedFormulaVersion?: string,
): HardGateResult[] {
  const gates: HardGateResult[] = [];
  gates.push({
    key: "dataQualityAvailable",
    passed: ev.dataQuality !== "UNAVAILABLE",
    reason:
      ev.dataQuality === "UNAVAILABLE"
        ? "Data quality UNAVAILABLE"
        : `Data quality ${ev.dataQuality}`,
  });
  gates.push({
    key: "coverage",
    passed: ev.coverage >= thresholds.minCoveragePct,
    reason: `coverage=${(ev.coverage * 100).toFixed(1)}% (min ${(thresholds.minCoveragePct * 100).toFixed(0)}%)`,
  });
  gates.push({
    key: "tradeCount",
    passed: ev.tradeCount >= thresholds.minTradeCount,
    reason: `trades=${ev.tradeCount} (min ${thresholds.minTradeCount})`,
  });
  gates.push({
    key: "oosExpectancy",
    passed: ev.oosExpectancy > 0,
    reason: `OOS expectancy=${ev.oosExpectancy.toFixed(3)}`,
  });
  const mcOk =
    !ev.monteCarloAvailable ||
    ev.monteCarloP5FinalEquity == null ||
    ev.startingCapital <= 0 ||
    ev.monteCarloP5FinalEquity / ev.startingCapital >= thresholds.ruinP5RatioMin;
  gates.push({
    key: "monteCarloRuin",
    passed: mcOk,
    reason: ev.monteCarloAvailable
      ? `MC p5 ratio=${((ev.monteCarloP5FinalEquity ?? 0) / (ev.startingCapital || 1)).toFixed(3)} (min ${thresholds.ruinP5RatioMin})`
      : "MC unavailable — gate skipped",
  });
  gates.push({
    key: "robustnessStatus",
    passed: ev.robustnessStatus !== "OVERFIT",
    reason: `robustnessStatus=${ev.robustnessStatus ?? "N/A"}`,
  });
  gates.push({
    key: "sensitivitySurface",
    passed:
      ev.sensitivityClassification !== "NARROW_OPTIMUM" &&
      ev.sensitivityClassification !== "ERRATIC",
    reason: `sensitivity=${ev.sensitivityClassification ?? "N/A"}`,
  });
  gates.push({
    key: "drawdown",
    passed: ev.maxDrawdownPct <= thresholds.maxDrawdownPct,
    reason: `maxDD=${(ev.maxDrawdownPct * 100).toFixed(1)}% (max ${(thresholds.maxDrawdownPct * 100).toFixed(0)}%)`,
  });
  gates.push({
    key: "formulaVersion",
    passed: !expectedFormulaVersion || ev.formulaVersion === expectedFormulaVersion,
    reason: `formulaVersion=${ev.formulaVersion}${expectedFormulaVersion ? ` expected=${expectedFormulaVersion}` : ""}`,
  });
  gates.push({
    key: "dataHash",
    passed: !!ev.dataHash && ev.dataHash.length > 0,
    reason: `dataHash=${ev.dataHash ? "present" : "MISSING"}`,
  });
  gates.push({
    key: "causality",
    passed: ev.causalityOk,
    reason: ev.causalityOk ? "causality guard passed" : "causality guard failed",
  });
  return gates;
}

// ---------------------------------------------------------------------------
// Confidence

function computeConfidence(
  best: StrategyRanking | null,
  second: StrategyRanking | null,
  ev: StrategyEvidence | null,
): number {
  if (!best || !ev) return 0;
  const marginRaw = second ? Math.max(0, best.score - second.score) : best.score;
  const margin = clamp01(marginRaw * 3); // 0.33+ margin → full
  let conf = 0.4 * margin + 0.6 * clamp01(best.score);

  // Caps
  if (ev.tradeCount < 100) conf = Math.min(conf, 0.6);
  if (ev.walkForwardWindows < 3) conf = Math.min(conf, 0.55);
  if (!ev.monteCarloAvailable) conf = Math.min(conf, 0.55);
  if (!ev.sensitivityAvailable) conf = Math.min(conf, 0.6);
  if (ev.regimeSampleSize < 30) conf = Math.min(conf, 0.55);
  if (ev.dataQuality === "PARTIAL") conf = Math.min(conf, 0.5);
  return clamp01(conf);
}

function classifyStatus(
  best: StrategyRanking | null,
  confidence: number,
  anyStrategyBlocked: boolean,
  allStrategies: number,
  dataIncomplete: boolean,
): RecommendationStatus {
  if (dataIncomplete) return "DATA_INCOMPLETE";
  if (!best) {
    if (anyStrategyBlocked && allStrategies > 0) return "AVOID";
    return "NO_VALID_STRATEGY";
  }
  if (best.score < 0.35) return "WAIT_FOR_MORE_DATA";
  if (confidence < 0.35) return "WAIT_FOR_MORE_DATA";
  if (confidence >= 0.75 && best.score >= 0.7) return "STRONG_RECOMMENDATION";
  if (confidence >= 0.55 && best.score >= 0.55) return "RECOMMENDATION";
  return "CONDITIONAL";
}

// ---------------------------------------------------------------------------
// Run ID

export type RecommendationRunIdInput = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly regime: MarketRegime;
  readonly strategies: readonly StrategyEvidence[];
  readonly weights: ScoringWeights;
  readonly thresholds: SafetyThresholds;
  readonly batchRunId?: string | null;
};

export function computeRecommendationRunId(input: RecommendationRunIdInput): string {
  const stratKey = input.strategies
    .slice()
    .sort((a, b) => a.strategy.localeCompare(b.strategy))
    .map((s) =>
      [
        s.strategy,
        s.formula,
        s.formulaVersion,
        s.runId ?? "",
        s.researchRunId ?? "",
        s.walkForwardRunId ?? "",
        s.monteCarloRunId ?? "",
        s.sensitivityRunId ?? "",
        s.robustnessRunId ?? "",
        s.batchRunId ?? "",
        s.dataHash ?? "",
      ].join(":"),
    )
    .join(";");
  const weightsKey = (Object.keys(input.weights) as Array<keyof ScoringWeights>)
    .sort()
    .map((k) => `${k}=${input.weights[k]}`)
    .join(",");
  const thresholdsKey = (Object.keys(input.thresholds) as Array<keyof SafetyThresholds>)
    .sort()
    .map((k) => `${k}=${input.thresholds[k]}`)
    .join(",");
  const key = [
    input.instrument,
    input.timeframe,
    input.regime,
    input.batchRunId ?? "",
    stratKey,
    weightsKey,
    thresholdsKey,
  ].join("|");
  return `${REGIME_RECOMMENDATION_VERSION}:${fnv1a(key)}`;
}

// ---------------------------------------------------------------------------
// Main entry

export type BuildRegimeRecommendationInput = {
  readonly regime: MarketRegime;
  readonly instrument: string;
  readonly timeframe: string;
  readonly strategies: readonly StrategyEvidence[];
  readonly weights?: Partial<ScoringWeights>;
  readonly thresholds?: Partial<SafetyThresholds>;
  readonly expectedFormulaVersions?: Readonly<Partial<Record<RecommendationStrategyId, string>>>;
  readonly batchRunId?: string | null;
  readonly dataQualityOverride?: RecommendationDataQuality;
};

export function buildRegimeRecommendation(
  input: BuildRegimeRecommendationInput,
): RegimeRecommendation {
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...input.weights };
  const thresholds: SafetyThresholds = { ...DEFAULT_SAFETY_THRESHOLDS, ...input.thresholds };

  const dataIncomplete =
    input.dataQualityOverride === "UNAVAILABLE" ||
    input.strategies.length === 0;

  const rankings: StrategyRanking[] = input.strategies.map((ev) => {
    const expected = input.expectedFormulaVersions?.[ev.strategy];
    const gates = evaluateGates(ev, thresholds, expected);
    const blocked = gates.some((g) => !g.passed);
    const blockingReasons = gates.filter((g) => !g.passed).map((g) => g.reason);
    const { score, components, reasons } = scoreStrategy(ev, weights);
    return {
      strategy: ev.strategy,
      formula: ev.formula,
      runId: ev.runId,
      score,
      components,
      gates,
      blocked,
      blockingReasons,
      reasons,
    };
  });

  const eligible = rankings.filter((r) => !r.blocked);
  eligible.sort((a, b) => b.score - a.score);
  const rejected = rankings.filter((r) => r.blocked);

  const best = eligible[0] ?? null;
  const second = eligible[1] ?? null;
  const bestEv =
    best != null ? input.strategies.find((s) => s.strategy === best.strategy) ?? null : null;
  const confidence = computeConfidence(best, second, bestEv);
  const status = classifyStatus(
    best,
    confidence,
    rejected.length > 0,
    input.strategies.length,
    dataIncomplete,
  );

  const warnings: string[] = [];
  if (bestEv && bestEv.tradeCount < 100) warnings.push("Low trade sample (<100)");
  if (bestEv && bestEv.walkForwardWindows < 3) warnings.push("Few walk-forward windows (<3)");
  if (bestEv && !bestEv.monteCarloAvailable) warnings.push("Monte Carlo unavailable");
  if (bestEv && !bestEv.sensitivityAvailable) warnings.push("Sensitivity unavailable");
  if (bestEv && bestEv.regimeSampleSize < thresholds.minRegimeSamples) {
    warnings.push(`Regime sample below threshold (${bestEv.regimeSampleSize})`);
  }
  if (bestEv && bestEv.dataQuality === "PARTIAL") warnings.push("Data quality PARTIAL");

  const runId = computeRecommendationRunId({
    instrument: input.instrument,
    timeframe: input.timeframe,
    regime: input.regime,
    strategies: input.strategies,
    weights,
    thresholds,
    batchRunId: input.batchRunId ?? null,
  });

  return {
    version: REGIME_RECOMMENDATION_VERSION,
    regime: input.regime,
    instrument: input.instrument,
    timeframe: input.timeframe,
    recommendedStrategy: best ? best.strategy : null,
    recommendedFormula: best ? best.formula : null,
    recommendationStatus: status,
    confidence,
    score: best ? best.score : 0,
    reasons: best ? best.reasons : [],
    warnings,
    rankings: eligible,
    rejectedStrategies: rejected,
    metricContributions: best ? best.components : [],
    sampleAdequacy: {
      tradeCount: bestEv?.tradeCount ?? 0,
      regimeSampleSize: bestEv?.regimeSampleSize ?? 0,
      walkForwardWindows: bestEv?.walkForwardWindows ?? 0,
      adequate:
        !!bestEv &&
        bestEv.tradeCount >= thresholds.minTradeCount &&
        bestEv.regimeSampleSize >= thresholds.minRegimeSamples &&
        bestEv.walkForwardWindows >= 3,
    },
    evidence: {
      strategies: input.strategies,
      weights,
      thresholds,
    },
    runId,
  };
}

// ---------------------------------------------------------------------------
// Matrix helpers

export type MatrixKey = { readonly instrument: string; readonly timeframe: string };

export function buildInstrumentTimeframeMatrix(
  inputs: readonly BuildRegimeRecommendationInput[],
): readonly RegimeRecommendation[] {
  const seen = new Set<string>();
  const out: RegimeRecommendation[] = [];
  for (const inp of inputs) {
    const key = `${inp.instrument}|${inp.timeframe}|${inp.regime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(buildRegimeRecommendation(inp));
  }
  return out;
}

export type RegimeRankingRow = {
  readonly regime: MarketRegime;
  readonly best: StrategyRanking | null;
  readonly second: StrategyRanking | null;
  readonly avoid: StrategyRanking | null;
  readonly confidence: number;
  readonly status: RecommendationStatus;
  readonly sampleSize: number;
};

export function buildRegimeRankingRow(rec: RegimeRecommendation): RegimeRankingRow {
  const eligible = rec.rankings;
  const best = eligible[0] ?? null;
  const second = eligible[1] ?? null;
  const avoid =
    rec.rejectedStrategies.length > 0
      ? rec.rejectedStrategies.slice().sort((a, b) => a.score - b.score)[0]
      : null;
  const bestEv = rec.evidence.strategies.find((s) => best && s.strategy === best.strategy);
  return {
    regime: rec.regime,
    best,
    second,
    avoid,
    confidence: rec.confidence,
    status: rec.recommendationStatus,
    sampleSize: bestEv?.regimeSampleSize ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Environment summary

export type EnvironmentSummary = {
  readonly detectedRegime: MarketRegime;
  readonly volatilityState: "LOW" | "NORMAL" | "HIGH" | "UNKNOWN";
  readonly trendState: "UP" | "DOWN" | "SIDEWAYS" | "UNKNOWN";
  readonly dataQuality: RecommendationDataQuality;
  readonly recommendedStrategy: RecommendationStrategyId | null;
  readonly confidence: number;
  readonly recommendationStatus: RecommendationStatus;
  readonly topReasons: readonly string[];
  readonly blockingRisks: readonly string[];
};

export function summarizeEnvironment(
  rec: RegimeRecommendation,
  extras: {
    readonly volatilityState?: EnvironmentSummary["volatilityState"];
    readonly trendState?: EnvironmentSummary["trendState"];
    readonly dataQuality?: RecommendationDataQuality;
  } = {},
): EnvironmentSummary {
  const volatility: EnvironmentSummary["volatilityState"] =
    extras.volatilityState ??
    (rec.regime === "HIGH_VOLATILITY"
      ? "HIGH"
      : rec.regime === "LOW_VOLATILITY"
        ? "LOW"
        : rec.regime === "UNKNOWN"
          ? "UNKNOWN"
          : "NORMAL");
  const trend: EnvironmentSummary["trendState"] =
    extras.trendState ??
    (rec.regime === "TRENDING_UP"
      ? "UP"
      : rec.regime === "TRENDING_DOWN"
        ? "DOWN"
        : rec.regime === "RANGE" || rec.regime === "MEAN_REVERSION"
          ? "SIDEWAYS"
          : "UNKNOWN");
  const blocking = rec.rejectedStrategies.flatMap((r) =>
    r.blockingReasons.map((br) => `${r.strategy}: ${br}`),
  );
  const dq =
    extras.dataQuality ??
    (rec.evidence.strategies[0]?.dataQuality ?? "UNAVAILABLE");
  return {
    detectedRegime: rec.regime,
    volatilityState: volatility,
    trendState: trend,
    dataQuality: dq,
    recommendedStrategy: rec.recommendedStrategy,
    confidence: rec.confidence,
    recommendationStatus: rec.recommendationStatus,
    topReasons: rec.reasons,
    blockingRisks: blocking,
  };
}
