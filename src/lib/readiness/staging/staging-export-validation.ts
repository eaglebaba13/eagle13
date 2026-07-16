import type { StagingCheck } from "./staging-validation-types";
import { SECRET_LIKE_PATTERN } from "../production-readiness-types";

export interface ExportSample {
  id: string;
  family: string;
  filename: string;
  mimeType: string;
  contentSample: string;
  contentBytes: number;
  runId: string | null;
  formulaVersions: readonly string[];
  providerMetadataPresent: boolean;
  disclaimerPresent: boolean;
  parseable: boolean;
}

const MAX_SAFE_EXPORT_BYTES = 25 * 1024 * 1024;

function containsSecret(content: string): boolean {
  SECRET_LIKE_PATTERN.lastIndex = 0;
  const has = SECRET_LIKE_PATTERN.test(content);
  SECRET_LIKE_PATTERN.lastIndex = 0;
  return has;
}

export function auditExportSamples(samples: readonly ExportSample[]): StagingCheck[] {
  const checks: StagingCheck[] = [];
  for (const s of samples) {
    const issues: string[] = [];
    if (!s.parseable) issues.push("not_parseable");
    if (!s.runId) issues.push("no_run_id");
    if (!s.providerMetadataPresent) issues.push("no_provider_metadata");
    if (!s.disclaimerPresent) issues.push("no_disclaimer");
    if (s.formulaVersions.length === 0) issues.push("no_formula_versions");
    if (s.contentBytes > MAX_SAFE_EXPORT_BYTES) issues.push("oversized");
    if (!s.filename) issues.push("no_filename");
    if (!s.mimeType) issues.push("no_mime_type");
    const secretLeak = containsSecret(s.contentSample);
    if (secretLeak) issues.push("secret_leak");
    const failed = issues.length > 0;
    checks.push({
      id: secretLeak ? "export.secret_leak" : `export.${s.family}.${s.id}`,
      category: "GOVERNANCE",
      title: `Export: ${s.family} — ${s.filename}`,
      status: failed ? "FAIL" : "PASS",
      severity: secretLeak ? "blocker" : failed ? "critical" : "info",
      detail: failed ? issues.join(",") : "clean",
      hardBlocker: secretLeak,
    });
  }
  return checks;
}