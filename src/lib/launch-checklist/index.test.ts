import { describe, expect, it } from "vitest";
import { evaluateLaunchChecklist, LAUNCH_CHECKLIST_VERSION, type LaunchChecklistInputs } from "./index";

const base: LaunchChecklistInputs = {
  authentication: true, authorization: true,
  dashboard: true, mobile: true, desktop: true,
  performanceOk: true, caching: true, diagnostics: true,
  featureFlags: true, providerHealth: true,
  noMockData: true, noBrokerExecution: true,
  a11yPass: true, testsPassing: true,
  manualPublicSignoff: false,
};

describe("launch-checklist", () => {
  it("NOT_READY when hard requirement fails", () => {
    const r = evaluateLaunchChecklist({ ...base, noMockData: false });
    expect(r.verdict).toBe("NOT_READY");
    expect(r.missing).toContain("noMockData");
  });
  it("NOT_READY when broker execution enabled", () => {
    expect(evaluateLaunchChecklist({ ...base, noBrokerExecution: false }).verdict).toBe("NOT_READY");
  });
  it("READY_FOR_BETA when hard OK but subscription reqs missing", () => {
    const r = evaluateLaunchChecklist({ ...base, mobile: false });
    expect(r.verdict).toBe("READY_FOR_BETA");
    expect(r.missing).toContain("mobile");
  });
  it("READY_FOR_SUBSCRIPTION when subscription reqs met, no public sign-off", () => {
    expect(evaluateLaunchChecklist(base).verdict).toBe("READY_FOR_SUBSCRIPTION");
  });
  it("READY_FOR_PUBLIC only with manual sign-off", () => {
    expect(evaluateLaunchChecklist({ ...base, manualPublicSignoff: true }).verdict).toBe("READY_FOR_PUBLIC");
  });
  it("version stable", () => {
    expect(LAUNCH_CHECKLIST_VERSION).toBe("launch-checklist@1.0.0");
  });
});