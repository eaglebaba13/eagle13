// Phase 22 · Stage 3 — Portfolio recommendation engine. Ranks a set of
// pre-computed PortfolioResearchResult scenarios along OOS consistency,
// drawdown resilience, diversification, correlation, risk-budget
// compliance, reliability, optimizer confidence, data quality and sample
// adequacy. Deterministic. Research-only. Cannot override hard gates.

import type { PortfolioMcResult } from "./portfolio-monte-carlo";
import type { PortfolioAsset, PortfolioResearchResult } from "./portfolio-types";
import { computeRiskBudget } from "./risk-budget";

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const PORTFOLIO_RECOMMENDATION_RUN_ID_PREFIX = "PORTFOLIO_RECOMMENDATION_V1";

export type PortfolioScenario = {
  readonly id: string;
  readonly label: string;
  readonly result: PortfolioResearchResult;
  readonly assets: readonly PortfolioAsset[];
  readonly monteCarlo?: PortfolioMcResult | null;
};

export type RecommendationInput = {
  readonly scenarios: readonly PortfolioScenario[];
  readonly maxDrawdownPct?: number; // hard gate threshold
  readonly maxRuinProbability?: number;
  readonly maxCorrelation?: number;
  readonly maxRiskBreach?: number;
  readonly minAlignedObservations?: number;
};

export type ScenarioScore = {
  readonly scenarioId: string;
  readonly runId: string;
  readonly score: number;
  readonly confidence: number;
  readonly components: Readonly<Record<string, number>>;
  readonly hardGateFailures: readonly string[];
  readonly reasons: readonly string[];
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly recommendable: boolean;
};

export type PortfolioRecommendationResult = {
  readonly runId: string;
  readonly generatedAt: string;
  readonly scored: readonly ScenarioScore[];
  readonly recommended: ScenarioScore | null;
  readonly conservative: ScenarioScore | null;
  readonly balanced: ScenarioScore | null;
  readonly aggressive: ScenarioScore | null;
  readonly rejected: readonly ScenarioScore[];
  readonly disclaimer: string;
};

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function hardGates(s: PortfolioScenario, input: RecommendationInput): string[] {
  const gates: string[] = [];
  const { result, assets } = s;
  for (const a of assets) {
    if (!a.runId) gates.push(`MISSING_RUN_ID:${a.id}`);
    if (a.dataHash === "") gates.push(`MISSING_DATA_HASH:${a.id}`);
    if (a.overfitStatus === "OVERFIT" || a.overfitStatus === "FAIL") gates.push(`OVERFIT:${a.id}`);
    if (a.reliability === "POOR" || a.reliability === "UNRELIABLE") gates.push(`UNRELIABLE:${a.id}`);
    if (a.oosExpectancy != null && a.oosExpectancy < 0) gates.push(`NEGATIVE_EDGE:${a.id}`);
    if (a.dataQuality === "LOW") gates.push(`DATA_QUALITY_LOW:${a.id}`);
  }
  // Formula-version alignment: reject if only one asset is present as a portfolio.
  const versions = new Set(assets.map((a) => `${a.formulaVersion}`));
  // Not blocking, but sample adequacy is:
  if (input.minAlignedObservations != null && result.correlations.alignedObservations < input.minAlignedObservations) {
    gates.push("INSUFFICIENT_ALIGNED_OBSERVATIONS");
  }
  if (input.maxCorrelation != null) {
    const ids = result.correlations.assetIds;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        if ((result.correlations.returns[i]?.[j] ?? 0) > input.maxCorrelation) {
          gates.push(`EXCESS_CORRELATION:${ids[i]}↔${ids[j]}`);
        }
  }
  if (input.maxDrawdownPct != null && result.metrics.maxDrawdownPct > input.maxDrawdownPct) {
    gates.push("MAX_DRAWDOWN_EXCEEDED");
  }
  if (input.maxRuinProbability != null && s.monteCarlo && s.monteCarlo.probabilityOfRuin > input.maxRuinProbability) {
    gates.push("RUIN_PROBABILITY_EXCEEDED");
  }
  if (result.blockingReasons.length > 0) gates.push(...result.blockingReasons.map((r) => `PORTFOLIO_BLOCK:${r}`));
  if (versions.size === 0) gates.push("NO_FORMULA_VERSION");
  return gates;
}

