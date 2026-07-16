import type { ReadinessResult } from "./production-readiness-types";

export interface ErrorAuditInput {
  typedServerErrors: boolean;
  stackTracesToUsers: boolean;
  secretsInErrors: boolean;
  providerErrorsNormalized: boolean;
  errorBoundariesInstalled: boolean;
  routeLevelFallbacks: boolean;
}

function pos(id: string, title: string, ok: boolean, blocker = false): ReadinessResult {
  return {
    id,
    category: "OPERATIONS",
    title,
    status: ok ? "PASS" : "FAIL",
    severity: ok ? "info" : blocker ? "blocker" : "critical",
    hardBlocker: !ok && blocker,
  };
}
function neg(id: string, title: string, hasBadState: boolean, blocker = false): ReadinessResult {
  return {
    id,
    category: "OPERATIONS",
    title,
    status: hasBadState ? "FAIL" : "PASS",
    severity: hasBadState ? (blocker ? "blocker" : "critical") : "info",
    hardBlocker: hasBadState && blocker,
  };
}

export function auditErrors(i: ErrorAuditInput): ReadinessResult[] {
  return [
    pos("err.typed-server", "Typed server errors", i.typedServerErrors),
    neg("err.stack-traces", "No stack traces to users", i.stackTracesToUsers, true),
    neg("err.secrets-in-errors", "No secrets in error messages", i.secretsInErrors, true),
    pos("err.provider-normalized", "Provider errors normalized", i.providerErrorsNormalized),
    pos("err.boundaries", "Error boundaries installed", i.errorBoundariesInstalled),
    pos("err.route-fallbacks", "Route-level fallbacks", i.routeLevelFallbacks),
  ];
}
