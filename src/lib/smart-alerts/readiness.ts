// Phase 3C-3 — Smart Alert Engine runtime readiness evidence.
//
// Pure, deterministic mapping from measurable operational signals to a
// canonical RuntimeEvidence-friendly view. Consumed by
// `buildRuntimeReadinessReport` and admin diagnostics. No I/O.

import { SMART_ALERTS_RULES_VERSION } from "./types";
import { allAlertTypes } from "./subscriptions";

// The Smart Alert engine is rule-per-transition. Each AlertType maps to one
// deterministic rule inside `events.ts::generateAlertEvents`. The count is
// therefore the number of alert types.
const RULE_COUNT = allAlertTypes().length;

export type SmartAlertEngineStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface SmartAlertEngineHealth {
  readonly available: boolean; // engine module imported and rules loaded
  readonly ruleCount: number;
  readonly alertTypeCount: number;
  readonly rulesVersion: string;
  readonly persistenceAvailable: boolean;
  readonly checkpointAvailable: boolean;
  readonly inAppDeliveryAvailable: boolean;
  readonly externalAdaptersDisabledByConfiguration: boolean;
  readonly lastEvaluationAt: string | null;
  readonly lastSuccessfulEvaluationAt: string | null;
  readonly lastEvaluationStatus: "OK" | "FAILED" | "UNKNOWN";
  readonly lastError: string | null;
  readonly dedupeHealthy: boolean;
  readonly staleCheckpoint: boolean;
  readonly deliveryFailureRate: number;
}

export interface SmartAlertReadiness {
  readonly status: SmartAlertEngineStatus;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly blockers: readonly string[];
  readonly health: SmartAlertEngineHealth;
}

/** Default health when the caller could not gather operational data. */
export function unknownEngineHealth(): SmartAlertEngineHealth {
  return {
    available: true,
    ruleCount: RULE_COUNT,
    alertTypeCount: allAlertTypes().length,
    rulesVersion: SMART_ALERTS_RULES_VERSION,
    persistenceAvailable: true,
    checkpointAvailable: true,
    inAppDeliveryAvailable: true,
    externalAdaptersDisabledByConfiguration: true,
    lastEvaluationAt: null,
    lastSuccessfulEvaluationAt: null,
    lastEvaluationStatus: "UNKNOWN",
    lastError: null,
    dedupeHealthy: true,
    staleCheckpoint: false,
    deliveryFailureRate: 0,
  };
}

export function classifySmartAlertReadiness(h: SmartAlertEngineHealth): SmartAlertReadiness {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!h.available || h.ruleCount === 0) {
    blockers.push("Smart Alert engine did not initialise");
  }
  if (!h.persistenceAvailable) {
    blockers.push("Alert persistence unavailable");
  }
  if (!h.checkpointAvailable) {
    blockers.push("Alert checkpoint unavailable");
  }
  if (!h.inAppDeliveryAvailable) {
    blockers.push("In-app delivery unavailable");
  }

  if (h.lastEvaluationStatus === "FAILED") {
    warnings.push(`Last evaluation failed${h.lastError ? `: ${h.lastError}` : ""}`);
  }
  if (h.staleCheckpoint) {
    warnings.push("Checkpoint has not advanced recently");
  }
  if (!h.dedupeHealthy) {
    warnings.push("Dedupe layer reported inconsistency");
  }
  if (h.deliveryFailureRate > 0.25) {
    warnings.push("In-app delivery failure rate elevated");
  }

  // Disabled external adapters (email/telegram/webhook) do NOT degrade the
  // engine — they are opt-in and disabled by configuration for v1.0.
  const status: SmartAlertEngineStatus =
    blockers.length > 0 ? "UNAVAILABLE" : warnings.length > 0 ? "DEGRADED" : "HEALTHY";

  const reason =
    status === "HEALTHY"
      ? `Smart Alert engine healthy — ${h.ruleCount} rules loaded, in-app delivery active${
          h.externalAdaptersDisabledByConfiguration ? " (external adapters disabled by configuration)" : ""
        }`
      : status === "DEGRADED"
        ? warnings[0] ?? "Smart Alert engine degraded"
        : blockers[0] ?? "Smart Alert engine unavailable";

  return { status, reason, warnings, blockers, health: h };
}