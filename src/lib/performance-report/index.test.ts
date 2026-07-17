import { describe, expect, it } from "vitest";
import { computePerfReport, PERF_REPORT_VERSION } from "./index";

const sample = (p95: number) => ({ count: 10, p50: p95 / 2, p95, p99: p95 * 1.1, max: p95 * 1.2 });

describe("perf-report", () => {
  it("all-green when metrics healthy", () => {
    const r = computePerfReport({
      quotes: sample(200), optionChain: sample(500), combinedPcr: sample(300), breadth: sample(400),
      cacheHitRatio: 0.85, duplicateFetches: 0, hydrationErrors: 0, bundleKb: 600,
    });
    expect(r.grade).toBe("GREEN");
  });
  it("RED when hydration errors present", () => {
    const r = computePerfReport({
      quotes: sample(100), optionChain: sample(100), combinedPcr: sample(100), breadth: sample(100),
      cacheHitRatio: 1, duplicateFetches: 0, hydrationErrors: 1, bundleKb: 100,
    });
    expect(r.hydration).toBe("RED");
    expect(r.grade).toBe("RED");
  });
  it("YELLOW at cache ratio 0.55", () => {
    const r = computePerfReport({
      quotes: sample(100), optionChain: sample(100), combinedPcr: sample(100), breadth: sample(100),
      cacheHitRatio: 0.55, duplicateFetches: 0, hydrationErrors: 0, bundleKb: 100,
    });
    expect(r.cache).toBe("YELLOW");
  });
  it("flags duplicate fetches", () => {
    const r = computePerfReport({
      quotes: sample(100), optionChain: sample(100), combinedPcr: sample(100), breadth: sample(100),
      cacheHitRatio: 1, duplicateFetches: 5, hydrationErrors: 0, bundleKb: 100,
    });
    expect(r.duplicateFetches).toBe("RED");
    expect(r.warnings).toContain("duplicate_provider_fetches_detected");
  });
  it("version stable", () => {
    expect(PERF_REPORT_VERSION).toBe("perf-report@1.0.0");
  });
});