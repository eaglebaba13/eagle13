/**
 * Phase 25 — Compose a `ProductionReadinessReport` from audit inputs.
 * Pure — no I/O, no secrets. Callable from tests and the server collector.
 */
import type {
  DeploymentBlocker,
  DeploymentWarning,
  ProductionReadinessReport,
  ReadinessResult,
} from "./production-readiness-types";
import {
  READINESS_REPORT_GENERATOR,
  READINESS_REPORT_SCHEMA_VERSION,
} from "./production-readiness-types";
import { computeReadinessScore } from "./readiness-score";
import { computeVerdict } from "./readiness-verdict";
import { computeReadinessRunId, evidenceFingerprint } from "./readiness-run-id";

export interface ReadinessReportContext {
  environment: "development" | "staging" | "production" | "unknown";
  buildVersion: string | null;
  commitVersion: string | null;
  deploymentTarget: string | null;
  generatedAt: string;
  databaseSchemaVersion: string | null;
  providerStates: readonly string[];
  cacheNamespaceVersions: readonly string[];
}

export function composeReadinessReport(
  results: readonly ReadinessResult[],
  ctx: ReadinessReportContext,
): ProductionReadinessReport {
  const score = computeReadinessScore(results);
  const verdict = computeVerdict({
    environment: ctx.environment,
    score,
    results,
  });
  const blockers: DeploymentBlocker[] = results
    .filter((r) => r.hardBlocker)
    .map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      detail: r.detail ?? "Hard blocker.",
      remediation: r.remediation,
    }));
  const warnings: DeploymentWarning[] = results
    .filter((r) => r.status === "WARNING" && !r.hardBlocker)
    .map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      detail: r.detail ?? "Warning.",
    }));

  const runId = computeReadinessRunId({
    buildVersion: ctx.buildVersion,
    commitVersion: ctx.commitVersion,
    environment: ctx.environment,
    deploymentTarget: ctx.deploymentTarget,
    results,
    databaseSchemaVersion: ctx.databaseSchemaVersion,
    providerStates: ctx.providerStates,
    cacheNamespaceVersions: ctx.cacheNamespaceVersions,
  });

  const fingerprints: Record<string, string> = {};
  for (const r of results) {
    fingerprints[r.id] = evidenceFingerprint(r.id, r.status);
  }

  return {
    runId,
    generatedAt: ctx.generatedAt,
    environment: ctx.environment,
    buildVersion: ctx.buildVersion,
    deploymentTarget: ctx.deploymentTarget,
    results,
    blockers,
    warnings,
    score,
    verdict,
    meta: {
      schemaVersion: READINESS_REPORT_SCHEMA_VERSION,
      generator: READINESS_REPORT_GENERATOR,
      evidenceFingerprints: fingerprints,
    },
  };
}
