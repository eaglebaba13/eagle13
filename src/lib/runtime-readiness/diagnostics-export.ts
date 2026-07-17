// Phase 2H — Safe redaction + JSON export for RuntimeReadinessReport.
//
// The canonical report already avoids provider URLs, secrets and tokens
// by construction. This module hard-caps that guarantee with a defensive
// redactor so diagnostics UIs can freely `Copy JSON` / `Download JSON`
// without leaking anything.

import type { RuntimeReadinessReport } from "./runtime-readiness";
import type { RuntimeEvidence } from "./runtime-evidence";

const SECRET_KEYS = /^(authorization|api[-_]?key|token|secret|password|cookie|set-cookie)$/i;
const URL_RE = /https?:\/\/[^\s"']+/gi;

function scrubString(input: string): string {
  return input.replace(URL_RE, "[redacted-url]");
}

function scrubEvidence(e: RuntimeEvidence): RuntimeEvidence {
  return {
    ...e,
    reason: scrubString(e.reason),
    blockers: e.blockers.map(scrubString),
    warnings: e.warnings.map(scrubString),
  };
}

export function redactRuntimeReadinessReport(
  report: RuntimeReadinessReport,
): RuntimeReadinessReport {
  return {
    ...report,
    evidence: report.evidence.map(scrubEvidence),
    blockers: report.blockers.map(scrubString),
    warnings: report.warnings.map(scrubString),
    contradictions: report.contradictions.map((c) => ({
      ...c,
      message: scrubString(c.message),
    })),
  };
}

export function exportRuntimeReadinessJson(
  report: RuntimeReadinessReport,
): string {
  return JSON.stringify(
    report,
    (key, value) => (SECRET_KEYS.test(key) ? "[redacted]" : value),
    2,
  );
}