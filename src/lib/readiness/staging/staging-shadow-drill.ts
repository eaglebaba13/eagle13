import type { StagingCheck } from "./staging-validation-types";

export interface ShadowDrillObservation {
  closedCandleOnly: boolean;
  duplicateRejected: boolean;
  staleRejected: boolean;
  readinessGateEnforced: boolean;
  recommendationEvidencePresent: boolean;
  hypotheticalEntryOnly: boolean;
  outcomeUpdated: boolean;
  calibrationUpdated: boolean;
  driftUpdated: boolean;
  persisted: boolean;
  exported: boolean;
  brokerOrderObjectPresent: boolean;
  liveNotificationTriggered: boolean;
}

export function auditShadowDrill(o: ShadowDrillObservation): StagingCheck[] {
  const checks: StagingCheck[] = [];
  if (!o.closedCandleOnly) {
    checks.push({
      id: "shadow.open_candle_entry",
      category: "OPERATIONS",
      title: "Shadow accepted open/unclosed candle",
      status: "FAIL",
      severity: "blocker",
      hardBlocker: true,
    });
  }
  if (o.brokerOrderObjectPresent) {
    checks.push({
      id: "broker.execution_object_present",
      category: "OPERATIONS",
      title: "Broker/order execution object detected",
      status: "FAIL",
      severity: "blocker",
      detail: "Staging must never carry a live broker/order object.",
      hardBlocker: true,
    });
  }
  if (o.liveNotificationTriggered) {
    checks.push({
      id: "shadow.live_notification",
      category: "OPERATIONS",
      title: "Live notification fired during shadow drill",
      status: "FAIL",
      severity: "critical",
    });
  }
  const props: Array<[keyof ShadowDrillObservation, string]> = [
    ["duplicateRejected", "duplicate_not_rejected"],
    ["staleRejected", "stale_not_rejected"],
    ["readinessGateEnforced", "readiness_gate_bypassed"],
    ["recommendationEvidencePresent", "no_recommendation_evidence"],
    ["hypotheticalEntryOnly", "non_hypothetical_entry"],
    ["outcomeUpdated", "outcome_not_updated"],
    ["calibrationUpdated", "calibration_not_updated"],
    ["driftUpdated", "drift_not_updated"],
    ["persisted", "not_persisted"],
    ["exported", "not_exported"],
  ];
  const missing = props.filter(([k]) => !o[k]).map(([, id]) => id);
  checks.push({
    id: missing.length ? "shadow.drill_gaps" : "shadow.drill_ok",
    category: "OPERATIONS",
    title: "Shadow observation drill",
    status: missing.length ? "WARNING" : "PASS",
    severity: missing.length ? "warning" : "info",
    detail: missing.length ? missing.join(",") : "closed-candle drill compliant",
  });
  return checks;
}