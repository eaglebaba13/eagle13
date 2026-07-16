import type { StagingCheck } from "./staging-validation-types";

export interface ManualPaymentJourneyObservation {
  requestCreated: boolean;
  serverSidePriceValidated: boolean;
  planCycleValidated: boolean;
  screenshotMetadataValidated: boolean;
  utrFormatValidated: boolean;
  duplicateUtrRejected: boolean;
  duplicatePendingRejected: boolean;
  adminOnlyApproval: boolean;
  rejectionReasonRequired: boolean;
  subscriptionActivatedAtomically: boolean;
  auditLogEntryPresent: boolean;
  labeledAsStaging: boolean;
  realPaymentTriggered: boolean;
}

export function auditManualPaymentJourney(o: ManualPaymentJourneyObservation): StagingCheck[] {
  if (o.realPaymentTriggered) {
    return [
      {
        id: "payment.real_payment_triggered",
        category: "PAYMENTS",
        title: "Real payment triggered during staging",
        status: "FAIL",
        severity: "blocker",
        detail: "Staging must never trigger a real payment.",
        hardBlocker: true,
      },
    ];
  }
  const requirements: [keyof ManualPaymentJourneyObservation, string][] = [
    ["requestCreated", "request_not_created"],
    ["serverSidePriceValidated", "price_client_trusted"],
    ["planCycleValidated", "plan_cycle_not_validated"],
    ["screenshotMetadataValidated", "screenshot_metadata_missing"],
    ["utrFormatValidated", "utr_format_not_validated"],
    ["duplicateUtrRejected", "duplicate_utr_accepted"],
    ["duplicatePendingRejected", "duplicate_pending_accepted"],
    ["adminOnlyApproval", "non_admin_can_approve"],
    ["rejectionReasonRequired", "rejection_reason_optional"],
    ["subscriptionActivatedAtomically", "activation_not_atomic"],
    ["auditLogEntryPresent", "audit_log_missing"],
    ["labeledAsStaging", "staging_label_missing"],
  ];
  const missing = requirements.filter(([k]) => !o[k]).map(([, id]) => id);
  const failed = missing.length > 0;
  const isBlocker = missing.includes("activation_not_atomic") || missing.includes("non_admin_can_approve");
  return [
    {
      id: failed ? "payment.activation_failed" : "payment.journey_ok",
      category: "PAYMENTS",
      title: "Manual payment staging journey",
      status: failed ? "FAIL" : "PASS",
      severity: isBlocker ? "blocker" : failed ? "critical" : "info",
      detail: failed ? missing.join(",") : "all steps validated",
      hardBlocker: isBlocker,
    },
  ];
}