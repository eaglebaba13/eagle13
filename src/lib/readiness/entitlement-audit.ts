import type { ReadinessResult } from "./production-readiness-types";
import type { AppRole } from "@/lib/roles";

export interface EntitlementRule {
  feature:
    | "backtest"
    | "research"
    | "portfolio"
    | "shadow"
    | "decision"
    | "admin.payments"
    | "diagnostics"
    | "exports";
  allowedRoles: readonly AppRole[];
  serverAuthoritative: boolean;
}

export const ENTITLEMENT_MATRIX: readonly EntitlementRule[] = [
  { feature: "backtest", allowedRoles: ["pro", "professional", "enterprise", "admin"], serverAuthoritative: true },
  { feature: "research", allowedRoles: ["professional", "enterprise", "admin"], serverAuthoritative: true },
  { feature: "portfolio", allowedRoles: ["professional", "enterprise", "admin"], serverAuthoritative: true },
  { feature: "shadow", allowedRoles: ["professional", "enterprise", "admin"], serverAuthoritative: true },
  { feature: "decision", allowedRoles: ["pro", "professional", "enterprise", "admin"], serverAuthoritative: true },
  { feature: "admin.payments", allowedRoles: ["admin"], serverAuthoritative: true },
  { feature: "diagnostics", allowedRoles: ["admin"], serverAuthoritative: true },
  { feature: "exports", allowedRoles: ["free", "pro", "professional", "enterprise", "admin"], serverAuthoritative: false },
];

export interface EntitlementAuditInput {
  /** Feature -> whether the server-side guard actually enforces the matrix. */
  serverEnforcement: Record<string, boolean>;
  /** Feature -> whether the client only hides the UI (fine). */
  clientHidesOnly: Record<string, boolean>;
}

export function auditEntitlements(input: EntitlementAuditInput): ReadinessResult[] {
  return ENTITLEMENT_MATRIX.map((rule) => {
    if (!rule.serverAuthoritative) {
      return {
        id: `entitlement.${rule.feature}`,
        category: "GOVERNANCE",
        title: `Entitlement: ${rule.feature}`,
        status: "NOT_APPLICABLE" as const,
        severity: "info" as const,
      };
    }
    const enforced = input.serverEnforcement[rule.feature] === true;
    return {
      id: `entitlement.${rule.feature}`,
      category: "GOVERNANCE",
      title: `Entitlement: ${rule.feature}`,
      status: enforced ? "PASS" : "FAIL",
      severity: enforced ? "info" : "blocker",
      hardBlocker: !enforced,
      detail: enforced
        ? undefined
        : `${rule.feature} is not server-authoritative. Hidden menu ≠ authorization.`,
    } as ReadinessResult;
  });
}
