import { describe, it, expect } from "vitest";
import { validateStagingConfig, DEFAULT_ALLOWED_HOSTS } from "./staging-config.server";
import { runJourney, journeyToCheck, STAGING_JOURNEY_PLANS, skipResolver } from "./staging-journey-runner.server";
import { auditProviderDrills, auditFailoverDrill } from "./staging-provider-drills";
import { auditAuthorization, auditRlsCrossUser } from "./staging-authorization";
import { auditManualPaymentJourney } from "./staging-payment-journey";
import { auditCacheStress } from "./staging-cache-stress";
import { auditSchedulerStress } from "./staging-scheduler-stress";
import { auditShadowDrill } from "./staging-shadow-drill";
import { auditExportSamples } from "./staging-export-validation";
import { auditPerformance } from "../performance-audit";
import { auditBundle } from "./staging-bundle-audit";
import { auditLoad } from "./staging-load";
import { recoveryDrillsToChecks, incidentDrillsToChecks, DEFAULT_RECOVERY_DRILLS } from "./staging-recovery";
import { auditAccessibility } from "./staging-accessibility";
import { computeStagingVerdict } from "./staging-verdict";
import { computeStagingRunId } from "./staging-run-id";
import { composeStagingReport } from "./staging-report";
import { createInMemoryEvidenceStore } from "./staging-evidence-store";
import { stagingReleaseChecklist } from "./staging-release-checklist";
import { stagingSummaryCsv, journeyResultsCsv, fullStagingReportJson } from "./staging-exports";

const baseCfg = {
  environment: "staging",
  buildVersion: "b1",
  commitVersion: "c1",
  supabaseProject: "https://x.supabase.co",
  hasTestUsers: true,
  hasAdminTestUser: true,
  providerTestMode: true,
  maxDurationMs: 60_000,
  requestTimeoutMs: 5_000,
  allowedHosts: DEFAULT_ALLOWED_HOSTS,
  productionApproved: false,
};

describe("staging-config", () => {
  it("rejects localhost as staging host", () => {
    const r = validateStagingConfig({ ...baseCfg, baseUrl: "http://localhost:3000" });
    expect(r.ok).toBe(false);
    expect(r.checks.some((c) => c.id === "config.localhost_rejected" && c.hardBlocker)).toBe(true);
  });
  it("rejects missing base URL", () => {
    const r = validateStagingConfig({ ...baseCfg, baseUrl: null });
    expect(r.ok).toBe(false);
    expect(r.checks[0].id).toBe("config.base_url_missing");
  });
  it("flags production host without approval", () => {
    const r = validateStagingConfig({
      ...baseCfg,
      baseUrl: "https://eaglebaba.com",
      allowedHosts: ["eaglebaba.com"],
    });
    expect(r.checks.some((c) => c.id === "host.production_without_approval")).toBe(true);
  });
  it("flags build mismatch as hard blocker", () => {
    const r = validateStagingConfig({
      ...baseCfg,
      baseUrl: "https://staging.lovable.app",
      expectedBuildVersion: "b2",
    });
    expect(r.checks.some((c) => c.id === "build.version_mismatch" && c.hardBlocker)).toBe(true);
  });
  it("flags environment mismatch", () => {
    const r = validateStagingConfig({
      ...baseCfg,
      baseUrl: "https://staging.lovable.app",
      environment: "production",
      expectedEnvironment: "staging",
    });
    expect(r.checks.some((c) => c.id === "config.env_mismatch")).toBe(true);
  });
  it("passes with a valid staging host", () => {
    const r = validateStagingConfig({ ...baseCfg, baseUrl: "https://staging.lovable.app" });
    expect(r.host).toBe("staging.lovable.app");
    expect(r.checks.every((c) => c.status !== "FAIL")).toBe(true);
  });
});

describe("journey runner", () => {
  const now = () => 0;
  const toIso = (ms: number) => new Date(ms).toISOString();
  it("skip resolver marks every step SKIPPED", () => {
    const j = runJourney(STAGING_JOURNEY_PLANS[0], skipResolver, { now, toIso });
    expect(j.status).toBe("SKIPPED");
  });
  it("planned journeys cover all required roles", () => {
    const roles = new Set(STAGING_JOURNEY_PLANS.map((p) => p.role));
    for (const r of ["anon", "free", "pro", "professional", "admin"]) expect(roles.has(r as any)).toBe(true);
  });
  it("failure isolates the journey (stops on first FAIL)", () => {
    const j = runJourney(
      { id: "t", title: "t", role: "pro", steps: [{ id: "s1", title: "s1" }, { id: "s2", title: "s2" }] },
      (plan) => plan.id === "s1"
        ? { status: "FAIL", durationMs: 1, error: "boom", failureCategory: "assertion" }
        : { status: "PASS", durationMs: 1 },
      { now, toIso },
    );
    expect(j.steps).toHaveLength(1);
    expect(j.status).toBe("FAIL");
    expect(j.failure?.stepId).toBe("s1");
  });
  it("admin journey failure is a hard blocker", () => {
    const plan = STAGING_JOURNEY_PLANS.find((p) => p.role === "admin")!;
    const j = runJourney(plan, () => ({ status: "FAIL", durationMs: 0, error: "x" }), { now, toIso });
    expect(journeyToCheck(j).hardBlocker).toBe(true);
  });
});

