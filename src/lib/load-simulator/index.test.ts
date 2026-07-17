import { describe, expect, it } from "vitest";
import { simulateLoad, simulateStandardTiers, STANDARD_LOAD_TIERS, LOAD_SIM_VERSION } from "./index";

describe("load-simulator", () => {
  it("50 users with 70% cache is SAFE", () => {
    const r = simulateLoad({
      users: 50, requestsPerUserPerMinute: 60, cacheHitRatio: 0.7,
      providerP95LatencyMs: 400, providerCapacityRps: 100,
    });
    expect(r.verdict).toBe("SAFE");
    expect(r.requestsPerSecond).toBeCloseTo(50);
  });
  it("saturating provider → OVERLOAD", () => {
    const r = simulateLoad({
      users: 1000, requestsPerUserPerMinute: 60, cacheHitRatio: 0.2,
      providerP95LatencyMs: 400, providerCapacityRps: 100,
    });
    expect(r.verdict).toBe("OVERLOAD");
  });
  it("standard tiers cover 50..1000", () => {
    const reports = simulateStandardTiers({
      requestsPerUserPerMinute: 30, cacheHitRatio: 0.8,
      providerP95LatencyMs: 300, providerCapacityRps: 200,
    });
    expect(reports.map((r) => r.users)).toEqual([...STANDARD_LOAD_TIERS]);
  });
  it("p95 inflates near saturation", () => {
    const light = simulateLoad({
      users: 10, requestsPerUserPerMinute: 6, cacheHitRatio: 0.5,
      providerP95LatencyMs: 200, providerCapacityRps: 100,
    });
    const heavy = simulateLoad({
      users: 1000, requestsPerUserPerMinute: 60, cacheHitRatio: 0.5,
      providerP95LatencyMs: 200, providerCapacityRps: 100,
    });
    expect(heavy.projectedP95Ms).toBeGreaterThan(light.projectedP95Ms);
  });
  it("version stable", () => {
    expect(LOAD_SIM_VERSION).toBe("load-sim@1.0.0");
  });
});