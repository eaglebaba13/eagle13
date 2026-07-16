import type { ReadinessResult, ReadinessStatus } from "./production-readiness-types";

export interface ReleaseChecklistInput {
  testsPassing: boolean;
  typecheckPassing: boolean;
  lintPassing: boolean;
  productionBuildPassing: boolean;
  environmentComplete: boolean;
  migrationsApplied: boolean;
  rlsAuditPassing: boolean;
  adminRoleAssigned: boolean;
  paymentConfigured: boolean;
  providersHealthy: boolean;
  cacheHealthy: boolean;
  schedulerHealthy: boolean;
  backupsVerified: boolean;
  incidentContactConfigured: boolean;
  privacyTermsLinksConfigured: boolean;
  supportContactConfigured: boolean;
  versionTagRecorded: boolean;
  rollbackPlanDocumented: boolean;
}

function item(id: string, title: string, ok: boolean): ReadinessResult {
  const status: ReadinessStatus = ok ? "PASS" : "FAIL";
  return {
    id,
    category: "GOVERNANCE",
    title,
    status,
    severity: ok ? "info" : "critical",
  };
}

export function releaseChecklist(i: ReleaseChecklistInput): ReadinessResult[] {
  return [
    item("release.tests", "Tests passing", i.testsPassing),
    item("release.typecheck", "Typecheck passing", i.typecheckPassing),
    item("release.lint", "Lint passing", i.lintPassing),
    item("release.build", "Production build passing", i.productionBuildPassing),
    item("release.env", "Environment complete", i.environmentComplete),
    item("release.migrations", "Migrations applied", i.migrationsApplied),
    item("release.rls", "RLS audit passing", i.rlsAuditPassing),
    item("release.admin", "Admin role assigned", i.adminRoleAssigned),
    item("release.payment", "Payment configuration complete", i.paymentConfigured),
    item("release.providers", "Providers healthy", i.providersHealthy),
    item("release.cache", "Cache healthy", i.cacheHealthy),
    item("release.scheduler", "Scheduler healthy", i.schedulerHealthy),
    item("release.backup", "Backups verified", i.backupsVerified),
    item("release.incident-contact", "Incident contact configured", i.incidentContactConfigured),
    item("release.legal-links", "Privacy/terms links configured", i.privacyTermsLinksConfigured),
    item("release.support", "Support contact configured", i.supportContactConfigured),
    item("release.version", "Version/tag recorded", i.versionTagRecorded),
    item("release.rollback", "Rollback plan documented", i.rollbackPlanDocumented),
  ];
}
