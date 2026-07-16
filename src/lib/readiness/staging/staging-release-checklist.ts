import type { StagingCheck } from "./staging-validation-types";

export interface StagingReleaseChecklistInput {
  stagingUrlVerified: boolean;
  correctBuildDeployed: boolean;
  databaseMigrationVerified: boolean;
  rlsTested: boolean;
  authJourneysPassed: boolean;
  paidEntitlementPassed: boolean;
  manualPaymentStagingPassed: boolean;
  providersPassedOrDegraded: boolean;
  dashboardSmokePassed: boolean;
  backtestPassed: boolean;
  researchPassed: boolean;
  portfolioPassed: boolean;
  shadowPassed: boolean;
  exportsPassed: boolean;
  performanceBudgetsAcceptable: boolean;
  bundleScanClean: boolean;
  recoveryDrillEvidence: boolean;
  incidentDrillEvidence: boolean;
  humanReviewerAssigned: boolean;
  rollbackOwnerAssigned: boolean;
}

export function stagingReleaseChecklist(input: StagingReleaseChecklistInput): StagingCheck[] {
  const items: Array<[keyof StagingReleaseChecklistInput, string, boolean?]> = [
    ["stagingUrlVerified", "Staging URL verified"],
    ["correctBuildDeployed", "Correct build deployed"],
    ["databaseMigrationVerified", "Database migration verified"],
    ["rlsTested", "RLS tested"],
    ["authJourneysPassed", "Auth journeys passed"],
    ["paidEntitlementPassed", "Paid entitlement passed"],
    ["manualPaymentStagingPassed", "Manual payment staging passed"],
    ["providersPassedOrDegraded", "Providers passed/degraded explicitly"],
    ["dashboardSmokePassed", "Dashboard smoke passed"],
    ["backtestPassed", "Backtest passed"],
    ["researchPassed", "Research passed"],
    ["portfolioPassed", "Portfolio passed"],
    ["shadowPassed", "Shadow passed"],
    ["exportsPassed", "Exports passed"],
    ["performanceBudgetsAcceptable", "Performance budgets acceptable"],
    ["bundleScanClean", "Bundle scan clean"],
    ["recoveryDrillEvidence", "Recovery drill evidence"],
    ["incidentDrillEvidence", "Incident drill evidence"],
    ["humanReviewerAssigned", "Human reviewer assigned", true],
    ["rollbackOwnerAssigned", "Rollback owner assigned", true],
  ];
  return items.map(([k, label, isCritical]) => ({
    id: `release.${String(k)}`,
    category: "GOVERNANCE",
    title: label,
    status: input[k] ? "PASS" : "FAIL",
    severity: isCritical ? "critical" : input[k] ? "info" : "warning",
  }));
}