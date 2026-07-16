// Phase 23 · Stage 1 — Shadow orchestrator: pure deterministic reducer.
// No network access, no broker imports, no live-order side effects.

import {
  computeShadowObservationRunId,
  computeShadowSessionRunId,
} from "./shadow-run-id";
import {
  emptyOutcome,
  RELIABILITY_BLOCKED,
  type DataQualityState,
  type ShadowDataSnapshot,
  type ShadowDirection,
  type ShadowEvidence,
  type ShadowHypotheticalPosition,
  type ShadowObservation,
  type ShadowPolicy,
  type ShadowPortfolioDecision,
  type ShadowRecommendation,
  type ShadowSession,
  type ShadowStatus,
  type ShadowValidationEvent,
} from "./shadow-types";

export type ShadowGateResult = {
  readonly ok: boolean;
  readonly status: ShadowStatus;
  readonly reasons: readonly string[];
};

export type OrchestratorInput = {
  readonly data: ShadowDataSnapshot;
  readonly recommendation: ShadowRecommendation | null;
  readonly portfolio: ShadowPortfolioDecision | null;
  readonly policy: ShadowPolicy;
  readonly nowIso: string;
  readonly hasActiveShadow: boolean;
  readonly strategiesAgree: boolean;
  readonly causalityOk: boolean;
  readonly formulaAligned: boolean;
};

export type OrchestratorReduceResult = {
  readonly session: ShadowSession;
  readonly observation: ShadowObservation | null;
  readonly events: readonly ShadowValidationEvent[];
  readonly gate: ShadowGateResult;
};

function pushEvent(
  list: ShadowValidationEvent[],
  kind: ShadowValidationEvent["kind"],
  at: string,
  evidence: ShadowEvidence,
  reason?: string,
): void {
  list.push({
    id: `${kind}:${at}:${list.length}`,
    kind,
    at,
    reason,
    evidence,
  });
}

export function evaluateEntryGates(inp: OrchestratorInput): ShadowGateResult {
  const reasons: string[] = [];
  const d = inp.data;
  if (d.candles.length === 0) {
    return { ok: false, status: "WAITING_FOR_DATA", reasons: ["NO_CANDLES"] };
  }
  const last = d.candles[d.candles.length - 1];
  if (!last.closed) reasons.push("UNCLOSED_CANDLE");
  if (d.quality === "MISSING") reasons.push("DATA_MISSING");
  if (d.quality === "STALE") reasons.push("STALE_DATA");
  if (d.quality === "DELAYED" && !inp.policy.acceptDelayed) reasons.push("DELAYED_NOT_ACCEPTED");
  if (d.ageSeconds > inp.policy.maxDataAgeSeconds) reasons.push("STALE_DATA");
  if (!d.dataHash) reasons.push("MISSING_DATA_HASH");
  if (!inp.formulaAligned) return { ok: false, status: "FORMULA_MISMATCH", reasons: ["FORMULA_MISMATCH"] };
  if (!inp.causalityOk) return { ok: false, status: "CAUSALITY_FAILURE", reasons: ["CAUSALITY_FAILURE"] };
  if (!inp.recommendation) reasons.push("NO_RECOMMENDATION");
  else {
    if (inp.recommendation.direction === "WAIT") reasons.push("RECOMMENDATION_WAIT");
    if (inp.recommendation.confidence < inp.policy.minConfidence) reasons.push("LOW_CONFIDENCE");
    if (RELIABILITY_BLOCKED.includes(inp.recommendation.reliability)) reasons.push("RELIABILITY_BLOCKED");
  }
  if (!inp.strategiesAgree) reasons.push("STRATEGY_CONFLICT");
  if (inp.portfolio) {
    if (!inp.portfolio.hardGatePassed) reasons.push("PORTFOLIO_HARD_GATE");
    if (!inp.portfolio.included) reasons.push("PORTFOLIO_EXCLUDED");
  }
  if (inp.hasActiveShadow) reasons.push("ACTIVE_SHADOW_EXISTS");

  if (reasons.includes("STALE_DATA") || reasons.includes("DATA_MISSING")) {
    return { ok: false, status: "STALE_DATA", reasons };
  }
  if (reasons.includes("UNCLOSED_CANDLE") || reasons.includes("MISSING_DATA_HASH")) {
    return { ok: false, status: "DATA_INCOMPLETE", reasons };
  }
  if (reasons.length > 0) {
    // We have data + formula + causality but a soft-gate blocks the entry.
    // Determine the appropriate observing state.
    if (!inp.recommendation) return { ok: false, status: "DATA_READY", reasons };
    if (!inp.portfolio) return { ok: false, status: "RECOMMENDATION_READY", reasons };
    return { ok: false, status: "PORTFOLIO_READY", reasons };
  }
  return { ok: true, status: "ENTRY_READY_SHADOW", reasons: [] };
}

function computeHypothetical(
  direction: ShadowDirection,
  entryPrice: number,
  entryDate: string,
  policy: ShadowPolicy,
): ShadowHypotheticalPosition | null {
  if (direction === "WAIT") return null;
  const side = direction === "BUY" ? "LONG" : "SHORT";
  const rr = policy.rrMultiple ?? 2;
  // Deterministic 1% risk envelope when strategy stop/target absent.
  const risk = entryPrice * 0.01;
  const stop = side === "LONG" ? entryPrice - risk : entryPrice + risk;
  const target = side === "LONG" ? entryPrice + risk * rr : entryPrice - risk * rr;
  return { side, entry: entryPrice, stop, target, entryDate };
}

