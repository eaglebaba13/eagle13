import { redactSecretLike } from "../production-readiness-types";
import type { StagingCheck, StagingJourney, StagingValidationReport } from "./staging-validation-types";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  const redacted = redactSecretLike(s);
  if (/[",\n]/.test(redacted)) return `"${redacted.replace(/"/g, '""')}"`;
  return redacted;
}
function csvRows(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
function filtered(r: StagingValidationReport, predicate: (c: StagingCheck) => boolean): readonly StagingCheck[] {
  return r.checks.filter(predicate);
}

export function stagingSummaryCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "category", "title", "status", "severity", "hardBlocker"],
    ...r.checks.map((c) => [c.id, c.category, c.title, c.status, c.severity, !!c.hardBlocker]),
  ]);
}
export function journeyResultsCsv(r: StagingValidationReport): string {
  const rows: (readonly unknown[])[] = [
    ["journeyId", "title", "role", "status", "durationMs", "stepId", "stepStatus", "route", "httpStatus", "error"],
  ];
  for (const j of r.journeys as StagingJourney[]) {
    if (j.steps.length === 0) rows.push([j.id, j.title, j.role, j.status, j.durationMs, "", "", "", "", ""]);
    for (const s of j.steps) {
      rows.push([j.id, j.title, j.role, j.status, j.durationMs, s.id, s.status, s.route ?? "", s.httpStatus ?? "", s.error ?? ""]);
    }
  }
  return csvRows(rows);
}
export function providerDrillCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "status", "detail"],
    ...filtered(r, (c) => c.id.startsWith("provider_drill.") || c.id.startsWith("failover.")).map((c) => [c.id, c.title, c.status, c.detail ?? ""]),
  ]);
}
export function authorizationCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "status", "detail"],
    ...filtered(r, (c) => c.id.startsWith("authz.") || c.id.startsWith("rls.")).map((c) => [c.id, c.title, c.status, c.detail ?? ""]),
  ]);
}
export function performanceCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "label", "valueMs", "warnMs", "failMs", "status"],
    ...r.performance.map((m) => [m.id, m.label, m.valueMs, m.warnMs, m.failMs, m.status]),
  ]);
}
export function bundleAuditCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "status", "detail"],
    ...filtered(r, (c) => c.id.startsWith("bundle.")).map((c) => [c.id, c.title, c.status, c.detail ?? ""]),
  ]);
}
export function loadTestCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "status", "detail"],
    ...filtered(r, (c) => c.id.startsWith("load.")).map((c) => [c.id, c.title, c.status, c.detail ?? ""]),
  ]);
}
export function recoveryDrillCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "outcome"],
    ...r.recoveryDrills.map((d) => [d.id, d.title, d.outcome]),
  ]);
}
export function incidentDrillCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "scenario", "owner", "outcome", "detectionMs", "acknowledgmentMs"],
    ...r.incidentDrills.map((d) => [d.id, d.scenario, d.owner, d.outcome, d.detectionMs ?? "", d.acknowledgmentMs ?? ""]),
  ]);
}
export function releaseChecklistCsv(r: StagingValidationReport): string {
  return csvRows([
    ["id", "title", "status"],
    ...filtered(r, (c) => c.id.startsWith("release.")).map((c) => [c.id, c.title, c.status]),
  ]);
}
export function fullStagingReportJson(r: StagingValidationReport): string {
  return JSON.stringify(r, (_k, v) => (typeof v === "string" ? redactSecretLike(v) : v), 2);
}
export function stagingEvidenceBundleJson(r: StagingValidationReport): string {
  return JSON.stringify(
    {
      runId: r.runId,
      generatedAt: r.generatedAt,
      stagingHost: r.stagingHost,
      environment: r.environment,
      buildVersion: r.buildVersion,
      commitVersion: r.commitVersion,
      verdict: r.verdict,
      score: r.score,
      blockers: r.blockers,
      warnings: r.warnings,
    },
    (_k, v) => (typeof v === "string" ? redactSecretLike(v) : v),
    2,
  );
}