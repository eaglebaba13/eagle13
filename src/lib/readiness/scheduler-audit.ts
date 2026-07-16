import type { ReadinessResult } from "./production-readiness-types";

export interface SchedulerTask {
  name: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  errorCount: number;
  avgDurationMs: number;
  minCadenceMs: number;
  actualCadenceMs: number;
  running: boolean;
}

export interface SchedulerAuditInput {
  schedulerInstances: number;
  shadowSchedulerRunning: boolean;
  tasks: readonly SchedulerTask[];
  pageHidden: boolean;
}

export function auditScheduler(input: SchedulerAuditInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  const dup = input.schedulerInstances > 1;
  out.push({
    id: "scheduler.instances",
    category: "OPERATIONS",
    title: "Master scheduler instances",
    status: dup ? "FAIL" : "PASS",
    severity: dup ? "critical" : "info",
    hardBlocker: dup,
    detail: dup ? `${input.schedulerInstances} scheduler instances detected.` : undefined,
  });
  for (const t of input.tasks) {
    const tooFast = t.actualCadenceMs > 0 && t.actualCadenceMs < t.minCadenceMs;
    const stale =
      t.lastRunAt != null &&
      Date.now() - Date.parse(t.lastRunAt) > 3 * Math.max(t.minCadenceMs, 60_000);
    const highErr = t.errorCount > 5;
    out.push({
      id: `scheduler.task.${t.name}`,
      category: "OPERATIONS",
      title: `Scheduler: ${t.name}`,
      status: tooFast || stale || highErr ? "FAIL" : "PASS",
      severity: tooFast ? "critical" : stale ? "warning" : highErr ? "warning" : "info",
      detail: [
        tooFast ? "actual cadence faster than provider minimum" : "",
        stale ? "task has not run recently" : "",
        highErr ? `${t.errorCount} recent errors` : "",
      ]
        .filter(Boolean)
        .join("; ") || undefined,
    });
  }
  return out;
}
