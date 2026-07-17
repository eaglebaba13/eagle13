import { describe, it, expect } from "vitest";
import { MonitoringBuffer, summariseMonitoring } from "./index";

describe("monitoring", () => {
  const now = 1_000_000;
  const s = (kind: any, value: number, offset = 0) => ({ kind, value, at: now - offset });

  it("computes latency percentiles and error rate", () => {
    const samples = [
      s("api-latency", 10),
      s("api-latency", 50),
      s("api-latency", 100),
      s("api-latency", 200),
      s("server-error", 1),
    ];
    const r = summariseMonitoring(samples, 60_000, now);
    expect(r.latencyP50Ms).toBeGreaterThan(0);
    expect(r.latencyP95Ms).toBeGreaterThanOrEqual(r.latencyP50Ms);
    expect(r.errorRate).toBeCloseTo(1 / 4);
  });

  it("computes cache hit ratio", () => {
    const r = summariseMonitoring(
      [s("cache-hit", 1), s("cache-hit", 1), s("cache-hit", 1), s("cache-miss", 1)],
      60_000,
      now,
    );
    expect(r.cacheHitRatio).toBeCloseTo(0.75);
  });

  it("filters by window", () => {
    const r = summariseMonitoring([s("server-error", 1, 999_999)], 60_000, now);
    expect(r.total).toBe(0);
  });

  it("tracks memory and cpu peaks", () => {
    const r = summariseMonitoring(
      [s("memory", 100), s("memory", 250), s("cpu", 40), s("cpu", 20)],
      60_000,
      now,
    );
    expect(r.memoryPeakMb).toBe(250);
    expect(r.cpuPeakPercent).toBe(40);
  });

  it("ring buffer respects capacity", () => {
    const buf = new MonitoringBuffer(3);
    for (let i = 0; i < 5; i++) buf.push({ kind: "cache-hit", value: 1, at: i });
    expect(buf.snapshot().length).toBe(3);
    expect(buf.snapshot()[0].at).toBe(2);
  });
});