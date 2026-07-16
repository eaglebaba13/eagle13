// Phase 24 — Institutional GO / NO-GO Decision Center.
// Pure evidence aggregation. NO recomputation. NO broker imports.
// Consumes only pre-computed research outputs supplied by the caller.

export const DECISION_CENTER_VERSION = "DECISION_CENTER_V1";

export type DecisionState =
  | "NOT_READY"
  | "READY_FOR_MANUAL_SHADOW"
  | "READY_FOR_SCHEDULED_SHADOW"
  | "READY_FOR_PAPER_TRADING"
  | "READY_FOR_LIMITED_BETA"
  | "READY_FOR_PRODUCTION_REVIEW"
  | "GO_REVIEW_REQUIRED"
  | "NO_GO";

export type ChecklistStatus = "PASS" | "WARNING" | "FAIL" | "MISSING";

export type ChecklistItem = {
  readonly key: string;
  readonly label: string;
  readonly status: ChecklistStatus;
  readonly detail: string;
};

/** All optional. Missing fields = missing evidence (gate can trip). */
export type DecisionEvidenceInput = {
  // Walk-forward
  readonly walkForward?: {
    readonly runId: string;
    readonly oosExpectancy: number;    // R units
    readonly stabilityScore: number;   // 0..1
    readonly overfitFlag: boolean;
    readonly totalTrades: number;
  };
  // Monte Carlo
  readonly monteCarlo?: {
    readonly runId: string;
    readonly worstDrawdownPct: number; // 0..1 (positive number)
    readonly medianCagr: number;
    readonly ruinProbability: number;  // 0..1
  };
  // Robustness composite
  readonly robustness?: {
    readonly runId: string;
    readonly score: number;            // 0..1
    readonly verdict: "ROBUST" | "MARGINAL" | "OVERFIT" | "UNRELIABLE";
  };
  // Sensitivity
  readonly sensitivity?: {
    readonly runId: string;
    readonly cliffScore: number;       // 0..1  (1 = no cliffs)
    readonly plateauCoverage: number;  // 0..1
  };
  // Optimizer
  readonly optimizer?: {
    readonly runId: string;
    readonly confidence: number;       // 0..1
    readonly selectedCandidate: string;
  };
  // Recommendation validator
  readonly recommendationValidator?: {
    readonly runId: string;
    readonly reliability: number;      // 0..1
    readonly verdict: "RELIABLE" | "MARGINAL" | "UNRELIABLE";
  };
  // Cross-asset consistency
  readonly crossAsset?: {
    readonly runId: string;
    readonly consistency: number;      // 0..1
    readonly assetsCovered: number;
  };
  // Portfolio recommendation
  readonly portfolio?: {
    readonly runId: string;
    readonly recommendation: "ACCEPT" | "REVIEW" | "REJECT";
    readonly expectedDrawdown: number; // 0..1
    readonly diversificationScore: number; // 0..1
  };
  // Shadow validation
  readonly shadow?: {
    readonly runId: string;
    readonly readiness:
      | "READY_FOR_SCHEDULED_SHADOW"
      | "READY_FOR_MANUAL_OBSERVATION"
      | "PAUSED_BY_DATA_QUALITY"
      | "PAUSED_BY_PROVIDER"
      | "PAUSED_BY_RESEARCH_GAP"
      | "NOT_READY";
    readonly accuracy: number;         // 0..1
    readonly calibration: number;      // 0..1  (Brier-style, 1 = perfect)
    readonly resolvedTrades: number;
  };
  // Recommendation engine expectations
  readonly recommendation?: {
    readonly runId: string;
    readonly expectedWinRate: number;  // 0..1
    readonly expectedProfitFactor: number;
    readonly confidence: number;       // 0..1
  };
  // Research stability
  readonly researchStability?: {
    readonly runId: string;
    readonly stability: number;        // 0..1
  };
  // Regime intelligence
  readonly regime?: {
    readonly runId: string;
    readonly coverage: number;         // 0..1
  };
  // Data quality
  readonly dataQuality?: {
    readonly ok: boolean;
    readonly causalityOk: boolean;
    readonly dataHash: string;
  };
  // Operator context
  readonly minTrades?: number;         // default 50
  readonly minConfidence?: number;     // default 0.55
};

