// Phase 31 · Security posture audit.
//
// Deterministic evaluator for security headers, CSP, rate limiting,
// session validation, webhook validation, and secrets audit.

export type SecurityCheckId =
  | "security-headers"
  | "content-security-policy"
  | "rate-limit"
  | "session-validation"
  | "webhook-validation"
  | "secrets-audit";

export type SecurityCheck = {
  id: SecurityCheckId;
  present: boolean;
  detail?: string;
};

export type SecuritySeverity = "PASS" | "WARN" | "FAIL";

export type SecurityAuditReport = {
  severity: SecuritySeverity;
  checks: Array<SecurityCheck & { severity: SecuritySeverity }>;
  missingCritical: SecurityCheckId[];
};

const CRITICAL: SecurityCheckId[] = [
  "security-headers",
  "content-security-policy",
  "session-validation",
  "webhook-validation",
  "secrets-audit",
];

export const REQUIRED_SECURITY_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "x-frame-options",
  "permissions-policy",
] as const;

export function evaluateSecurityHeaders(
  headers: Record<string, string | undefined>,
): SecurityCheck {
  const missing = REQUIRED_SECURITY_HEADERS.filter((h) => !headers[h]);
  return {
    id: "security-headers",
    present: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : "ok",
  };
}

export function evaluateCsp(csp: string | undefined): SecurityCheck {
  if (!csp) return { id: "content-security-policy", present: false, detail: "no CSP" };
  const ok = /default-src/.test(csp) && !/'unsafe-inline'/.test(csp);
  return {
    id: "content-security-policy",
    present: ok,
    detail: ok ? "ok" : "CSP too permissive",
  };
}

export function buildSecurityAudit(checks: SecurityCheck[]): SecurityAuditReport {
  const withSeverity = checks.map((c) => ({
    ...c,
    severity: (c.present ? "PASS" : CRITICAL.includes(c.id) ? "FAIL" : "WARN") as SecuritySeverity,
  }));
  const missingCritical = withSeverity
    .filter((c) => c.severity === "FAIL")
    .map((c) => c.id);
  const severity: SecuritySeverity = missingCritical.length
    ? "FAIL"
    : withSeverity.some((c) => c.severity === "WARN")
    ? "WARN"
    : "PASS";
  return { severity, checks: withSeverity, missingCritical };
}