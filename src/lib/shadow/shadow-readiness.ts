// Phase 23 · Stage 2 — Shadow readiness gate.

import type { ProviderHealth } from "./live-data-provider";
import type { CandleCloseStatus } from "./candle-close-policy";
import type { ResolvedEvidence } from "./shadow-evidence-resolver";

export type ShadowReadinessStatus =
  | "NOT_READY"
  | "READY_FOR_MANUAL_OBSERVATION"
  | "READY_FOR_SCHEDULED_SHADOW"
  | "PAUSED_BY_DATA_QUALITY"
  | "PAUSED_BY_RESEARCH_GAP"
  | "PAUSED_BY_PROVIDER";

export type ShadowReadinessInput = {
  readonly providerHealth: ProviderHealth;
  readonly candleStatus: CandleCloseStatus;
  readonly evidence: ResolvedEvidence;
  readonly schedulerConfigured: boolean;
};

export type ShadowReadinessResult = {
  readonly status: ShadowReadinessStatus;
  readonly reasons: readonly string[];
};

export function evaluateShadowReadiness(inp: ShadowReadinessInput): ShadowReadinessResult {
  const reasons: string[] = [];
  const ph = inp.providerHealth.status;
  if (ph === "UNAVAILABLE" || ph === "AUTH_REQUIRED" || ph === "RATE_LIMITED") {
    reasons.push(`PROVIDER_${ph}`);
    return { status: "PAUSED_BY_PROVIDER", reasons };
  }
  if (inp.candleStatus === "STALE_CANDLE" || inp.candleStatus === "DATA_INCOMPLETE") {
    reasons.push(`CANDLE_${inp.candleStatus}`);
    return { status: "PAUSED_BY_DATA_QUALITY", reasons };
  }
  if (!inp.evidence.ok) {
    return { status: "PAUSED_BY_RESEARCH_GAP", reasons: inp.evidence.missing.map((m) => `MISSING_${m}`) };
  }
  if (inp.candleStatus !== "CLOSED_VALID") {
    reasons.push(`CANDLE_${inp.candleStatus}`);
    return { status: "READY_FOR_MANUAL_OBSERVATION", reasons };
  }
  if (ph === "DELAYED" || ph === "STALE" || ph === "DEGRADED") {
    reasons.push(`PROVIDER_${ph}`);
    return { status: "READY_FOR_MANUAL_OBSERVATION", reasons };
  }
  if (!inp.schedulerConfigured) {
    reasons.push("SCHEDULER_NOT_CONFIGURED");
    return { status: "READY_FOR_MANUAL_OBSERVATION", reasons };
  }
  return { status: "READY_FOR_SCHEDULED_SHADOW", reasons: [] };
}