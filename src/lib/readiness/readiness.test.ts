import { describe, it, expect } from "vitest";
import {
  auditEnvironment,
  isPlaceholderValue,
  type EnvPresence,
} from "./environment-audit";
import { auditSecrets } from "./secret-audit";
import { auditDatabase, EXPECTED_TABLES } from "./database-audit";
import { auditRls } from "./rls-audit";
import { auditAuth } from "./auth-audit";
import { auditEntitlements } from "./entitlement-audit";
import { auditPaymentReadiness } from "./payment-readiness";
import { auditProviders } from "./provider-readiness";
import { auditFailover } from "./failover-policy";
import { auditCache } from "./cache-audit";
import { auditScheduler } from "./scheduler-audit";
import { auditStorage } from "./storage-audit";
import { auditAuditLog } from "./audit-log-audit";
import { auditObservability } from "./observability";
import { auditErrors } from "./error-audit";
import { auditBuild } from "./build-audit";
import { auditRoutes } from "./route-audit";
import { auditBackups } from "./backup-audit";
import { releaseChecklist } from "./release-checklist";
import { computeReadinessScore } from "./readiness-score";
import { computeVerdict } from "./readiness-verdict";
import { computeReadinessRunId } from "./readiness-run-id";
import { composeReadinessReport } from "./readiness-report";
import {
  readinessSummaryCsv,
  hardBlockersCsv,
  fullReadinessJson,
  deploymentEvidenceBundle,
} from "./readiness-exports";
import { redactSecretLike } from "./production-readiness-types";

const baseCtx = {
  environment: "production" as const,
  buildVersion: "1.0.0",
  commitVersion: "abc123",
  deploymentTarget: "cf-workers",
  generatedAt: "2026-07-16T00:00:00Z",
  databaseSchemaVersion: "20260716",
  providerStates: ["primary_market_data:HEALTHY"],
  cacheNamespaceVersions: ["astro:v1"],
};

describe("environment audit", () => {
  it("blocks on missing critical env in production", () => {
    const vars: EnvPresence[] = [
      { name: "SUPABASE_URL", status: "MISSING", category: "core", required: true },
    ];
    const r = auditEnvironment({ environment: "production", appUrl: "https://x.com", vars, paidPlansEnabled: false });
    expect(r.find((x) => x.id === "env.SUPABASE_URL")!.hardBlocker).toBe(true);
  });
  it("detects placeholder values", () => {
    expect(isPlaceholderValue("changeme")).toBe(true);
    expect(isPlaceholderValue("your-key-here")).toBe(true);
    expect(isPlaceholderValue("sk_live_abc123")).toBe(false);
  });
  it("blocks paid plans when payment env missing", () => {
    const vars: EnvPresence[] = [
      { name: "MANUAL_UPI_ID", status: "MISSING", category: "payments", required: true },
    ];
    const r = auditEnvironment({ environment: "production", appUrl: "https://x.com", vars, paidPlansEnabled: true });
    expect(r.find((x) => x.id === "env.payments.aggregate")!.hardBlocker).toBe(true);
  });
  it("flags insecure production URL", () => {
    const r = auditEnvironment({
      environment: "production",
      appUrl: "http://localhost:3000",
      vars: [],
      paidPlansEnabled: false,
    });
    expect(r[0].status).toBe("FAIL");
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("secret audit", () => {
  it("blocks on client bundle leak", () => {
    const r = auditSecrets({
      clientServerLeaks: ["src/routes/foo.tsx"],
      serviceRoleClientRefs: [],
      envInSource: [],
      signedUrlTtlsSeconds: [600],
      suspectLogSites: [],
      environment: "production",
    });
    const c = r.find((x) => x.id === "secret.client-bundle-leak")!;
    expect(c.hardBlocker).toBe(true);
  });
  it("blocks on .env in source", () => {
    const r = auditSecrets({
      clientServerLeaks: [],
      serviceRoleClientRefs: [],
      envInSource: [".env"],
      signedUrlTtlsSeconds: [600],
      suspectLogSites: [],
      environment: "production",
    });
    expect(r.find((x) => x.id === "secret.env-in-source")!.hardBlocker).toBe(true);
  });
  it("warns on unbounded signed URL TTL", () => {
    const r = auditSecrets({
      clientServerLeaks: [],
      serviceRoleClientRefs: [],
      envInSource: [],
      signedUrlTtlsSeconds: [86400],
      suspectLogSites: [],
      environment: "production",
    });
    expect(r.find((x) => x.id === "secret.signed-url-ttl")!.status).toBe("WARNING");
  });
  it("redacts secret-like strings", () => {
    expect(redactSecretLike("token=sk_live_abcd1234efgh")).toContain("«redacted»");
  });
});

describe("database audit", () => {
  it("blocks on missing table", () => {
    const r = auditDatabase({ tables: [], migrationsApplied: 10 });
    expect(r.find((x) => x.id === "db.table.profiles")!.hardBlocker).toBe(true);
  });
  it("passes when all expected tables present", () => {
    const tables = EXPECTED_TABLES.map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable ?? true })),
      indexes: t.requiredIndexes ?? [],
    }));
    const r = auditDatabase({ tables, migrationsApplied: 20 });
    expect(r.every((x) => x.status === "PASS")).toBe(true);
  });
});

