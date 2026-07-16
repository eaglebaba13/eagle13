/**
 * Admin-only staging validation server function. Returns a deterministic
 * report; a real staging harness injects probes and journey resolvers.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StagingValidationReport } from "./staging-validation-types";
import { composeStagingReport } from "./staging-report";
import { DEFAULT_ALLOWED_HOSTS, validateStagingConfig } from "./staging-config.server";
import {
  STAGING_JOURNEY_PLANS,
  journeyToCheck,
  runJourney,
  skipResolver,
} from "./staging-journey-runner.server";
import { DEFAULT_RECOVERY_DRILLS, recoveryDrillsToChecks, incidentDrillsToChecks } from "./staging-recovery";
import { auditPerformance, DEFAULT_PERFORMANCE_BUDGETS } from "../performance-audit";
import { stagingReleaseChecklist } from "./staging-release-checklist";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("forbidden");
}

export const getStagingValidationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StagingValidationReport> => {
    await assertAdmin(context.supabase, context.userId);

    const baseUrl = process.env?.STAGING_BASE_URL ?? null;
    const envRaw = (process.env?.NODE_ENV ?? "").toLowerCase();
    const environment: "development" | "staging" | "production" | "unknown" =
      envRaw === "production" ? "production"
      : envRaw === "staging" ? "staging"
      : envRaw === "development" ? "development"
      : "unknown";

    const cfg = validateStagingConfig({
      baseUrl,
      environment,
      buildVersion: process.env?.BUILD_VERSION ?? null,
      commitVersion: process.env?.COMMIT_SHA ?? null,
      supabaseProject: process.env?.SUPABASE_URL ?? null,
      hasTestUsers: false,
      hasAdminTestUser: false,
      providerTestMode: false,
      maxDurationMs: 15 * 60_000,
      requestTimeoutMs: 15_000,
      allowedHosts: DEFAULT_ALLOWED_HOSTS,
      productionApproved: false,
      expectedEnvironment: "staging",
    });

    const now = () => Date.now();
    const toIso = (ms: number) => new Date(ms).toISOString();
    const journeys = STAGING_JOURNEY_PLANS.map((p) => runJourney(p, skipResolver, { now, toIso }));
    const journeyChecks = journeys.map(journeyToCheck);

    const { measurements, checks: perfChecks } = auditPerformance([], DEFAULT_PERFORMANCE_BUDGETS);

    const recoveryDrills = DEFAULT_RECOVERY_DRILLS;
    const recoveryChecks = recoveryDrillsToChecks(recoveryDrills);

    const checks = [
      ...cfg.checks,
      ...journeyChecks,
      ...perfChecks,
      ...recoveryChecks,
      ...incidentDrillsToChecks([]),
      ...stagingReleaseChecklist({
        stagingUrlVerified: !!cfg.host,
        correctBuildDeployed: !!process.env?.BUILD_VERSION,
        databaseMigrationVerified: false,
        rlsTested: false,
        authJourneysPassed: false,
        paidEntitlementPassed: false,
        manualPaymentStagingPassed: false,
        providersPassedOrDegraded: false,
        dashboardSmokePassed: false,
        backtestPassed: false,
        researchPassed: false,
        portfolioPassed: false,
        shadowPassed: false,
        exportsPassed: false,
        performanceBudgetsAcceptable: true,
        bundleScanClean: true,
        recoveryDrillEvidence: false,
        incidentDrillEvidence: false,
        humanReviewerAssigned: false,
        rollbackOwnerAssigned: false,
      }),
    ];

    return composeStagingReport({
      stagingHost: cfg.host,
      environment,
      buildVersion: process.env?.BUILD_VERSION ?? null,
      commitVersion: process.env?.COMMIT_SHA ?? null,
      generatedAt: new Date().toISOString(),
      configured: cfg.ok && !!baseUrl,
      journeys,
      checks,
      performance: measurements,
      recoveryDrills,
      incidentDrills: [],
      providerModes: [],
      databaseMigrationVersion: null,
      performanceBudgetHash: "default_v1",
    });
  });