import type { IncidentDrill, RecoveryDrill, StagingCheck } from "./staging-validation-types";

export function recoveryDrillsToChecks(drills: readonly RecoveryDrill[]): StagingCheck[] {
  return drills.map((d) => {
    const noRollback = d.id === "rollback" && d.outcome === "NOT_CONFIGURED";
    return {
      id: noRollback ? "release.no_rollback" : `recovery.${d.id}`,
      category: "RECOVERY",
      title: `Recovery drill: ${d.title}`,
      status:
        d.outcome === "EXECUTED_PASS"
          ? "PASS"
          : d.outcome === "EXECUTED_FAIL"
          ? "FAIL"
          : d.outcome === "DOCUMENTED_ONLY"
          ? "WARNING"
          : d.outcome === "NOT_CONFIGURED"
          ? "FAIL"
          : "UNKNOWN",
      severity: noRollback ? "blocker" : d.outcome === "EXECUTED_FAIL" ? "critical" : "info",
      detail: `${d.outcome}${d.detail ? ` — ${d.detail}` : ""}`,
      hardBlocker: noRollback,
    } as StagingCheck;
  });
}

export function incidentDrillsToChecks(drills: readonly IncidentDrill[]): StagingCheck[] {
  return drills.map((d) => ({
    id: `incident.${d.id}`,
    category: "RECOVERY",
    title: `Incident drill: ${d.scenario}`,
    status:
      d.outcome === "EXECUTED_PASS"
        ? "PASS"
        : d.outcome === "EXECUTED_FAIL"
        ? "FAIL"
        : d.outcome === "DOCUMENTED_ONLY"
        ? "WARNING"
        : "UNKNOWN",
    severity: "info",
    detail: `owner=${d.owner} detect=${d.detectionMs ?? "?"}ms ack=${d.acknowledgmentMs ?? "?"}ms`,
  }));
}

export const DEFAULT_RECOVERY_DRILLS: readonly RecoveryDrill[] = [
  { id: "provider_outage", title: "Provider outage recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "cache_corruption", title: "Cache corruption recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "scheduler_restart", title: "Scheduler restart", outcome: "DOCUMENTED_ONLY" },
  { id: "auth_failure", title: "Auth failure recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "db_connection", title: "Database connection recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "storage_permission", title: "Storage permission recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "deployment", title: "Failed deployment rollback", outcome: "DOCUMENTED_ONLY" },
  { id: "env_var", title: "Bad environment variable rollback", outcome: "DOCUMENTED_ONLY" },
  { id: "migration", title: "Broken migration rollback", outcome: "DOCUMENTED_ONLY" },
  { id: "manual_payment", title: "Manual payment recovery", outcome: "DOCUMENTED_ONLY" },
  { id: "rollback", title: "Rollback procedure documented", outcome: "NOT_CONFIGURED" },
];