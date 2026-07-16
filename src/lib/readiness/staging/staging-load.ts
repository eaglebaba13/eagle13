import type { StagingCheck } from "./staging-validation-types";

export interface LoadScenarioObservation {
  id: string;
  label: string;
  errorRate: number;
  p50Ms: number;
  p95Ms: number;
  duplicateRequestRatio: number;
  cacheHitRate: number;
  timeoutRate: number;
  memoryDeltaBytes: number;
  concurrency: number;
}

export const LOAD_SAFETY_LIMITS = {
  maxConcurrency: 20,
  errorRateFail: 0.05,
  errorRateWarn: 0.01,
  p95FailMs: 5000,
  p95WarnMs: 2500,
};

export function auditLoad(obs: readonly LoadScenarioObservation[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const o of obs) {
    if (o.concurrency > LOAD_SAFETY_LIMITS.maxConcurrency) {
      checks.push({
        id: `load.${o.id}.unsafe_concurrency`,
        category: "LOAD",
        title: `Unsafe concurrency in ${o.label}`,
        status: "BLOCKED",
        severity: "critical",
        detail: `concurrency=${o.concurrency} > ${LOAD_SAFETY_LIMITS.maxConcurrency}`,
      });
      continue;
    }
    const status =
      o.errorRate >= LOAD_SAFETY_LIMITS.errorRateFail || o.p95Ms >= LOAD_SAFETY_LIMITS.p95FailMs
        ? "FAIL"
        : o.errorRate >= LOAD_SAFETY_LIMITS.errorRateWarn || o.p95Ms >= LOAD_SAFETY_LIMITS.p95WarnMs
        ? "WARNING"
        : "PASS";
    checks.push({
      id: `load.${o.id}`,
      category: "LOAD",
      title: `Load: ${o.label}`,
      status,
      severity: status === "FAIL" ? "critical" : status === "WARNING" ? "warning" : "info",
      detail: `err=${(o.errorRate * 100).toFixed(2)}% p50=${o.p50Ms}ms p95=${o.p95Ms}ms hit=${(o.cacheHitRate * 100).toFixed(0)}%`,
    });
  }
  return checks;
}