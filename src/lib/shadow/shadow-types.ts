// Phase 23 · Stage 1 — Shadow validation types.
// Observation-only. No live orders, no broker integration, no capital
// mutation. Every consumer must treat source strategy/recommendation/
// portfolio outputs as read-only.

export const SHADOW_DISCLAIMER =
  "SHADOW RESEARCH ONLY — NO LIVE ORDER. NO BROKER ACTION. " +
  "Hypothetical outcomes only. Source strategy/recommendation/portfolio " +
  "outputs are immutable.";

export const SHADOW_SESSION_PREFIX = "SHADOW_SESSION_V1";
export const SHADOW_OBSERVATION_PREFIX = "SHADOW_OBSERVATION_V1";
export const SHADOW_PORTFOLIO_PREFIX = "SHADOW_PORTFOLIO_V1";

export type ShadowStatus =
  | "WAITING_FOR_DATA"
  | "DATA_READY"
  | "RECOMMENDATION_READY"
  | "PORTFOLIO_READY"
  | "ENTRY_READY_SHADOW"
  | "OBSERVING"
  | "TARGET_HIT_SHADOW"
  | "STOP_HIT_SHADOW"
  | "SESSION_EXIT_SHADOW"
  | "INVALIDATED"
  | "DATA_INCOMPLETE"
  | "STALE_DATA"
  | "FORMULA_MISMATCH"
  | "CAUSALITY_FAILURE";

export type ShadowDirection = "BUY" | "SELL" | "WAIT";

export type ShadowSide = "LONG" | "SHORT";

export type DataQualityState = "LIVE" | "DELAYED" | "STALE" | "MISSING";

export type ShadowClosedCandle = {
  readonly date: string; // ISO date/time of the CLOSED bar
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly closed: true; // reducer refuses non-closed bars by type
};

export type ShadowDataSnapshot = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly session: string;
  readonly providerId: string;
  readonly providerTimestamp: string;
  readonly timezone: string;
  readonly dataHash: string;
  readonly quality: DataQualityState;
  readonly ageSeconds: number;
  readonly candles: readonly ShadowClosedCandle[];
};

export type ShadowRecommendation = {
  readonly runId: string;
  readonly strategy: string;
  readonly formulaVersion: string;
  readonly direction: ShadowDirection;
  readonly confidence: number; // 0..1
  readonly reliability: "HIGH" | "MEDIUM" | "LOW" | "POOR" | "UNRELIABLE";
  readonly score: number;
  readonly regime?: string | null;
};

export type ShadowPortfolioDecision = {
  readonly runId: string;
  readonly assetId: string;
  readonly included: boolean;
  readonly allocationWeight: number;
  readonly sizingUnits: number;
  readonly riskBudgetPct: number;
  readonly correlationExposure: number;
  readonly capitalUtilizationPct: number;
  readonly confidence: number;
  readonly hardGatePassed: boolean;
  readonly blockingReasons: readonly string[];
};

export type ShadowEntryPolicy = "NEXT_CANDLE_OPEN" | "SIGNAL_CANDLE_CLOSE";
export type ShadowStopPolicy = "STRATEGY" | "ATR" | "SWING" | "LIQUIDITY" | "PORTFOLIO";
export type ShadowTargetPolicy = "FIXED_RR" | "STRATEGY" | "OPPOSING_LIQUIDITY" | "STRUCTURE";

export type ShadowPolicy = {
  readonly entry: ShadowEntryPolicy;
  readonly stop: ShadowStopPolicy;
  readonly target: ShadowTargetPolicy;
  readonly rrMultiple?: number; // for FIXED_RR
  readonly maxHoldBars?: number;
  readonly maxDataAgeSeconds: number; // above → STALE_DATA
  readonly minConfidence: number; // below → block entry
  readonly acceptDelayed: boolean;
  readonly costsPct: number;
};

export type ShadowEvidence = {
  readonly recommendationRunId: string | null;
  readonly portfolioRunId: string | null;
  readonly dataHash: string;
  readonly providerId: string;
  readonly providerTimestamp: string;
  readonly formulaVersion: string;
  readonly regime: string | null;
  readonly confidence: number;
  readonly reliability: string;
  readonly reasons: readonly string[];
};

