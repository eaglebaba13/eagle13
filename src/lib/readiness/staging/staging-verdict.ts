import type { StagingCheck, StagingVerdict } from "./staging-validation-types";

export interface VerdictInput {
  configured: boolean;
  checks: readonly StagingCheck[];
}

export function computeStagingVerdict(input: VerdictInput): {
  verdict: StagingVerdict;
  score: { total: number; passCount: number; warnCount: number; failCount: number; hardBlockerCount: number };
} {
  if (!input.configured) {
    return {
      verdict: "STAGING_NOT_CONFIGURED",
      score: { total: 0, passCount: 0, warnCount: 0, failCount: 0, hardBlockerCount: 0 },
    };
  }
  const pass = input.checks.filter((c) => c.status === "PASS").length;
  const warn = input.checks.filter((c) => c.status === "WARNING").length;
  const fail = input.checks.filter((c) => c.status === "FAIL" || c.status === "BLOCKED").length;
  const applicable = pass + warn + fail;
  const total = applicable === 0 ? 0 : Math.round(((pass + 0.5 * warn) / applicable) * 100);
  const hardBlockerCount = input.checks.filter((c) => c.hardBlocker).length;
  let verdict: StagingVerdict;
  if (hardBlockerCount > 0) verdict = "STAGING_BLOCKED";
  else if (fail > 0) verdict = "STAGING_FAILED";
  else if (warn > 0 && total < 90) verdict = "STAGING_PARTIAL";
  else if (total < 100) verdict = "STAGING_VALIDATED";
  else verdict = "READY_FOR_LIMITED_PRODUCTION_REVIEW";
  return {
    verdict,
    score: { total, passCount: pass, warnCount: warn, failCount: fail, hardBlockerCount },
  };
}