export type ScoredComponent = {
  readonly key: string;
  readonly weight: number;
  readonly score: number;   // 0..1 or NaN if missing
  readonly present: boolean;
};

export const DECISION_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  walkForward: 0.15,
  oosExpectancy: 0.10,
  monteCarlo: 0.10,
  robustness: 0.10,
  portfolioRecommendation: 0.10,
  shadowAccuracy: 0.10,
  calibration: 0.10,
  recommendationReliability: 0.10,
  crossAsset: 0.075,
  optimizerConfidence: 0.075,
});

function assertWeightsSumToOne(): void {
  const s = Object.values(DECISION_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(s - 1) > 1e-9) {
    throw new Error(`DECISION_WEIGHTS must sum to 1.0 (got ${s})`);
  }
}
assertWeightsSumToOne();

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normExpectancy(r: number): number {
  // map expectancy in R to 0..1; 0R => 0.5, 1R => 1.0, -1R => 0.
  return clamp01(0.5 + r / 2);
}

function normDrawdown(dd: number): number {
  // lower is better; 0 => 1, 50% => 0
  return clamp01(1 - dd / 0.5);
}

export type DecisionResult = {
  readonly version: string;
  readonly state: DecisionState;
  readonly score: number;               // 0..1
  readonly confidence: number;          // 0..1
  readonly components: readonly ScoredComponent[];
  readonly hardGates: readonly string[];
  readonly whyGo: readonly string[];
  readonly whyNoGo: readonly string[];
  readonly missingEvidence: readonly string[];
  readonly weakestModule: string | null;
  readonly strongestModule: string | null;
  readonly checklist: readonly ChecklistItem[];
  readonly risk: {
    readonly expectedDrawdown: number | null;
    readonly expectedWinRate: number | null;
    readonly expectedProfitFactor: number | null;
    readonly worstMonteCarloDrawdown: number | null;
    readonly expectedPortfolioDrawdown: number | null;
    readonly shadowAccuracy: number | null;
    readonly recommendationReliability: number | null;
    readonly calibration: number | null;
  };
  readonly supportingRunIds: Readonly<Record<string, string>>;
  readonly dataHash: string | null;
};

