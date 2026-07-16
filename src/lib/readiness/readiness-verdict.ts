import type {
  ReadinessResult,
  ReadinessScore,
  ReadinessVerdict,
} from "./production-readiness-types";

export interface VerdictInput {
  environment: "development" | "staging" | "production" | "unknown";
  score: ReadinessScore;
  results: readonly ReadinessResult[];
  humanApproval?: boolean;
}

export function computeVerdict(input: VerdictInput): ReadinessVerdict {
  if (input.score.hardBlockerCount > 0) return "DEPLOYMENT_BLOCKED";
  const total = input.score.total;
  const anyFail = input.results.some((r) => r.status === "FAIL" || r.status === "MISSING");
  if (total < 60 || anyFail) return "NOT_READY";
  if (total < 75) return "READY_FOR_STAGING";
  if (total < 85) return "STAGING_VALIDATION_REQUIRED";
  if (total < 95) return "READY_FOR_LIMITED_PRODUCTION";
  // Even at 100 we never return full production GO without human approval.
  return "PRODUCTION_REVIEW_REQUIRED";
}
