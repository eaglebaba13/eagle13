// Phase 26 · Stage 4 — Launch readiness aggregator.
//
// Pure verdict function. Callers feed in already-collected signals from
// the diagnostics endpoints; this module never fetches. Never
// auto-launches.

export type LaunchCheckStatus = "PASS" | "PARTIAL" | "FAIL" | "PENDING";

export interface LaunchCheck {
  readonly id: string;
  readonly label: string;
  readonly status: LaunchCheckStatus;
  readonly detail?: string;
}

export type LaunchVerdict =
  | "NOT_READY"
  | "READY_FOR_INTERNAL_TEST"
  | "READY_FOR_SUBSCRIPTION_PREVIEW"
  | "PRODUCTION_REVIEW_REQUIRED";

export interface LaunchReadinessInput {
  readonly upstoxConfigured: boolean;
  readonly quoteApiPass: boolean;
  readonly niftyPass: boolean;
  readonly bankniftyPass: boolean;
  readonly indiaVixPass: boolean;
  readonly freshnessPass: boolean;
  readonly dashboardQueryPass: boolean;
  readonly mobileParityPass: boolean;
  readonly noMockData: boolean;
  readonly noStaleActionable: boolean;
  readonly optionChainReady: boolean;
  readonly subscriptionVisibilityOk: boolean;
}

export interface LaunchReadinessReport {
  readonly checks: readonly LaunchCheck[];
  readonly verdict: LaunchVerdict;
  readonly blocking: readonly string[];
  readonly generatedAt: string;
}

function pass(cond: boolean): LaunchCheckStatus {
  return cond ? "PASS" : "FAIL";
}

export function evaluateLaunchReadiness(input: LaunchReadinessInput): LaunchReadinessReport {
  const checks: LaunchCheck[] = [
    { id: "upstox-config", label: "Upstox configured", status: pass(input.upstoxConfigured) },
    { id: "quote-api", label: "Quote API", status: pass(input.quoteApiPass) },
    { id: "nifty", label: "NIFTY50", status: pass(input.niftyPass) },
    { id: "banknifty", label: "BANKNIFTY", status: pass(input.bankniftyPass) },
    { id: "india-vix", label: "INDIA VIX", status: pass(input.indiaVixPass) },
    { id: "freshness", label: "Freshness", status: pass(input.freshnessPass) },
    { id: "dashboard-query", label: "Dashboard query", status: pass(input.dashboardQueryPass) },
    { id: "mobile-parity", label: "Mobile parity", status: pass(input.mobileParityPass) },
    { id: "no-mock", label: "No mock data", status: pass(input.noMockData) },
    { id: "no-stale-actionable", label: "No stale actionable signal", status: pass(input.noStaleActionable) },
    {
      id: "option-chain",
      label: "Option-chain readiness",
      status: input.optionChainReady ? "PASS" : "PENDING",
    },
    {
      id: "subscription-visibility",
      label: "Subscription visibility",
      status: pass(input.subscriptionVisibilityOk),
    },
  ];

  const blocking = checks.filter((c) => c.status === "FAIL").map((c) => c.id);
  const requiredFail =
    !input.upstoxConfigured ||
    !input.quoteApiPass ||
    !input.niftyPass ||
    !input.bankniftyPass ||
    !input.indiaVixPass ||
    !input.dashboardQueryPass ||
    !input.noMockData ||
    !input.subscriptionVisibilityOk;

  let verdict: LaunchVerdict;
  if (requiredFail) verdict = "NOT_READY";
  else if (!input.freshnessPass || !input.noStaleActionable) verdict = "READY_FOR_INTERNAL_TEST";
  else if (!input.mobileParityPass || !input.optionChainReady) verdict = "READY_FOR_SUBSCRIPTION_PREVIEW";
  else verdict = "PRODUCTION_REVIEW_REQUIRED";

  return {
    checks,
    verdict,
    blocking,
    generatedAt: new Date().toISOString(),
  };
}