export function evaluateDecision(inp: DecisionEvidenceInput): DecisionResult {
  const missing: string[] = [];
  const hardGates: string[] = [];
  const whyGo: string[] = [];
  const whyNoGo: string[] = [];

  const minTrades = inp.minTrades ?? 50;
  const minConfidence = inp.minConfidence ?? 0.55;

  // Presence + score per component
  const c: ScoredComponent[] = [];
  const push = (key: string, present: boolean, score: number) => {
    c.push({ key, weight: DECISION_WEIGHTS[key], score: present ? clamp01(score) : NaN, present });
    if (!present) missing.push(key);
  };

  push("walkForward", !!inp.walkForward, inp.walkForward ? inp.walkForward.stabilityScore : 0);
  push("oosExpectancy", !!inp.walkForward, inp.walkForward ? normExpectancy(inp.walkForward.oosExpectancy) : 0);
  push("monteCarlo", !!inp.monteCarlo, inp.monteCarlo ? normDrawdown(inp.monteCarlo.worstDrawdownPct) * (1 - clamp01(inp.monteCarlo.ruinProbability)) : 0);
  push("robustness", !!inp.robustness, inp.robustness ? inp.robustness.score : 0);
  push("portfolioRecommendation", !!inp.portfolio, inp.portfolio ? (inp.portfolio.recommendation === "ACCEPT" ? 1 : inp.portfolio.recommendation === "REVIEW" ? 0.5 : 0) : 0);
  push("shadowAccuracy", !!inp.shadow, inp.shadow ? inp.shadow.accuracy : 0);
  push("calibration", !!inp.shadow, inp.shadow ? inp.shadow.calibration : 0);
  push("recommendationReliability", !!inp.recommendationValidator, inp.recommendationValidator ? inp.recommendationValidator.reliability : 0);
  push("crossAsset", !!inp.crossAsset, inp.crossAsset ? inp.crossAsset.consistency : 0);
  push("optimizerConfidence", !!inp.optimizer, inp.optimizer ? inp.optimizer.confidence : 0);

  // Weighted score (present components only; missing => 0 contribution).
  let score = 0;
  for (const comp of c) {
    if (comp.present) score += comp.weight * comp.score;
  }

  // Hard gates
  if (inp.robustness?.verdict === "OVERFIT") hardGates.push("ROBUSTNESS_OVERFIT");
  if (inp.robustness?.verdict === "UNRELIABLE") hardGates.push("ROBUSTNESS_UNRELIABLE");
  if (inp.walkForward?.overfitFlag) hardGates.push("WALK_FORWARD_OVERFIT");
  if (inp.recommendationValidator?.verdict === "UNRELIABLE") hardGates.push("RECOMMENDATION_UNRELIABLE");
  if (inp.portfolio?.recommendation === "REJECT") hardGates.push("PORTFOLIO_REJECT");
  if (inp.shadow && inp.shadow.readiness === "NOT_READY") hardGates.push("SHADOW_NOT_READY");
  if (inp.dataQuality && !inp.dataQuality.ok) hardGates.push("DATA_QUALITY_FAILURE");
  if (inp.dataQuality && !inp.dataQuality.causalityOk) hardGates.push("CAUSALITY_FAILURE");
  if (inp.walkForward && inp.walkForward.totalTrades < minTrades) hardGates.push("INSUFFICIENT_TRADES");
  if (inp.recommendation && inp.recommendation.confidence < minConfidence) hardGates.push("LOW_CONFIDENCE");
  if (missing.length > 0) hardGates.push("MISSING_RESEARCH_CONTEXT");

  // State classification
  let state: DecisionState;
  if (hardGates.length > 0) {
    state = "NO_GO";
    for (const g of hardGates) whyNoGo.push(g);
  } else if (score < 0.45) {
    state = "NOT_READY";
    whyNoGo.push(`SCORE_${score.toFixed(3)}_BELOW_0.45`);
  } else if (score < 0.55) {
    state = "READY_FOR_MANUAL_SHADOW";
    whyGo.push("SCORE_MEETS_MANUAL_SHADOW_THRESHOLD");
  } else if (score < 0.65) {
    state = "READY_FOR_SCHEDULED_SHADOW";
    whyGo.push("SCORE_MEETS_SCHEDULED_SHADOW_THRESHOLD");
  } else if (score < 0.75) {
    state = "READY_FOR_PAPER_TRADING";
    whyGo.push("SCORE_MEETS_PAPER_TRADING_THRESHOLD");
  } else if (score < 0.83) {
    state = "READY_FOR_LIMITED_BETA";
    whyGo.push("SCORE_MEETS_LIMITED_BETA_THRESHOLD");
  } else if (score < 0.9) {
    state = "READY_FOR_PRODUCTION_REVIEW";
    whyGo.push("SCORE_MEETS_PRODUCTION_REVIEW_THRESHOLD");
  } else {
    state = "GO_REVIEW_REQUIRED";
    whyGo.push("SCORE_HIGH_REQUIRES_HUMAN_REVIEW");
  }

  // Weakest / strongest
  const present = c.filter((x) => x.present);
  const weakest = present.reduce<ScoredComponent | null>((w, x) => !w || x.score < w.score ? x : w, null);
  const strongest = present.reduce<ScoredComponent | null>((s, x) => !s || x.score > s.score ? x : s, null);

  // Confidence = coverage * (1 - gate penalty)
  const coverage = present.length / c.length;
  const gatePenalty = Math.min(1, hardGates.length * 0.15);
  const confidence = clamp01(coverage * (1 - gatePenalty));

  // Checklist
  const cl: ChecklistItem[] = [
    checklist("research", "Research", inp.walkForward, (w) => w.stabilityScore >= 0.6, (w) => `stability=${w.stabilityScore.toFixed(2)}`),
    checklist("optimizer", "Optimizer", inp.optimizer, (o) => o.confidence >= 0.6, (o) => `confidence=${o.confidence.toFixed(2)}`),
    checklist("portfolio", "Portfolio", inp.portfolio, (p) => p.recommendation === "ACCEPT", (p) => p.recommendation),
    checklist("shadow", "Shadow", inp.shadow, (s) => s.readiness.startsWith("READY_FOR"), (s) => s.readiness),
    checklist("recommendation", "Recommendation", inp.recommendation, (r) => r.confidence >= minConfidence, (r) => `confidence=${r.confidence.toFixed(2)}`),
    checklist("calibration", "Calibration", inp.shadow, (s) => s.calibration >= 0.6, (s) => `calibration=${s.calibration.toFixed(2)}`),
    checklist("walkForward", "Walk Forward", inp.walkForward, (w) => !w.overfitFlag && w.totalTrades >= minTrades, (w) => `trades=${w.totalTrades} overfit=${w.overfitFlag}`),
    checklist("monteCarlo", "Monte Carlo", inp.monteCarlo, (m) => m.worstDrawdownPct <= 0.35 && m.ruinProbability <= 0.05, (m) => `dd=${(m.worstDrawdownPct*100).toFixed(1)}% ruin=${(m.ruinProbability*100).toFixed(1)}%`),
    checklist("robustness", "Robustness", inp.robustness, (r) => r.verdict === "ROBUST" || r.verdict === "MARGINAL", (r) => r.verdict),
    checklist("sensitivity", "Sensitivity", inp.sensitivity, (s) => s.cliffScore >= 0.6, (s) => `cliff=${s.cliffScore.toFixed(2)}`),
    checklist("crossAsset", "Cross Asset", inp.crossAsset, (x) => x.consistency >= 0.6, (x) => `consistency=${x.consistency.toFixed(2)}`),
    checklist("dataQuality", "Data Quality", inp.dataQuality, (d) => d.ok && d.causalityOk, (d) => `ok=${d.ok} causal=${d.causalityOk}`),
  ];

  // Supporting Run IDs
  const supportingRunIds: Record<string, string> = {};
  if (inp.walkForward) supportingRunIds.walkForward = inp.walkForward.runId;
  if (inp.monteCarlo) supportingRunIds.monteCarlo = inp.monteCarlo.runId;
  if (inp.robustness) supportingRunIds.robustness = inp.robustness.runId;
  if (inp.sensitivity) supportingRunIds.sensitivity = inp.sensitivity.runId;
  if (inp.optimizer) supportingRunIds.optimizer = inp.optimizer.runId;
  if (inp.recommendationValidator) supportingRunIds.recommendationValidator = inp.recommendationValidator.runId;
  if (inp.crossAsset) supportingRunIds.crossAsset = inp.crossAsset.runId;
  if (inp.portfolio) supportingRunIds.portfolio = inp.portfolio.runId;
  if (inp.shadow) supportingRunIds.shadow = inp.shadow.runId;
  if (inp.recommendation) supportingRunIds.recommendation = inp.recommendation.runId;
  if (inp.researchStability) supportingRunIds.researchStability = inp.researchStability.runId;
  if (inp.regime) supportingRunIds.regime = inp.regime.runId;

  return {
    version: DECISION_CENTER_VERSION,
    state,
    score,
    confidence,
    components: c,
    hardGates,
    whyGo,
    whyNoGo,
    missingEvidence: missing,
    weakestModule: weakest?.key ?? null,
    strongestModule: strongest?.key ?? null,
    checklist: cl,
    risk: {
      expectedDrawdown: inp.monteCarlo?.worstDrawdownPct ?? null,
      expectedWinRate: inp.recommendation?.expectedWinRate ?? null,
      expectedProfitFactor: inp.recommendation?.expectedProfitFactor ?? null,
      worstMonteCarloDrawdown: inp.monteCarlo?.worstDrawdownPct ?? null,
      expectedPortfolioDrawdown: inp.portfolio?.expectedDrawdown ?? null,
      shadowAccuracy: inp.shadow?.accuracy ?? null,
      recommendationReliability: inp.recommendationValidator?.reliability ?? null,
      calibration: inp.shadow?.calibration ?? null,
    },
    supportingRunIds,
    dataHash: inp.dataQuality?.dataHash ?? null,
  };
}

function checklist<T>(
  key: string,
  label: string,
  value: T | undefined,
  passFn: (v: T) => boolean,
  detailFn: (v: T) => string,
): ChecklistItem {
  if (value === undefined) return { key, label, status: "MISSING", detail: "no evidence supplied" };
  const pass = passFn(value);
  return { key, label, status: pass ? "PASS" : "WARNING", detail: detailFn(value) };
}