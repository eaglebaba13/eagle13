import { describe, expect, it } from "vitest";
import { evaluateCommercialReadiness, COMMERCIAL_READINESS_VERSION, type CommercialReadinessInputs } from "./index";

const baseLaunch = {
  authentication: true, authorization: true,
  dashboard: true, mobile: true, desktop: true,
  performanceOk: true, caching: true, diagnostics: true,
  featureFlags: true, providerHealth: true,
  noMockData: true, noBrokerExecution: true,
  a11yPass: true, testsPassing: true,
  manualPublicSignoff: false,
};

const baseCommercial: CommercialReadinessInputs = {
  ...baseLaunch,
  billingWired: true, licenseEngineLive: true, adminPanelReady: true,
  transactionalEmailsReady: true, couponsReady: true, permissionMatrixVerified: true,
};

describe("commercial-readiness", () => {
  it("NOT_READY when hard launch gate fails", () => {
    const r = evaluateCommercialReadiness({ ...baseCommercial, noBrokerExecution: false });
    expect(r.verdict).toBe("NOT_READY");
  });
  it("READY_FOR_BETA when commercial gate missing", () => {
    const r = evaluateCommercialReadiness({ ...baseCommercial, billingWired: false });
    expect(r.verdict).toBe("READY_FOR_BETA");
    expect(r.missingCommercial).toContain("billingWired");
  });
  it("READY_FOR_SUBSCRIPTION when all commercial gates met", () => {
    expect(evaluateCommercialReadiness(baseCommercial).verdict).toBe("READY_FOR_SUBSCRIPTION");
  });
  it("READY_FOR_PUBLIC only with manual sign-off", () => {
    const r = evaluateCommercialReadiness({ ...baseCommercial, manualPublicSignoff: true });
    expect(r.verdict).toBe("READY_FOR_PUBLIC");
  });
  it("version stable", () => {
    expect(COMMERCIAL_READINESS_VERSION).toBe("commercial-readiness@1.0.0");
  });
});