function score(s: PortfolioScenario, input: RecommendationInput): ScenarioScore {
  const { result, assets } = s;
  const oosSamples = assets.map((a) => a.oosExpectancy ?? 0);
  const oosMean = oosSamples.length > 0 ? oosSamples.reduce((a, b) => a + b, 0) / oosSamples.length : 0;
  const oosConsistency = clamp01(0.5 + Math.tanh(oosMean) / 2);

  const mc = s.monteCarlo;
  const mcDownside = mc ? clamp01(1 - mc.probabilityOfRuin) : 0.5;

  const dd = clamp01(1 - result.metrics.maxDrawdownPct);
  const diversification = clamp01(result.metrics.diversificationRatio / 2);
  const meanAbsCorr = (() => {
    const ids = result.correlations.assetIds;
    if (ids.length < 2) return 0;
    let s = 0, n = 0;
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) { s += Math.abs(result.correlations.returns[i][j]); n++; }
    return n > 0 ? s / n : 0;
  })();
  const correlationScore = clamp01(1 - meanAbsCorr);

  const budget = computeRiskBudget({
    assets,
    contributions: result.riskContributions,
    scope: "ASSET",
  });
  const riskBudget = clamp01(budget.compliance);

  const reliabilityMap = { HIGH: 1, MEDIUM: 0.7, LOW: 0.4, POOR: 0, UNRELIABLE: 0 } as const;
  const reliability = assets.length > 0
    ? assets.reduce((s, a) => s + (a.reliability ? reliabilityMap[a.reliability] : 0.5), 0) / assets.length
    : 0.5;

  const optimizerConfidence = assets.length > 0
    ? assets.reduce((s, a) => s + (a.recommendationConfidence ?? 0.5), 0) / assets.length
    : 0.5;

  const qMap = { HIGH: 1, MEDIUM: 0.7, LOW: 0.3 } as const;
  const dataQuality = assets.length > 0
    ? assets.reduce((s, a) => s + (a.dataQuality ? qMap[a.dataQuality] : 0.5), 0) / assets.length
    : 0.5;

  const sampleAdequacy = clamp01(result.correlations.alignedObservations / 60);

  const components = {
    oosConsistency,
    mcDownside,
    ddResilience: dd,
    diversification,
    correlation: correlationScore,
    riskBudget,
    reliability,
    optimizerConfidence,
    dataQuality,
    sampleAdequacy,
  } as const;
  const weights: Readonly<Record<keyof typeof components, number>> = {
    oosConsistency: 0.15,
    mcDownside: 0.15,
    ddResilience: 0.1,
    diversification: 0.1,
    correlation: 0.1,
    riskBudget: 0.1,
    reliability: 0.1,
    optimizerConfidence: 0.05,
    dataQuality: 0.1,
    sampleAdequacy: 0.05,
  };
  let totalScore = 0;
  (Object.keys(components) as (keyof typeof components)[]).forEach((k) => {
    totalScore += components[k] * weights[k];
  });

  const gates = hardGates(s, input);
  const recommendable = gates.length === 0;
  const reasons: string[] = [];
  if (recommendable) {
    reasons.push(`${(totalScore * 100).toFixed(1)}% composite score`);
    if (dd > 0.7) reasons.push("drawdown resilience strong");
    if (correlationScore > 0.6) reasons.push("cross-strategy correlation low");
    if (diversification > 0.5) reasons.push("effective diversification");
  } else {
    reasons.push(...gates.slice(0, 3));
  }

  return {
    scenarioId: s.id,
    runId: result.runId,
    score: totalScore,
    confidence: recommendable ? clamp01(totalScore) : 0,
    components,
    hardGateFailures: gates,
    reasons,
    evidence: {
      alignedObservations: result.correlations.alignedObservations,
      simultaneousLossRate: result.correlations.simultaneousLossRate,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
      sharpe: result.metrics.sharpe,
      calmar: result.metrics.calmar,
      candidateRunIds: result.candidateRunIds,
    },
    recommendable,
  };
}

export function computePortfolioRecommendationRunId(
  input: RecommendationInput,
  scored: readonly ScenarioScore[],
): string {
  const parts: string[] = [];
  for (const s of scored) {
    parts.push(`${s.scenarioId}:${s.runId}:${s.score.toFixed(6)}:${s.recommendable ? 1 : 0}`);
  }
  const cfg = JSON.stringify({
    dd: input.maxDrawdownPct ?? null,
    ruin: input.maxRuinProbability ?? null,
    corr: input.maxCorrelation ?? null,
    breach: input.maxRiskBreach ?? null,
    obs: input.minAlignedObservations ?? null,
  });
  return `${PORTFOLIO_RECOMMENDATION_RUN_ID_PREFIX}:${fnv1a([...parts, cfg].join("||"))}`;
}

export function computePortfolioRecommendation(
  input: RecommendationInput,
  now: () => string = () => new Date().toISOString(),
): PortfolioRecommendationResult {
  const scored = input.scenarios.map((s) => score(s, input));
  const eligible = scored.filter((s) => s.recommendable);
  const rejected = scored.filter((s) => !s.recommendable);

  const sortedByScore = [...eligible].sort((a, b) => b.score - a.score);
  const recommended = sortedByScore[0] ?? null;

  // Conservative = lowest drawdown/tail; Aggressive = highest Sharpe; Balanced = median composite.
  const conservative = [...eligible].sort((a, b) =>
    (b.components.ddResilience + b.components.mcDownside) -
    (a.components.ddResilience + a.components.mcDownside),
  )[0] ?? null;
  const aggressive = [...eligible].sort((a, b) => {
    const sa = (a.evidence.sharpe as number | undefined) ?? 0;
    const sb = (b.evidence.sharpe as number | undefined) ?? 0;
    return sb - sa;
  })[0] ?? null;
  const balanced = sortedByScore[Math.floor(sortedByScore.length / 2)] ?? null;

  return {
    runId: computePortfolioRecommendationRunId(input, scored),
    generatedAt: now(),
    scored,
    recommended,
    conservative,
    balanced,
    aggressive,
    rejected,
    disclaimer:
      "PORTFOLIO RESEARCH ONLY — NOT A LIVE ALLOCATION INSTRUCTION. Recommendations are derived from historical/OOS research and cannot override hard risk gates.",
  };
}