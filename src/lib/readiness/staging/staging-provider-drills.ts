import type { StagingCheck } from "./staging-validation-types";

export type ProviderFailureMode =
  | "timeout"
  | "dns"
  | "http_401"
  | "http_403"
  | "http_429"
  | "http_500"
  | "http_503"
  | "malformed_json"
  | "schema_drift"
  | "missing_timestamp"
  | "stale_timestamp"
  | "wrong_tz"
  | "unit_mismatch"
  | "partial_response"
  | "empty_response";

export interface ProviderDrillObservation {
  providerId: string;
  mode: ProviderFailureMode;
  dashboardUsable: boolean;
  typedErrorShown: boolean;
  freshnessDegraded: boolean;
  actionableBlocked: boolean;
  fabricatedFallback: boolean;
  retriesObserved: number;
  retryBudget: number;
  failoverDisclosedIfActive: boolean;
  requestStorm: boolean;
}

export function auditProviderDrills(obs: readonly ProviderDrillObservation[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const o of obs) {
    const problems: string[] = [];
    if (!o.dashboardUsable) problems.push("dashboard_unusable");
    if (!o.typedErrorShown) problems.push("no_typed_error");
    if (!o.freshnessDegraded) problems.push("freshness_not_degraded");
    if (!o.actionableBlocked) problems.push("actionable_not_blocked");
    if (o.fabricatedFallback) problems.push("fabricated_fallback");
    if (o.retriesObserved > o.retryBudget) problems.push("retry_budget_exceeded");
    if (o.requestStorm) problems.push("request_storm");
    if (!o.failoverDisclosedIfActive) problems.push("failover_undisclosed");
    const isBlocker = o.fabricatedFallback || o.requestStorm;
    const failed = problems.length > 0;
    checks.push({
      id: `provider_drill.${o.providerId}.${o.mode}`,
      category: "PROVIDERS",
      title: `Provider drill: ${o.providerId} — ${o.mode}`,
      status: failed ? "FAIL" : "PASS",
      severity: isBlocker ? "blocker" : failed ? "critical" : "info",
      detail: failed ? problems.join(",") : "resilient",
      hardBlocker: isBlocker,
    });
  }
  return checks;
}

export interface FailoverObservation {
  dependencyId: string;
  fallbackAllowed: boolean;
  primaryForcedFail: boolean;
  secondaryEligible: boolean;
  schemaCompatible: boolean;
  timestampDivergenceSeconds: number;
  unitNormalized: boolean;
  providerLabelChanged: boolean;
  statusDegraded: boolean;
  actionableSignalPolicyRespected: boolean;
}

export function auditFailoverDrill(obs: readonly FailoverObservation[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const o of obs) {
    if (!o.fallbackAllowed) {
      const bad = o.secondaryEligible && !o.statusDegraded;
      checks.push({
        id: `failover.${o.dependencyId}.no_fallback`,
        category: "PROVIDERS",
        title: `Failover policy: ${o.dependencyId} — no fallback`,
        status: bad ? "FAIL" : "PASS",
        severity: bad ? "blocker" : "info",
        detail: bad ? "silent switch detected" : "unavailable respected",
        hardBlocker: bad,
      });
      continue;
    }
    const issues: string[] = [];
    if (!o.secondaryEligible) issues.push("secondary_ineligible");
    if (!o.schemaCompatible) issues.push("schema_incompatible");
    if (o.timestampDivergenceSeconds > 60) issues.push("timestamp_divergence");
    if (!o.unitNormalized) issues.push("unit_not_normalized");
    if (!o.providerLabelChanged) issues.push("label_not_changed");
    if (!o.statusDegraded) issues.push("status_not_degraded");
    if (!o.actionableSignalPolicyRespected) issues.push("actionable_policy_violated");
    const failed = issues.length > 0;
    checks.push({
      id: `failover.${o.dependencyId}`,
      category: "PROVIDERS",
      title: `Failover drill: ${o.dependencyId}`,
      status: failed ? "FAIL" : "PASS",
      severity: failed ? "critical" : "info",
      detail: failed ? issues.join(",") : "compliant",
    });
  }
  return checks;
}