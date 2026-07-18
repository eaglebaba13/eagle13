// Phase 3C-3 — Smart Alert engine readiness classifier tests.

import { describe, it, expect } from "vitest";
import { classifySmartAlertReadiness, unknownEngineHealth } from "./readiness";

describe("classifySmartAlertReadiness", () => {
  it("is HEALTHY with defaults and disabled external adapters", () => {
    const r = classifySmartAlertReadiness(unknownEngineHealth());
    expect(r.status).toBe("HEALTHY");
    expect(r.blockers).toEqual([]);
    expect(r.reason).toMatch(/healthy/i);
  });

  it("is DEGRADED when last evaluation failed", () => {
    const r = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      lastEvaluationStatus: "FAILED",
      lastError: "boom",
    });
    expect(r.status).toBe("DEGRADED");
    expect(r.warnings.some((w) => w.includes("boom"))).toBe(true);
  });

  it("is DEGRADED for elevated delivery failure rate", () => {
    const r = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      deliveryFailureRate: 0.5,
    });
    expect(r.status).toBe("DEGRADED");
  });

  it("is UNAVAILABLE when persistence or checkpoint drop", () => {
    const r1 = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      persistenceAvailable: false,
    });
    expect(r1.status).toBe("UNAVAILABLE");
    const r2 = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      checkpointAvailable: false,
    });
    expect(r2.status).toBe("UNAVAILABLE");
    const r3 = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      inAppDeliveryAvailable: false,
    });
    expect(r3.status).toBe("UNAVAILABLE");
  });

  it("disabled external adapters do NOT degrade readiness", () => {
    const r = classifySmartAlertReadiness({
      ...unknownEngineHealth(),
      externalAdaptersDisabledByConfiguration: true,
    });
    expect(r.status).toBe("HEALTHY");
  });

  it("engine reports rule count > 0", () => {
    expect(unknownEngineHealth().ruleCount).toBeGreaterThan(0);
    expect(unknownEngineHealth().alertTypeCount).toBeGreaterThan(0);
  });
});