describe("provider drills", () => {
  const base = {
    providerId: "primary",
    mode: "http_500" as const,
    dashboardUsable: true,
    typedErrorShown: true,
    freshnessDegraded: true,
    actionableBlocked: true,
    fabricatedFallback: false,
    retriesObserved: 1,
    retryBudget: 3,
    failoverDisclosedIfActive: true,
    requestStorm: false,
  };
  it("passes when all invariants hold", () => {
    expect(auditProviderDrills([base])[0].status).toBe("PASS");
  });
  it("hard-fails on fabricated fallback", () => {
    expect(auditProviderDrills([{ ...base, fabricatedFallback: true }])[0].hardBlocker).toBe(true);
  });
  it("hard-fails on request storm", () => {
    expect(auditProviderDrills([{ ...base, requestStorm: true }])[0].hardBlocker).toBe(true);
  });
  it("no-fallback with silent switch is blocker", () => {
    const r = auditFailoverDrill([{
      dependencyId: "options",
      fallbackAllowed: false,
      primaryForcedFail: true,
      secondaryEligible: true,
      schemaCompatible: true,
      timestampDivergenceSeconds: 0,
      unitNormalized: true,
      providerLabelChanged: false,
      statusDegraded: false,
      actionableSignalPolicyRespected: true,
    }]);
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("authorization + RLS", () => {
  it("privilege escalation raises hard blocker", () => {
    const r = auditAuthorization([{ id: "userA_reads_userB.profile", denied: false, expectDeny: true }]);
    expect(r.some((c) => c.id === "authz.privilege_escalation" && c.hardBlocker)).toBe(true);
  });
  it("rls cross-user read is a blocker", () => {
    const r = auditRlsCrossUser([{ table: "profiles", otherUsersRowsReturned: 1 }]);
    expect(r[0].id).toBe("rls.cross_user_read");
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("manual payment", () => {
  const okObs = {
    requestCreated: true, serverSidePriceValidated: true, planCycleValidated: true,
    screenshotMetadataValidated: true, utrFormatValidated: true, duplicateUtrRejected: true,
    duplicatePendingRejected: true, adminOnlyApproval: true, rejectionReasonRequired: true,
    subscriptionActivatedAtomically: true, auditLogEntryPresent: true, labeledAsStaging: true,
    realPaymentTriggered: false,
  };
  it("passes when everything is set", () => {
    expect(auditManualPaymentJourney(okObs)[0].status).toBe("PASS");
  });
  it("real payment triggers hard blocker", () => {
    expect(auditManualPaymentJourney({ ...okObs, realPaymentTriggered: true })[0].hardBlocker).toBe(true);
  });
  it("non-atomic activation is a hard blocker", () => {
    expect(auditManualPaymentJourney({ ...okObs, subscriptionActivatedAtomically: false })[0].hardBlocker).toBe(true);
  });
  it("duplicate UTR must be rejected", () => {
    expect(auditManualPaymentJourney({ ...okObs, duplicateUtrRejected: false })[0].status).toBe("FAIL");
  });
});

describe("cache/scheduler/shadow drills", () => {
  it("cache formula isolation failure fails", () => {
    const r = auditCacheStress([{
      namespace: "astro", hits: 10, misses: 1, staleHits: 0, refreshCount: 1,
      errors: 0, dedupedRequests: 5, durationMs: 10, memoryDeltaBytes: 0,
      formulaVersionIsolated: false, runIdIsolated: true, ttlExpiryObserved: true,
      refreshDuringProviderFailure: "graceful",
    }]);
    expect(r[0].status).toBe("FAIL");
  });
  it("scheduler duplicate is a hard blocker", () => {
    const r = auditSchedulerStress({
      schedulerInstances: 2, duplicatedTasks: [], overlappingBeyondPolicy: [],
      tightLoopDetected: false, fasterThanTimeframeRule: false, errorIsolated: true,
      pauseResumeOk: true, memoryStable: true, eventLoopStalledMs: 0,
    });
    expect(r.find((c) => c.id === "scheduler.duplicate")?.hardBlocker).toBe(true);
  });
  it("shadow open candle is a hard blocker; broker object is a hard blocker", () => {
    const r = auditShadowDrill({
      closedCandleOnly: false, duplicateRejected: true, staleRejected: true,
      readinessGateEnforced: true, recommendationEvidencePresent: true, hypotheticalEntryOnly: true,
      outcomeUpdated: true, calibrationUpdated: true, driftUpdated: true, persisted: true, exported: true,
      brokerOrderObjectPresent: true, liveNotificationTriggered: false,
    });
    expect(r.some((c) => c.id === "shadow.open_candle_entry" && c.hardBlocker)).toBe(true);
    expect(r.some((c) => c.id === "broker.execution_object_present" && c.hardBlocker)).toBe(true);
  });
});

describe("exports and bundle", () => {
  it("detects secret leak in export samples", () => {
    const r = auditExportSamples([{
      id: "x", family: "backtest", filename: "b.csv", mimeType: "text/csv",
      contentSample: "sk_live_abcdef1234567890abcdef1234567890",
      contentBytes: 10, runId: "r1", formulaVersions: ["v1"],
      providerMetadataPresent: true, disclaimerPresent: true, parseable: true,
    }]);
    expect(r[0].hardBlocker).toBe(true);
    expect(r[0].id).toBe("export.secret_leak");
  });
  it("bundle secret pattern is a hard blocker", () => {
    const r = auditBundle({
      mainBundleKb: 500, routeChunksKb: {}, largestModulesKb: {}, duplicateDeps: [],
      chartLibCount: 1, fixtureInclusion: [], sourceMapPolicy: "off_in_prod",
      mediaAssets: [], nativeBinaries: [], serverOnlyModulesInClient: [],
      clientBundleSample: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefghijk",
    });
    expect(r.some((c) => c.hardBlocker)).toBe(true);
  });
  it("server-only module leak is a hard blocker", () => {
    const r = auditBundle({
      mainBundleKb: 500, routeChunksKb: {}, largestModulesKb: {}, duplicateDeps: [],
      chartLibCount: 1, fixtureInclusion: [], sourceMapPolicy: "off_in_prod",
      mediaAssets: [], nativeBinaries: [], serverOnlyModulesInClient: ["client.server.ts"],
      clientBundleSample: "safe content",
    });
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("performance and load", () => {
  it("performance budget warn/fail", () => {
    const { checks } = auditPerformance([
      { id: "server.response", valueMs: 200 },
      { id: "server.response", valueMs: 500 },
      { id: "server.response", valueMs: 2000 },
    ]);
    expect(checks[0].status).toBe("PASS");
    expect(checks[1].status).toBe("WARNING");
    expect(checks[2].status).toBe("FAIL");
  });
  it("load unsafe concurrency is BLOCKED", () => {
    const r = auditLoad([{
      id: "s", label: "s", errorRate: 0, p50Ms: 10, p95Ms: 20,
      duplicateRequestRatio: 0, cacheHitRate: 1, timeoutRate: 0,
      memoryDeltaBytes: 0, concurrency: 100,
    }]);
    expect(r[0].status).toBe("BLOCKED");
  });
});

describe("recovery / a11y / verdict / run id", () => {
  it("no rollback becomes a hard blocker", () => {
    const r = recoveryDrillsToChecks(DEFAULT_RECOVERY_DRILLS);
    expect(r.some((c) => c.id === "release.no_rollback" && c.hardBlocker)).toBe(true);
  });
  it("incident drills round-trip", () => {
    const r = incidentDrillsToChecks([{
      id: "stale_market", scenario: "Stale market data displayed",
      detectionMs: 30, acknowledgmentMs: 60,
      mitigation: "block", recovery: "provider back", owner: "ops",
      outcome: "DOCUMENTED_ONLY",
    }]);
    expect(r[0].status).toBe("WARNING");
  });
  it("a11y mobile overflow fails", () => {
    const r = auditAccessibility({
      keyboardNav: true, visibleFocus: true, focusTrap: true, accessibleLabels: true,
      tableScrolling: true, contrast: true, statusNotColorOnly: true,
      desktopOverflow: false, tabletOverflow: false, mobileOverflow: true,
      clippedControls: false, hydrationMismatch: false,
    });
    expect(r.find((c) => c.id === "a11y.mobile_overflow")?.status).toBe("FAIL");
  });
  it("verdict states cover every enum member", () => {
    const v0 = computeStagingVerdict({ configured: false, checks: [] });
    expect(v0.verdict).toBe("STAGING_NOT_CONFIGURED");
    const vB = computeStagingVerdict({
      configured: true,
      checks: [{ id: "x", category: "SECURITY", title: "x", status: "FAIL", severity: "blocker", hardBlocker: true }],
    });
    expect(vB.verdict).toBe("STAGING_BLOCKED");
    const vF = computeStagingVerdict({
      configured: true,
      checks: [{ id: "x", category: "SECURITY", title: "x", status: "FAIL", severity: "critical" }],
    });
    expect(vF.verdict).toBe("STAGING_FAILED");
    const vP = computeStagingVerdict({
      configured: true,
      checks: [
        { id: "a", category: "SECURITY", title: "a", status: "WARNING", severity: "warning" },
        { id: "b", category: "SECURITY", title: "b", status: "PASS", severity: "info" },
      ],
    });
    expect(vP.verdict === "STAGING_PARTIAL" || vP.verdict === "STAGING_VALIDATED").toBe(true);
    const vAll = computeStagingVerdict({
      configured: true,
      checks: [{ id: "a", category: "SECURITY", title: "a", status: "PASS", severity: "info" }],
    });
    expect(vAll.verdict).toBe("READY_FOR_LIMITED_PRODUCTION_REVIEW");
  });
  it("hard blocker cannot be overridden by score", () => {
    const v = computeStagingVerdict({
      configured: true,
      checks: [
        { id: "a", category: "SECURITY", title: "a", status: "PASS", severity: "info" },
        { id: "b", category: "SECURITY", title: "b", status: "FAIL", severity: "blocker", hardBlocker: true },
      ],
    });
    expect(v.verdict).toBe("STAGING_BLOCKED");
  });
  it("run id is deterministic and changes with inputs", () => {
    const base = {
      stagingHost: "h", buildVersion: "b", commitVersion: "c", environment: "staging",
      journeyIds: ["a"], checkVersions: ["v1"], providerModes: [],
      databaseMigrationVersion: null, performanceBudgetHash: "h",
      checks: [{ id: "x", category: "SECURITY" as const, title: "x", status: "PASS" as const, severity: "info" as const }],
    };
    expect(computeStagingRunId(base)).toBe(computeStagingRunId(base));
    expect(computeStagingRunId(base)).not.toBe(computeStagingRunId({ ...base, buildVersion: "b2" }));
  });
});

describe("compose + exports + evidence store", () => {
  it("compose report roundtrips exports parseable", () => {
    const now = () => 0;
    const toIso = (ms: number) => new Date(ms).toISOString();
    const journeys = STAGING_JOURNEY_PLANS.map((p) => runJourney(p, skipResolver, { now, toIso }));
    const report = composeStagingReport({
      stagingHost: "staging.lovable.app",
      environment: "staging",
      buildVersion: "b1",
      commitVersion: "c1",
      generatedAt: new Date(0).toISOString(),
      configured: true,
      journeys,
      checks: journeys.map(journeyToCheck),
      performance: [],
      recoveryDrills: DEFAULT_RECOVERY_DRILLS,
      incidentDrills: [],
      providerModes: [],
      databaseMigrationVersion: null,
      performanceBudgetHash: "h",
    });
    // deterministic run id
    expect(report.runId).toMatch(/^STAGING_VALIDATION_V1:/);
    // exports do not throw and CSV includes header
    expect(stagingSummaryCsv(report).split("\n")[0]).toContain("id,category,title");
    expect(journeyResultsCsv(report).split("\n")[0]).toContain("journeyId");
    expect(() => JSON.parse(fullStagingReportJson(report))).not.toThrow();
  });
  it("evidence store redacts secret-like strings and forbidden keys", () => {
    const store = createInMemoryEvidenceStore(60_000);
    const rec = store.put({
      checkId: "t",
      buildVersion: null,
      commitVersion: null,
      payload: {
        token: "should-be-dropped",
        password: "should-be-dropped",
        note: "sk_live_abcdef1234567890abcdef1234567890",
      },
    });
    const payload = rec.payload as Record<string, unknown>;
    expect(payload.token).toBeUndefined();
    expect(payload.password).toBeUndefined();
    expect(String(payload.note)).toContain("«redacted»");
  });
  it("release checklist marks missing items as FAIL", () => {
    const items = stagingReleaseChecklist({
      stagingUrlVerified: true, correctBuildDeployed: true, databaseMigrationVerified: true,
      rlsTested: true, authJourneysPassed: true, paidEntitlementPassed: true,
      manualPaymentStagingPassed: true, providersPassedOrDegraded: true,
      dashboardSmokePassed: true, backtestPassed: true, researchPassed: true,
      portfolioPassed: true, shadowPassed: true, exportsPassed: true,
      performanceBudgetsAcceptable: true, bundleScanClean: true,
      recoveryDrillEvidence: true, incidentDrillEvidence: true,
      humanReviewerAssigned: false, rollbackOwnerAssigned: false,
    });
    const rollback = items.find((c) => c.id === "release.rollbackOwnerAssigned");
    expect(rollback?.status).toBe("FAIL");
    expect(rollback?.severity).toBe("critical");
  });
});