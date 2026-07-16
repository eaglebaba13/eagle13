import type { ProductionReadinessReport } from "./production-readiness-types";
import { redactSecretLike } from "./production-readiness-types";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  const redacted = redactSecretLike(s);
  if (/[",\n]/.test(redacted)) return `"${redacted.replace(/"/g, '""')}"`;
  return redacted;
}

function csvRows(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function readinessSummaryCsv(r: ProductionReadinessReport): string {
  const rows: (readonly unknown[])[] = [
    ["id", "category", "title", "status", "severity", "hardBlocker"],
    ...r.results.map((x) => [x.id, x.category, x.title, x.status, x.severity, !!x.hardBlocker]),
  ];
  return csvRows(rows);
}

export function hardBlockersCsv(r: ProductionReadinessReport): string {
  const rows: (readonly unknown[])[] = [
    ["id", "category", "title", "detail", "remediation"],
    ...r.blockers.map((x) => [x.id, x.category, x.title, x.detail, x.remediation ?? ""]),
  ];
  return csvRows(rows);
}

export function categoryCsv(r: ProductionReadinessReport, cat: string): string {
  const rows: (readonly unknown[])[] = [
    ["id", "title", "status", "severity", "detail"],
    ...r.results
      .filter((x) => x.category === cat)
      .map((x) => [x.id, x.title, x.status, x.severity, x.detail ?? ""]),
  ];
  return csvRows(rows);
}

export function fullReadinessJson(r: ProductionReadinessReport): string {
  // JSON.stringify with a reviver that redacts any string leaves.
  return JSON.stringify(
    r,
    (_k, v) => (typeof v === "string" ? redactSecretLike(v) : v),
    2,
  );
}

export function deploymentEvidenceBundle(r: ProductionReadinessReport): string {
  return JSON.stringify(
    {
      runId: r.runId,
      generatedAt: r.generatedAt,
      environment: r.environment,
      buildVersion: r.buildVersion,
      deploymentTarget: r.deploymentTarget,
      score: r.score,
      verdict: r.verdict,
      blockers: r.blockers,
      warnings: r.warnings,
      evidenceFingerprints: r.meta.evidenceFingerprints,
    },
    (_k, v) => (typeof v === "string" ? redactSecretLike(v) : v),
    2,
  );
}
