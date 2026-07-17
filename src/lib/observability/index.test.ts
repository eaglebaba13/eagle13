import { describe, it, expect, beforeEach } from "vitest";
import { recordEvent, snapshotObservability, _resetObservability } from "./index";

describe("observability", () => {
  beforeEach(() => _resetObservability());

  it("counts events by type", () => {
    recordEvent({ type: "provider.failure" });
    recordEvent({ type: "cache.hit" });
    recordEvent({ type: "cache.miss" });
    recordEvent({ type: "cache.hit" });
    const s = snapshotObservability();
    expect(s.providerFailures).toBe(1);
    expect(s.cacheHitRatio).toBeCloseTo(2 / 3, 5);
  });

  it("averages latency", () => {
    recordEvent({ type: "provider.latency", value: 100 });
    recordEvent({ type: "provider.latency", value: 300 });
    expect(snapshotObservability().avgLatencyMs).toBe(200);
  });

  it("caps buffer size", () => {
    for (let i = 0; i < 500; i += 1) recordEvent({ type: "cache.hit" });
    expect(snapshotObservability().total).toBeLessThanOrEqual(200);
  });

  it("returns null cache ratio when empty", () => {
    expect(snapshotObservability().cacheHitRatio).toBeNull();
  });
});