import type { StagingCheck } from "./staging-validation-types";

export interface SchedulerStressObservation {
  schedulerInstances: number;
  duplicatedTasks: readonly string[];
  overlappingBeyondPolicy: readonly string[];
  tightLoopDetected: boolean;
  fasterThanTimeframeRule: boolean;
  errorIsolated: boolean;
  pauseResumeOk: boolean;
  memoryStable: boolean;
  eventLoopStalledMs: number;
}

export function auditSchedulerStress(o: SchedulerStressObservation): StagingCheck[] {
  const checks: StagingCheck[] = [];
  if (o.schedulerInstances !== 1) {
    checks.push({
      id: "scheduler.duplicate",
      category: "OPERATIONS",
      title: "Multiple scheduler instances detected",
      status: "FAIL",
      severity: "blocker",
      detail: `instances=${o.schedulerInstances}`,
      hardBlocker: true,
    });
  } else {
    checks.push({
      id: "scheduler.single_instance",
      category: "OPERATIONS",
      title: "Single scheduler instance",
      status: "PASS",
      severity: "info",
    });
  }
  if (o.duplicatedTasks.length > 0) {
    checks.push({
      id: "scheduler.duplicate_tasks",
      category: "OPERATIONS",
      title: "Duplicate scheduler tasks",
      status: "FAIL",
      severity: "critical",
      detail: o.duplicatedTasks.join(","),
    });
  }
  if (o.tightLoopDetected || o.fasterThanTimeframeRule) {
    checks.push({
      id: "scheduler.rate_violation",
      category: "OPERATIONS",
      title: "Scheduler rate violation",
      status: "FAIL",
      severity: "critical",
      detail: `tightLoop=${o.tightLoopDetected} fasterThanRule=${o.fasterThanTimeframeRule}`,
    });
  }
  if (!o.errorIsolated) {
    checks.push({
      id: "scheduler.error_bleed",
      category: "OPERATIONS",
      title: "Task errors are not isolated",
      status: "WARNING",
      severity: "warning",
    });
  }
  if (!o.pauseResumeOk) {
    checks.push({
      id: "scheduler.pause_resume",
      category: "OPERATIONS",
      title: "Pause/resume behavior broken",
      status: "FAIL",
      severity: "critical",
    });
  }
  if (o.eventLoopStalledMs > 500) {
    checks.push({
      id: "scheduler.event_loop_stall",
      category: "OPERATIONS",
      title: "Event loop stalled",
      status: "WARNING",
      severity: "warning",
      detail: `${o.eventLoopStalledMs}ms`,
    });
  }
  return checks;
}