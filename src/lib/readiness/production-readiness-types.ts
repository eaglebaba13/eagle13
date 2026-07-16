/**
 * Phase 25 — Stage 1
 * Production Readiness Center — shared types.
 *
 * Deterministic, evidence-first model. No secret values may appear in any
 * `ReadinessResult` or `ReadinessEvidence` — collectors must redact.
 */

export type ReadinessStatus =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "MISSING"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export type ReadinessSeverity = "info" | "warning" | "critical" | "blocker";

export type ReadinessCategory =
  | "SECURITY"
  | "DATA"
  | "DATABASE"
  | "PAYMENTS"
  | "PROVIDERS"
  | "OPERATIONS"
  | "OBSERVABILITY"
  | "RECOVERY"
  | "BUILD"
  | "GOVERNANCE";

export interface ReadinessEvidence {
  /** Short machine-readable identifier for the evidence datapoint. */
  key: string;
  /** Redacted value — MUST NOT contain secret material. */
  value: string | number | boolean | null;
  note?: string;
}

export interface ReadinessResult {
  id: string;
  category: ReadinessCategory;
  title: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  detail?: string;
  remediation?: string;
  evidence?: readonly ReadinessEvidence[];
  /** Optional owner tag (Team/Person). Never a user identifier or secret. */
  owner?: string;
  /** True when a `FAIL`/`MISSING` in this check blocks production. */
  hardBlocker?: boolean;
}

/** Alias — a check description is the same shape as its result at rest. */
export type ReadinessCheck = ReadinessResult;

export interface DeploymentBlocker {
  id: string;
  category: ReadinessCategory;
  title: string;
  detail: string;
  remediation?: string;
}

export interface DeploymentWarning {
  id: string;
  category: ReadinessCategory;
  title: string;
  detail: string;
}

export type ReadinessVerdict =
  | "DEPLOYMENT_BLOCKED"
  | "NOT_READY"
  | "READY_FOR_STAGING"
  | "STAGING_VALIDATION_REQUIRED"
  | "READY_FOR_LIMITED_PRODUCTION"
  | "PRODUCTION_REVIEW_REQUIRED";

export interface ReadinessScoreCategory {
  category: ReadinessCategory;
  score: number; // 0-100
  weight: number;
  passCount: number;
  warnCount: number;
  failCount: number;
}

export interface ReadinessScore {
  total: number; // 0-100
  categories: readonly ReadinessScoreCategory[];
  hardBlockerCount: number;
  overrideBlocked: boolean;
}

export interface ProductionReadinessReport {
  runId: string;
  generatedAt: string;
  environment: "development" | "staging" | "production" | "unknown";
  buildVersion: string | null;
  deploymentTarget: string | null;
  results: readonly ReadinessResult[];
  blockers: readonly DeploymentBlocker[];
  warnings: readonly DeploymentWarning[];
  score: ReadinessScore;
  verdict: ReadinessVerdict;
  meta: {
    schemaVersion: number;
    generator: string;
    /** Redacted — no secret material. */
    evidenceFingerprints: Record<string, string>;
  };
}

export const READINESS_REPORT_SCHEMA_VERSION = 1;
export const READINESS_REPORT_GENERATOR = "PRODUCTION_READINESS_V1";

/** Any string that looks even remotely like a secret — used for redaction. */
export const SECRET_LIKE_PATTERN =
  /(sk_(live|test)_[a-z0-9]+|sb_secret_[a-z0-9_-]+|eyJ[a-zA-Z0-9_-]{20,}|(?:[A-Za-z0-9+/]{40,}={0,2}))/gi;

export function redactSecretLike(value: string): string {
  if (!value) return value;
  return value.replace(SECRET_LIKE_PATTERN, "«redacted»");
}
