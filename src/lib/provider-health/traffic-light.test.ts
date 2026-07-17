import { describe, it, expect } from "vitest";
import { evaluateTrafficLight, trafficLightLabel } from "./traffic-light";

describe("traffic-light", () => {
  const base = { freshnessMs: 10_000, latencyMs: 200, coverage: 1, failures: 0 };

  it("GREEN when all inputs healthy", () => {
    expect(evaluateTrafficLight(base)).toBe("GREEN");
  });

  it("YELLOW when freshness degraded", () => {
    expect(evaluateTrafficLight({ ...base, freshnessMs: 90_000 })).toBe("YELLOW");
  });

  it("RED when freshness stale", () => {
    expect(evaluateTrafficLight({ ...base, freshnessMs: 10 * 60_000 })).toBe("RED");
  });

  it("RED when latency exceeds red threshold", () => {
    expect(evaluateTrafficLight({ ...base, latencyMs: 10_000 })).toBe("RED");
  });

  it("RED when coverage below yellow", () => {
    expect(evaluateTrafficLight({ ...base, coverage: 0.2 })).toBe("RED");
  });

  it("RED when provider OFFLINE regardless of other inputs", () => {
    expect(evaluateTrafficLight({ ...base, providerStatus: "OFFLINE" })).toBe("RED");
  });

  it("YELLOW when unknown freshness", () => {
    expect(evaluateTrafficLight({ ...base, freshnessMs: null })).toBe("YELLOW");
  });

  it("takes worst of all signals", () => {
    expect(evaluateTrafficLight({ ...base, coverage: 0.5, latencyMs: 100 })).toBe("RED");
  });

  it("label mapping", () => {
    expect(trafficLightLabel("GREEN")).toBe("Healthy");
    expect(trafficLightLabel("YELLOW")).toBe("Degraded");
    expect(trafficLightLabel("RED")).toBe("Unhealthy");
  });
});