// Phase 24B · Actionable-signal safety helper.
//
// No widget may emit a BUY/SELL / GO recommendation when its supporting
// data is stale, unavailable, invalid, or a required validation has failed.
// This helper centralizes that policy so every card follows the same rule.

import type { FreshnessStatus, DataQualityStatus, ProviderStatus } from "./data-freshness";

export type CausalityStatus = "OK" | "FAILED" | "UNKNOWN";

export type ActionableSignalInput = {
  freshness: FreshnessStatus;
  dataQuality?: DataQualityStatus;
  formulaVersion?: string | null;
  providerStatus?: ProviderStatus;
  causalityStatus?: CausalityStatus;
};

export type ActionableSignalResult = {
  allowed: boolean;
  blockingReasons: string[];
};

export function canDisplayActionableSignal(input: ActionableSignalInput): ActionableSignalResult {
  const reasons: string[] = [];

  if (input.freshness === "STALE" || input.freshness === "UNAVAILABLE" || input.freshness === "ERROR") {
    reasons.push(`Data ${input.freshness}`);
  }
  if (input.freshness === "DELAYED") {
    reasons.push("Data DELAYED");
  }
  if (input.dataQuality && input.dataQuality !== "OK") {
    reasons.push(`Data quality ${input.dataQuality}`);
  }
  if (input.providerStatus === "DOWN") {
    reasons.push("Provider DOWN");
  }
  if (input.causalityStatus === "FAILED") {
    reasons.push("Validation blocked");
  }
  if (!input.formulaVersion) {
    reasons.push("Missing formula version");
  }

  return { allowed: reasons.length === 0, blockingReasons: reasons };
}

export function blockedLabel(reasons: string[]): string {
  if (reasons.length === 0) return "OK";
  if (reasons.some((r) => r.includes("Validation"))) return "VALIDATION BLOCKED";
  if (reasons.some((r) => r.includes("STALE"))) return "STALE";
  if (reasons.some((r) => r.includes("UNAVAILABLE") || r.includes("DOWN"))) return "DATA UNAVAILABLE";
  return "BLOCKED";
}