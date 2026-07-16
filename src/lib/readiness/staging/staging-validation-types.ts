/**
 * Phase 25 — Stage 2
 * Staging Validation — shared types.
 *
 * Deterministic and evidence-first. Never contains secret material.
 * Consumers MUST redact strings via `redactSecretLike` from Stage 1 types.
 */
import type { ReadinessCategory } from "../production-readiness-types";

export type StagingStatus =
  | "PASS"
  | "WARNING"
  | "FAIL"
  | "SKIPPED"
  | "BLOCKED"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export type StagingSeverity = "info" | "warning" | "critical" | "blocker";

export type StagingVerdict =
  | "STAGING_NOT_CONFIGURED"
  | "STAGING_BLOCKED"
  | "STAGING_FAILED"
  | "STAGING_PARTIAL"
  | "STAGING_VALIDATED"
  | "READY_FOR_LIMITED_PRODUCTION_REVIEW";

export interface StagingEvidence {
  key: string;
  value: string | number | boolean | null;
  note?: string;
}

export interface StagingCheck {
  id: string;
  category: ReadinessCategory | "JOURNEY" | "SMOKE" | "PERFORMANCE" | "LOAD" | "ACCESSIBILITY";
  title: string;
  status: StagingStatus;
  severity: StagingSeverity;
  detail?: string;
  remediation?: string;
  evidence?: readonly StagingEvidence[];
  hardBlocker?: boolean;
  /** Optional grouping label (e.g. journey id). */
  groupId?: string;
}

export interface StagingStep {
  id: string;
  title: string;
  status: StagingStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  httpStatus?: number;
  route?: string;
  role?: "anon" | "free" | "pro" | "professional" | "admin";
  error?: string;
  evidenceRef?: string;
}

export interface StagingJourney {
  id: string;
  title: string;
  role: "anon" | "free" | "pro" | "professional" | "admin";
  status: StagingStatus;
  steps: readonly StagingStep[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  failure?: StagingFailure;
}

export interface StagingFailure {
  stepId: string;
  message: string;
  category: "assertion" | "http" | "timeout" | "schema" | "auth" | "provider" | "unknown";
}

export interface PerformanceMeasurement {
  id: string;
  label: string;
  valueMs: number;
  warnMs: number;
  failMs: number;
  status: StagingStatus;
}

export type DrillOutcome =
  | "EXECUTED_PASS"
  | "EXECUTED_FAIL"
  | "DOCUMENTED_ONLY"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface RecoveryDrill {
  id: string;
  title: string;
  outcome: DrillOutcome;
  detail?: string;
  owner?: string;
  evidenceRef?: string;
}

export interface IncidentDrill {
  id: string;
  scenario: string;
  detectionMs: number | null;
  acknowledgmentMs: number | null;
  mitigation: string;
  recovery: string;
  owner: string;
  outcome: DrillOutcome;
  followUp?: string;
  evidenceRef?: string;
}

export interface StagingValidationReport {
  runId: string;
  generatedAt: string;
  stagingHost: string | null;
  environment: "development" | "staging" | "production" | "unknown";
  buildVersion: string | null;
  commitVersion: string | null;
  journeys: readonly StagingJourney[];
  checks: readonly StagingCheck[];
  performance: readonly PerformanceMeasurement[];
  recoveryDrills: readonly RecoveryDrill[];
  incidentDrills: readonly IncidentDrill[];
  blockers: readonly StagingCheck[];
  warnings: readonly StagingCheck[];
  verdict: StagingVerdict;
  score: {
    total: number;
    passCount: number;
    warnCount: number;
    failCount: number;
    hardBlockerCount: number;
  };
  meta: {
    schemaVersion: number;
    generator: string;
  };
}

export const STAGING_REPORT_SCHEMA_VERSION = 1;
export const STAGING_REPORT_GENERATOR = "STAGING_VALIDATION_V1";

export const HARD_BLOCKER_IDS: readonly string[] = [
  "authz.privilege_escalation",
  "secrets.exposure",
  "host.production_without_approval",
  "build.version_mismatch",
  "provider.core_unavailable_without_policy",
  "smoke.dashboard_failed",
  "auth.journey_failed",
  "rls.cross_user_read",
  "payment.activation_failed",
  "scheduler.duplicate",
  "shadow.open_candle_entry",
  "broker.execution_object_present",
  "release.no_rollback",
  "export.secret_leak",
];