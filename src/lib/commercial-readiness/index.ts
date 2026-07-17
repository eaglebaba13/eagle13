// Phase 30 — Commercial (SaaS) launch readiness aggregator.
//
// Combines the Phase-29 launch checklist inputs with SaaS-specific
// gates: billing wired, license engine live, admin panel present,
// email flows configured, coupons available, permission matrix built.
// Pure. Deterministic.

import { evaluateLaunchChecklist, type LaunchChecklistInputs, type LaunchVerdict } from "@/lib/launch-checklist";

export interface CommercialReadinessInputs extends LaunchChecklistInputs {
  readonly billingWired: boolean;
  readonly licenseEngineLive: boolean;
  readonly adminPanelReady: boolean;
  readonly transactionalEmailsReady: boolean;
  readonly couponsReady: boolean;
  readonly permissionMatrixVerified: boolean;
}

export type CommercialVerdict =
  | "NOT_READY"
  | "READY_FOR_BETA"
  | "READY_FOR_SUBSCRIPTION"
  | "READY_FOR_PUBLIC";

export interface CommercialReadinessReport {
  readonly verdict: CommercialVerdict;
  readonly launchVerdict: LaunchVerdict;
  readonly missingCommercial: readonly (keyof CommercialReadinessInputs)[];
  readonly formulaVersion: string;
}

export const COMMERCIAL_READINESS_VERSION = "commercial-readiness@1.0.0";

const COMMERCIAL_GATES: readonly (keyof CommercialReadinessInputs)[] = [
  "billingWired", "licenseEngineLive", "adminPanelReady",
  "transactionalEmailsReady", "couponsReady", "permissionMatrixVerified",
];

export function evaluateCommercialReadiness(inp: CommercialReadinessInputs): CommercialReadinessReport {
  const launch = evaluateLaunchChecklist(inp);
  const missingCommercial = COMMERCIAL_GATES.filter((k) => !inp[k]);
  if (launch.verdict === "NOT_READY") {
    return {
      verdict: "NOT_READY",
      launchVerdict: launch.verdict,
      missingCommercial,
      formulaVersion: COMMERCIAL_READINESS_VERSION,
    };
  }
  if (missingCommercial.length > 0) {
    return {
      verdict: "READY_FOR_BETA",
      launchVerdict: launch.verdict,
      missingCommercial,
      formulaVersion: COMMERCIAL_READINESS_VERSION,
    };
  }
  // Commercial gates green — verdict tracks launch checklist beyond BETA.
  return {
    verdict: launch.verdict === "READY_FOR_PUBLIC" ? "READY_FOR_PUBLIC" : "READY_FOR_SUBSCRIPTION",
    launchVerdict: launch.verdict,
    missingCommercial: [],
    formulaVersion: COMMERCIAL_READINESS_VERSION,
  };
}