describe("rls audit", () => {
  it("blocks when RLS not enabled on user data", () => {
    const r = auditRls({
      policies: [],
      functions: [],
      rlsEnabledTables: [],
      userDataTables: ["manual_payment_requests"],
    });
    expect(r[0].hardBlocker).toBe(true);
  });
  it("blocks unsafe SECURITY DEFINER without search_path", () => {
    const r = auditRls({
      policies: [],
      functions: [{ name: "bad_fn", securityDefiner: true, searchPathSet: false, callableByAnon: false }],
      rlsEnabledTables: [],
      userDataTables: [],
    });
    expect(r.find((x) => x.id === "rls.fn.bad_fn.search-path")!.hardBlocker).toBe(true);
  });
});

describe("auth audit", () => {
  it("blocks on unguarded admin route", () => {
    const r = auditAuth({
      environment: "production",
      routes: [{ path: "/admin", access: "admin", guardKind: "public", serverAuthorized: false }],
      diagnosticsOverrideEnabled: false,
      logoutInvalidatesQueries: true,
      sessionExpiryMinutes: 60,
    });
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("entitlements audit", () => {
  it("blocks when a server-authoritative feature is not enforced", () => {
    const r = auditEntitlements({
      serverEnforcement: { backtest: false },
      clientHidesOnly: {},
    });
    const b = r.find((x) => x.id === "entitlement.backtest")!;
    expect(b.hardBlocker).toBe(true);
  });
});

describe("payment readiness", () => {
  it("skips when paid plans disabled", () => {
    const r = auditPaymentReadiness({
      paidPlansEnabled: false,
    } as any);
    expect(r[0].status).toBe("NOT_APPLICABLE");
  });
});

describe("providers", () => {
  it("blocks on required unavailable provider without fallback", () => {
    const r = auditProviders({
      probes: [
        {
          id: "p",
          label: "P",
          status: "UNAVAILABLE",
          fallbackAllowed: false,
          fallbackActive: false,
          required: true,
        },
      ],
    });
    expect(r[0].hardBlocker).toBe(true);
  });
  it("warns on DEGRADED", () => {
    const r = auditProviders({
      probes: [
        { id: "p", label: "P", status: "DEGRADED", fallbackAllowed: true, fallbackActive: true, required: true },
      ],
    });
    expect(r[0].status).toBe("WARNING");
  });
});

describe("failover", () => {
  it("blocks fallback on forbidden dependency", () => {
    const r = auditFailover({
      activeFallbacks: [{ dependency: "astro.reference", disclosed: true, actionableAllowed: false }],
    });
    expect(r[0].hardBlocker).toBe(true);
  });
  it("blocks undisclosed fallback", () => {
    const r = auditFailover({
      activeFallbacks: [{ dependency: "quote.nifty", disclosed: false, actionableAllowed: false }],
    });
    expect(r[0].hardBlocker).toBe(true);
  });
});

describe("cache/scheduler/storage/audit-log", () => {
  it("cache: flags missing required namespace", () => {
    const r = auditCache({ namespaces: [], requiredNamespaces: ["astro"] });
    expect(r[0].status).toBe("MISSING");
  });
  it("scheduler: blocks on duplicate instances", () => {
    const r = auditScheduler({ schedulerInstances: 2, shadowSchedulerRunning: false, tasks: [], pageHidden: false });
    expect(r[0].hardBlocker).toBe(true);
  });
  it("storage: blocks when private bucket is public", () => {
    const r = auditStorage({
      buckets: [
        {
          name: "payment-proofs",
          isPublic: true,
          expectedPublic: false,
          maxFileSizeBytes: 1,
          allowedMimeTypes: [],
          userFolderIsolation: true,
          signedUrlDefaultTtlSeconds: 600,
          retentionDays: null,
        },
      ],
    });
    expect(r[0].hardBlocker).toBe(true);
  });
  it("audit-log: blocks when secrets appear in samples", () => {
    const r = auditAuditLog({ observedEvents: [], logsSecretsSample: ["found"], logsFullProofUrlsSample: [] });
    expect(r.find((x) => x.id === "audit.no-secrets")!.hardBlocker).toBe(true);
  });
});

describe("build audit", () => {
  it("blocks on failed build", () => {
    const r = auditBuild({
      buildSucceeded: false,
      bundleServerOnlyLeaks: 0,
      bundleSecretsFound: 0,
      devRoutesInProduction: 0,
      largeBundleAssetsKb: 0,
      brokerCodeActive: false,
    });
    expect(r.find((x) => x.id === "build.success")!.hardBlocker).toBe(true);
  });
  it("blocks on broker activation", () => {
    const r = auditBuild({
      buildSucceeded: true,
      bundleServerOnlyLeaks: 0,
      bundleSecretsFound: 0,
      devRoutesInProduction: 0,
      largeBundleAssetsKb: 0,
      brokerCodeActive: true,
    });
    expect(r.find((x) => x.id === "build.broker-inactive")!.hardBlocker).toBe(true);
  });
});

describe("routes/backup/release/observability/error", () => {
  it("routes: blocks unguarded admin route", () => {
    const r = auditRoutes([{ path: "/admin", access: "admin", guardKind: "public", serverAuthorized: false }]);
    expect(r[0].hardBlocker).toBe(true);
  });
  it("backup: UNKNOWN db backup is a blocker in production", () => {
    const r = auditBackups({
      databaseBackup: "UNKNOWN",
      pointInTimeRecovery: "UNKNOWN",
      storageBackup: "UNKNOWN",
      migrationRollback: "UNKNOWN",
      auditLogRetentionDays: null,
      disasterRecoveryOwner: null,
      lastRestoreTestAt: null,
      environment: "production",
    });
    expect(r.find((x) => x.id === "recovery.db-backup")!.hardBlocker).toBe(true);
  });
  it("release checklist has an entry per input", () => {
    const r = releaseChecklist({
      testsPassing: true,
      typecheckPassing: true,
      lintPassing: true,
      productionBuildPassing: true,
      environmentComplete: true,
      migrationsApplied: true,
      rlsAuditPassing: true,
      adminRoleAssigned: true,
      paymentConfigured: true,
      providersHealthy: true,
      cacheHealthy: true,
      schedulerHealthy: true,
      backupsVerified: true,
      incidentContactConfigured: true,
      privacyTermsLinksConfigured: true,
      supportContactConfigured: true,
      versionTagRecorded: true,
      rollbackPlanDocumented: true,
    });
    expect(r.every((x) => x.status === "PASS")).toBe(true);
    expect(r.length).toBeGreaterThanOrEqual(18);
  });
  it("observability rolls green/yellow/red into statuses", () => {
    const r = auditObservability({
      api: "red",
      providers: "yellow",
      cache: "green",
      scheduler: "green",
      database: "green",
      storage: "green",
      auth: "green",
      payment: "green",
      dashboardFreshness: "green",
      shadowReadiness: "green",
      decisionCenter: "green",
      memory: "green",
      errorRate: 0.001,
      slowRequestRate: 0.01,
      buildVersion: "1",
      deploymentVersion: "1",
    });
    expect(r.find((x) => x.id === "obs.api")!.status).toBe("FAIL");
    expect(r.find((x) => x.id === "obs.providers")!.status).toBe("WARNING");
  });
  it("error audit blocks stack traces to users", () => {
    const r = auditErrors({
      typedServerErrors: true,
      stackTracesToUsers: true,
      secretsInErrors: false,
      providerErrorsNormalized: true,
      errorBoundariesInstalled: true,
      routeLevelFallbacks: true,
    });
    expect(r.find((x) => x.id === "err.stack-traces")!.hardBlocker).toBe(true);
  });
});

describe("score, verdict, run-id, compose, exports", () => {
  const passing = [
    { id: "a", category: "SECURITY" as const, title: "a", status: "PASS" as const, severity: "info" as const },
    { id: "b", category: "DATABASE" as const, title: "b", status: "PASS" as const, severity: "info" as const },
  ];
  it("score is 100 with all pass and no blockers", () => {
    const s = computeReadinessScore(passing);
    expect(s.total).toBe(100);
    expect(s.hardBlockerCount).toBe(0);
    expect(s.overrideBlocked).toBe(false);
  });
  it("hard blockers force override-blocked", () => {
    const s = computeReadinessScore([
      { ...passing[0], hardBlocker: true, status: "FAIL", severity: "blocker" },
    ] as any);
    expect(s.overrideBlocked).toBe(true);
  });
  it("verdict DEPLOYMENT_BLOCKED when hard blockers present", () => {
    const v = computeVerdict({
      environment: "production",
      score: { total: 100, categories: [], hardBlockerCount: 1, overrideBlocked: true },
      results: [],
    });
    expect(v).toBe("DEPLOYMENT_BLOCKED");
  });
  it("verdict PRODUCTION_REVIEW_REQUIRED never auto-goes to full GO", () => {
    const v = computeVerdict({
      environment: "production",
      score: { total: 100, categories: [], hardBlockerCount: 0, overrideBlocked: false },
      results: [{ id: "x", category: "BUILD", title: "x", status: "PASS", severity: "info" }],
    });
    expect(v).toBe("PRODUCTION_REVIEW_REQUIRED");
  });
  it("run id is deterministic for same inputs", () => {
    const a = computeReadinessRunId({
      buildVersion: "1",
      commitVersion: "1",
      environment: "production",
      deploymentTarget: "cf",
      results: passing,
      databaseSchemaVersion: "v",
      providerStates: [],
      cacheNamespaceVersions: [],
    });
    const b = computeReadinessRunId({
      buildVersion: "1",
      commitVersion: "1",
      environment: "production",
      deploymentTarget: "cf",
      results: passing,
      databaseSchemaVersion: "v",
      providerStates: [],
      cacheNamespaceVersions: [],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^PRODUCTION_READINESS_V1:[0-9a-f]{8}$/);
  });
  it("composes report, exports are secret-free", () => {
    const report = composeReadinessReport(passing, baseCtx);
    expect(report.verdict).toBe("PRODUCTION_REVIEW_REQUIRED");
    const summary = readinessSummaryCsv(report);
    expect(summary).toContain("PASS");
    expect(hardBlockersCsv(report)).toContain("id,category,title,detail,remediation");
    const json = fullReadinessJson(report);
    // Redaction pattern should apply to any secret-like strings in inputs.
    expect(json).not.toMatch(/sk_live_[a-z0-9]+/);
    const bundle = deploymentEvidenceBundle(report);
    expect(bundle).toContain(report.runId);
  });
});
