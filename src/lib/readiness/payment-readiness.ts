import type { ReadinessResult } from "./production-readiness-types";

export interface PaymentReadinessInput {
  paidPlansEnabled: boolean;
  upiConfigured: boolean;
  serverSideAmountResolution: boolean;
  planCycleValidated: boolean;
  requestExpiryHours: number;
  utrValidationActive: boolean;
  screenshotBucketPrivate: boolean;
  adminApprovalRoleGuarded: boolean;
  duplicateActiveRequestBlocked: boolean;
  duplicateUtrDetection: boolean;
  amountMismatchFlagged: boolean;
  approvalIsAtomic: boolean;
  auditLogsEnabled: boolean;
  rejectionReasonRequired: boolean;
  subscriptionExtendsOnActive: boolean;
  providerLabel: string; // e.g. "manual_upi"
}

function bool(id: string, title: string, ok: boolean, detail?: string): ReadinessResult {
  return {
    id,
    category: "PAYMENTS",
    title,
    status: ok ? "PASS" : "FAIL",
    severity: ok ? "info" : "critical",
    hardBlocker: false,
    detail: ok ? undefined : detail,
  };
}

export function auditPaymentReadiness(input: PaymentReadinessInput): ReadinessResult[] {
  const out: ReadinessResult[] = [];
  if (!input.paidPlansEnabled) {
    out.push({
      id: "payment.paid-plans-disabled",
      category: "PAYMENTS",
      title: "Paid plans disabled",
      status: "NOT_APPLICABLE",
      severity: "info",
    });
    return out;
  }

  out.push(bool("payment.upi-configured", "UPI configuration", input.upiConfigured, "MANUAL_UPI_* env vars missing."));
  out.push(bool("payment.server-price", "Server-side pricing", input.serverSideAmountResolution));
  out.push(bool("payment.plan-cycle", "Plan/cycle validation", input.planCycleValidated));
  out.push({
    id: "payment.expiry",
    category: "PAYMENTS",
    title: "Request expiry configured",
    status: input.requestExpiryHours > 0 && input.requestExpiryHours <= 72 ? "PASS" : "WARNING",
    severity: "info",
    evidence: [{ key: "hours", value: input.requestExpiryHours }],
  });
  out.push(bool("payment.utr-validation", "UTR validation active", input.utrValidationActive));
  out.push(bool("payment.bucket-private", "Screenshot bucket private", input.screenshotBucketPrivate));
  out.push(bool("payment.admin-approve", "Admin approval role guarded", input.adminApprovalRoleGuarded));
  out.push(bool("payment.dup-active", "Duplicate active-request prevented", input.duplicateActiveRequestBlocked));
  out.push(bool("payment.dup-utr", "Duplicate UTR detection", input.duplicateUtrDetection));
  out.push(bool("payment.amount-mismatch", "Amount mismatch flagged", input.amountMismatchFlagged));
  out.push(bool("payment.atomic-approval", "Approval is atomic", input.approvalIsAtomic));
  out.push(bool("payment.audit-log", "Payment audit logs enabled", input.auditLogsEnabled));
  out.push(bool("payment.rejection-reason", "Rejection reason required", input.rejectionReasonRequired));
  out.push(bool("payment.subscription-extend", "Subscription extended on approval", input.subscriptionExtendsOnActive));
  out.push({
    id: "payment.provider-label",
    category: "PAYMENTS",
    title: "Provider label",
    status: input.providerLabel === "manual_upi" ? "PASS" : "WARNING",
    severity: "info",
    evidence: [{ key: "provider", value: input.providerLabel }],
  });
  return out;
}
