import { STAGING_REPORT_GENERATOR } from "./staging-validation-types";
import type { StagingCheck } from "./staging-validation-types";

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface StagingRunIdInput {
  stagingHost: string | null;
  buildVersion: string | null;
  commitVersion: string | null;
  environment: string;
  journeyIds: readonly string[];
  checkVersions: readonly string[];
  providerModes: readonly string[];
  databaseMigrationVersion: string | null;
  performanceBudgetHash: string;
  checks: readonly StagingCheck[];
}

export function computeStagingRunId(input: StagingRunIdInput): string {
  const fp = [
    input.stagingHost ?? "",
    input.buildVersion ?? "",
    input.commitVersion ?? "",
    input.environment,
    input.journeyIds.join(","),
    input.checkVersions.join(","),
    input.providerModes.join(","),
    input.databaseMigrationVersion ?? "",
    input.performanceBudgetHash,
    input.checks.map((c) => `${c.id}:${c.status}`).join("|"),
  ].join("§");
  return `${STAGING_REPORT_GENERATOR}:${fnv1a(fp)}`;
}