function buildEvidence(
  inp: OrchestratorInput,
  reasons: readonly string[],
): ShadowEvidence {
  return {
    recommendationRunId: inp.recommendation?.runId ?? null,
    portfolioRunId: inp.portfolio?.runId ?? null,
    dataHash: inp.data.dataHash,
    providerId: inp.data.providerId,
    providerTimestamp: inp.data.providerTimestamp,
    formulaVersion: inp.recommendation?.formulaVersion ?? "n/a",
    regime: inp.recommendation?.regime ?? null,
    confidence: inp.recommendation?.confidence ?? 0,
    reliability: inp.recommendation?.reliability ?? "n/a",
    reasons,
  };
}

export function reduce(inp: OrchestratorInput): OrchestratorReduceResult {
  const events: ShadowValidationEvent[] = [];
  const gate = evaluateEntryGates(inp);
  const evidence = buildEvidence(inp, gate.reasons);
  pushEvent(events, "DATA_RECEIVED", inp.nowIso, evidence);
  const last = inp.data.candles[inp.data.candles.length - 1] ?? null;
  if (last) pushEvent(events, "CANDLE_CLOSED", last.date, evidence);
  if (inp.recommendation) pushEvent(events, "RECOMMENDATION_COMPUTED", inp.nowIso, evidence);
  if (inp.portfolio) pushEvent(events, "PORTFOLIO_COMPUTED", inp.nowIso, evidence);
  if (!gate.ok) pushEvent(events, "BLOCKED", inp.nowIso, evidence, gate.reasons.join(","));

  const sessionId = computeShadowSessionRunId({
    instrument: inp.data.instrument,
    timeframe: inp.data.timeframe,
    sessionDate: inp.data.session,
    strategy: inp.recommendation?.strategy ?? "NONE",
    formulaVersion: inp.recommendation?.formulaVersion ?? "NONE",
    recommendationRunId: inp.recommendation?.runId ?? null,
    portfolioRunId: inp.portfolio?.runId ?? null,
    dataHash: inp.data.dataHash,
    providerId: inp.data.providerId,
    policy: inp.policy,
  });

  let hypothetical: ShadowHypotheticalPosition | null = null;
  let observation: ShadowObservation | null = null;
  if (gate.ok && inp.recommendation && last) {
    const entryPrice = inp.policy.entry === "SIGNAL_CANDLE_CLOSE" ? last.close : last.close;
    hypothetical = computeHypothetical(
      inp.recommendation.direction,
      entryPrice,
      last.date,
      inp.policy,
    );
    pushEvent(events, "ENTRY_READY", inp.nowIso, evidence);
    if (hypothetical) {
      const obsId = computeShadowObservationRunId(
        sessionId,
        last.date,
        inp.recommendation.direction,
        inp.recommendation.confidence,
      );
      observation = {
        id: obsId,
        sessionId,
        recordedAt: inp.nowIso,
        strategy: inp.recommendation.strategy,
        formulaVersion: inp.recommendation.formulaVersion,
        instrument: inp.data.instrument,
        timeframe: inp.data.timeframe,
        regime: inp.recommendation.regime ?? null,
        direction: inp.recommendation.direction,
        confidence: inp.recommendation.confidence,
        reliability: inp.recommendation.reliability,
        score: inp.recommendation.score,
        blockingReasons: [],
        status: "ENTRY_READY_SHADOW",
        hypothetical,
        outcome: emptyOutcome(),
        evidence,
        dataQuality: inp.data.quality,
      };
      pushEvent(events, "ENTRY_OBSERVED", last.date, evidence);
    }
  } else if (inp.recommendation) {
    // Recording a blocked recommendation for calibration/precision analysis.
    const obsId = computeShadowObservationRunId(
      sessionId,
      last?.date ?? inp.nowIso,
      inp.recommendation.direction,
      inp.recommendation.confidence,
    );
    observation = {
      id: obsId,
      sessionId,
      recordedAt: inp.nowIso,
      strategy: inp.recommendation.strategy,
      formulaVersion: inp.recommendation.formulaVersion,
      instrument: inp.data.instrument,
      timeframe: inp.data.timeframe,
      regime: inp.recommendation.regime ?? null,
      direction: inp.recommendation.direction,
      confidence: inp.recommendation.confidence,
      reliability: inp.recommendation.reliability,
      score: inp.recommendation.score,
      blockingReasons: gate.reasons,
      status: gate.status,
      hypothetical: null,
      outcome: emptyOutcome(),
      evidence,
      dataQuality: inp.data.quality,
    };
  }

  const session: ShadowSession = {
    id: sessionId,
    instrument: inp.data.instrument,
    timeframe: inp.data.timeframe,
    sessionDate: inp.data.session,
    status: gate.status,
    recommendationRunId: inp.recommendation?.runId ?? null,
    portfolioRunId: inp.portfolio?.runId ?? null,
    hypothetical,
    outcome: emptyOutcome(),
    events,
    evidence,
    blockingReasons: gate.reasons,
    policy: inp.policy,
    createdAt: inp.nowIso,
    updatedAt: inp.nowIso,
  };
  return { session, observation, events, gate };
}

// Convenience typed-narrow helper for consumers.
export function isEntryReady(status: ShadowStatus): boolean {
  return status === "ENTRY_READY_SHADOW";
}

export function isBlockingStatus(status: ShadowStatus): boolean {
  return (
    status === "STALE_DATA" ||
    status === "DATA_INCOMPLETE" ||
    status === "FORMULA_MISMATCH" ||
    status === "CAUSALITY_FAILURE" ||
    status === "INVALIDATED"
  );
}

// Data-quality helper — exported so the UI safety panel can render.
export function qualityAcceptable(
  q: DataQualityState,
  policy: ShadowPolicy,
): boolean {
  if (q === "LIVE") return true;
  if (q === "DELAYED") return policy.acceptDelayed;
  return false;
}