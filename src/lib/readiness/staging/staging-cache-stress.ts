import type { StagingCheck } from "./staging-validation-types";

export interface CacheStressObservation {
  namespace: string;
  hits: number;
  misses: number;
  staleHits: number;
  refreshCount: number;
  errors: number;
  dedupedRequests: number;
  durationMs: number;
  memoryDeltaBytes: number;
  formulaVersionIsolated: boolean;
  runIdIsolated: boolean;
  ttlExpiryObserved: boolean;
  refreshDuringProviderFailure: "graceful" | "storm" | "unknown";
}

export function auditCacheStress(obs: readonly CacheStressObservation[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const o of obs) {
    const issues: string[] = [];
    if (!o.formulaVersionIsolated) issues.push("formula_version_not_isolated");
    if (!o.runIdIsolated) issues.push("run_id_not_isolated");
    if (o.refreshDuringProviderFailure === "storm") issues.push("provider_failure_storm");
    if (o.errors > 0 && o.refreshCount === 0) issues.push("errors_without_refresh");
    const failed = issues.length > 0;
    checks.push({
      id: `cache_stress.${o.namespace}`,
      category: "PROVIDERS",
      title: `Cache stress: ${o.namespace}`,
      status: failed ? "FAIL" : "PASS",
      severity: failed ? "critical" : "info",
      detail: failed
        ? issues.join(",")
        : `hit=${o.hits} miss=${o.misses} stale=${o.staleHits} dedup=${o.dedupedRequests}`,
    });
  }
  return checks;
}