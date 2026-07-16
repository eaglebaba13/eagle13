import { describe, it, expect } from "vitest";
import { evaluateLaunchReadiness, type LaunchReadinessInput } from "./launch-readiness";

const base: LaunchReadinessInput = {
  upstoxConfigured: true,
  quoteApiPass: true,
  niftyPass: true,
  bankniftyPass: true,
  indiaVixPass: true,
  freshnessPass: true,
  dashboardQueryPass: true,
  mobileParityPass: true,
  noMockData: true,
  noStaleActionable: true,
  optionChainReady: false,
  subscriptionVisibilityOk: true,
};

describe("launch-readiness", () => {
  it("NOT_READY when any required core check fails", () => {
    expect(evaluateLaunchReadiness({ ...base, upstoxConfigured: false }).verdict).toBe("NOT_READY");
    expect(evaluateLaunchReadiness({ ...base, niftyPass: false }).verdict).toBe("NOT_READY");
    expect(evaluateLaunchReadiness({ ...base, noMockData: false }).verdict).toBe("NOT_READY");
  });

  it("READY_FOR_INTERNAL_TEST when freshness or stale-actionable fails", () => {
    expect(evaluateLaunchReadiness({ ...base, freshnessPass: false }).verdict).toBe("READY_FOR_INTERNAL_TEST");
  });

  it("READY_FOR_SUBSCRIPTION_PREVIEW when option-chain still pending", () => {
    expect(evaluateLaunchReadiness(base).verdict).toBe("READY_FOR_SUBSCRIPTION_PREVIEW");
  });

  it("PRODUCTION_REVIEW_REQUIRED when everything green including option-chain", () => {
    expect(evaluateLaunchReadiness({ ...base, optionChainReady: true }).verdict).toBe("PRODUCTION_REVIEW_REQUIRED");
  });

  it("never auto-launches (verdict is never a bare LAUNCH string)", () => {
    const v = evaluateLaunchReadiness({ ...base, optionChainReady: true }).verdict;
    expect(v).not.toBe("LAUNCH");
  });
});