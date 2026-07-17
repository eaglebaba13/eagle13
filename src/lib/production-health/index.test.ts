import { describe, expect, it } from "vitest";
import { aggregateHealth, PROD_HEALTH_VERSION } from "./index";

const g = {
  providers: "GREEN", gti: "GREEN", combinedPcr: "GREEN", breadth: "GREEN",
  optionChain: "GREEN", dashboard: "GREEN", performance: "GREEN", cache: "GREEN", build: "GREEN",
} as const;

describe("prod-health", () => {
  it("all green → GREEN", () => {
    expect(aggregateHealth(g).overall).toBe("GREEN");
  });
  it("any RED → RED", () => {
    const r = aggregateHealth({ ...g, breadth: "RED" });
    expect(r.overall).toBe("RED");
    expect(r.reds).toContain("breadth");
  });
  it("YELLOW only → YELLOW", () => {
    const r = aggregateHealth({ ...g, cache: "YELLOW" });
    expect(r.overall).toBe("YELLOW");
  });
  it("version stable", () => {
    expect(PROD_HEALTH_VERSION).toBe("prod-health@1.0.0");
  });
});