export type ShadowHypotheticalPosition = {
  readonly side: ShadowSide;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
  readonly entryDate: string;
};

export type ShadowOutcome = {
  readonly resolved: boolean;
  readonly exit: "TARGET" | "STOP" | "SESSION_CLOSE" | "MAX_HOLD" | "INVALIDATED" | "DATA_QUALITY" | null;
  readonly exitPrice: number | null;
  readonly exitDate: string | null;
  readonly mfe: number;
  readonly mae: number;
  readonly holdingBars: number;
  readonly netPoints: number; // before costs
  readonly netAfterCosts: number;
};

export type ShadowValidationEvent = {
  readonly id: string;
  readonly kind:
    | "DATA_RECEIVED"
    | "CANDLE_CLOSED"
    | "STRATEGY_COMPUTED"
    | "RECOMMENDATION_COMPUTED"
    | "PORTFOLIO_COMPUTED"
    | "ENTRY_READY"
    | "ENTRY_OBSERVED"
    | "OUTCOME_FINALIZED"
    | "VALIDATION_UPDATED"
    | "DRIFT_UPDATED"
    | "BLOCKED";
  readonly at: string;
  readonly reason?: string;
  readonly evidence: ShadowEvidence;
};

export type ShadowObservation = {
  readonly id: string; // deterministic observation Run ID
  readonly sessionId: string;
  readonly recordedAt: string;
  readonly strategy: string;
  readonly formulaVersion: string;
  readonly instrument: string;
  readonly timeframe: string;
  readonly regime: string | null;
  readonly direction: ShadowDirection;
  readonly confidence: number;
  readonly reliability: string;
  readonly score: number;
  readonly blockingReasons: readonly string[];
  readonly status: ShadowStatus;
  readonly hypothetical: ShadowHypotheticalPosition | null;
  readonly outcome: ShadowOutcome;
  readonly evidence: ShadowEvidence;
  readonly dataQuality: DataQualityState;
};

export type ShadowSession = {
  readonly id: string;
  readonly instrument: string;
  readonly timeframe: string;
  readonly sessionDate: string;
  readonly status: ShadowStatus;
  readonly recommendationRunId: string | null;
  readonly portfolioRunId: string | null;
  readonly hypothetical: ShadowHypotheticalPosition | null;
  readonly outcome: ShadowOutcome;
  readonly events: readonly ShadowValidationEvent[];
  readonly evidence: ShadowEvidence;
  readonly blockingReasons: readonly string[];
  readonly policy: ShadowPolicy;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ShadowMetrics = {
  readonly recommendationsObserved: number;
  readonly recommendationsBlocked: number;
  readonly entries: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly profitFactor: number;
  readonly expectancy: number;
  readonly maxDrawdown: number;
  readonly mfeAvg: number;
  readonly maeAvg: number;
  readonly coverage: number;
  readonly precision: number;
  readonly recall: number;
  readonly brier: number;
  readonly calibrationError: number;
  readonly highConfidenceAccuracy: number;
  readonly lowConfidenceAccuracy: number;
  readonly driftScore: number;
  readonly portfolioShadowReturn: number;
  readonly portfolioShadowDrawdown: number;
  readonly capitalUtilization: number;
  readonly constraintBreaches: number;
};

export function emptyOutcome(): ShadowOutcome {
  return {
    resolved: false,
    exit: null,
    exitPrice: null,
    exitDate: null,
    mfe: 0,
    mae: 0,
    holdingBars: 0,
    netPoints: 0,
    netAfterCosts: 0,
  };
}

export function defaultPolicy(): ShadowPolicy {
  return {
    entry: "NEXT_CANDLE_OPEN",
    stop: "STRATEGY",
    target: "FIXED_RR",
    rrMultiple: 2,
    maxHoldBars: 50,
    maxDataAgeSeconds: 300,
    minConfidence: 0.55,
    acceptDelayed: true,
    costsPct: 0.0005,
  };
}

export const RELIABILITY_BLOCKED: ReadonlyArray<string> = ["POOR", "UNRELIABLE"];