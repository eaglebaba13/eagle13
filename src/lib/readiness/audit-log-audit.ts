import type { ReadinessResult } from "./production-readiness-types";

export interface AuditLogInput {
  observedEvents: readonly string[];
  logsSecretsSample: readonly string[];
  logsFullProofUrlsSample: readonly string[];
}

export const REQUIRED_AUDIT_EVENTS = [
  "manual_payment.created",
  "manual_payment.utr_submitted",
  "manual_payment.approved",
  "manual_payment.rejected",
  "admin.plan_changed",
  "admin.status_changed",
  "admin.trial_extended",
  "admin.entitlement_granted",
  "admin.entitlement_revoked",
  "admin.usage_reset",
  "subscription.cancel_scheduled",
  "subscription.cancel_reverted",
  "subscription.trial_started",
] as const;

export function auditAuditLog(input: AuditLogInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  const missing = REQUIRED_AUDIT_EVENTS.filter((e) => !input.observedEvents.includes(e));
  out.push({
    id: "audit.coverage",
    category: "GOVERNANCE",
    title: "Audit event coverage",
    status: missing.length === 0 ? "PASS" : "WARNING",
    severity: missing.length === 0 ? "info" : "warning",
    detail: missing.length ? `Missing events: ${missing.join(", ")}` : undefined,
  });
  out.push({
    id: "audit.no-secrets",
    category: "SECURITY",
    title: "No secrets in audit log samples",
    status: input.logsSecretsSample.length === 0 ? "PASS" : "FAIL",
    severity: input.logsSecretsSample.length === 0 ? "info" : "blocker",
    hardBlocker: input.logsSecretsSample.length > 0,
  });
  out.push({
    id: "audit.no-proof-urls",
    category: "SECURITY",
    title: "No full payment-proof URLs in audit log",
    status: input.logsFullProofUrlsSample.length === 0 ? "PASS" : "FAIL",
    severity: input.logsFullProofUrlsSample.length === 0 ? "info" : "critical",
  });
  return out;
}
