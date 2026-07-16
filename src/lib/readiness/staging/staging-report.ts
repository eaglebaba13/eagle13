import type {
  StagingCheck,
  StagingJourney,
  StagingValidationReport,
  PerformanceMeasurement,
  RecoveryDrill,
  IncidentDrill,
} from "./staging-validation-types";
import {
  STAGING_REPORT_SCHEMA_VERSION,
  STAGING_REPORT_GENERATOR,
} from "./staging-validation-types";
import { computeStagingVerdict } from "./staging-verdict";
import { computeStagingRunId } from "./staging-run-id";

export interface ComposeStagingInput {
  stagingHost: string | null;
  environment: "development" | "staging" | "production" | "unknown";
  buildVersion: string | null;
  commitVersion: string | null;
  generatedAt: string;
  configured: boolean;
  journeys: readonly StagingJourney[];
  checks: readonly StagingCheck[];
  performance: readonly PerformanceMeasurement[];
  recoveryDrills: readonly RecoveryDrill[];
  incidentDrills: readonly IncidentDrill[];
  providerModes: readonly string[];
  databaseMigrationVersion: string | null;
  performanceBudgetHash: string;
}

export function composeStagingReport(input: ComposeStagingInput): StagingValidationReport {
  const { verdict, score } = computeStagingVerdict({
    configured: input.configured,
    checks: input.checks,
  });
  const blockers = input.checks.filter((c) => c.hardBlocker);
  const warnings = input.checks.filter((c) => c.status === "WARNING" && !c.hardBlocker);
  const runId = computeStagingRunId({
    stagingHost: input.stagingHost,
    buildVersion: input.buildVersion,
    commitVersion: input.commitVersion,
    environment: input.environment,
    journeyIds: input.journeys.map((j) => j.id),
    checkVersions: input.checks.map((c) => c.id),
    providerModes: input.providerModes,
    databaseMigrationVersion: input.databaseMigrationVersion,
    performanceBudgetHash: input.performanceBudgetHash,
    checks: input.checks,
  });
  return {
    runId,
    generatedAt: input.generatedAt,
    stagingHost: input.stagingHost,
    environment: input.environment,
    buildVersion: input.buildVersion,
    commitVersion: input.commitVersion,
    journeys: input.journeys,
    checks: input.checks,
    performance: input.performance,
    recoveryDrills: input.recoveryDrills,
    incidentDrills: input.incidentDrills,
    blockers,
    warnings,
    verdict,
    score,
    meta: {
      schemaVersion: STAGING_REPORT_SCHEMA_VERSION,
      generator: STAGING_REPORT_GENERATOR,
    },
  };
}