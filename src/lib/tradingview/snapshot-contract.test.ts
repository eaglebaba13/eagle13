import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  classifyCollectorSignal,
  computeCollectorFreshness,
} from "./snapshot-contract";

describe("collector snapshot contract", () => {
  const base = {
    symbol: "TVC:GOLDSILVER" as const,
    ratio: 70,
    marketTimestamp: 1_784_522_640,
    receivedAtMs: 1_000_000,
    now: 1_010_000,
    connectionStatus: "CONNECTED",
  };

  it("classifies ratios per 50/80 rule", () => {
    expect(classifyCollectorSignal(49.9)).toBe("BUY_GOLD");
    expect(classifyCollectorSignal(50)).toBe("NEUTRAL");
    expect(classifyCollectorSignal(65)).toBe("NEUTRAL");
    expect(classifyCollectorSignal(80)).toBe("NEUTRAL");
    expect(classifyCollectorSignal(80.01)).toBe("BUY_SILVER");
    for (const bad of [NaN, Infinity, 0, -1, null]) {
      expect(classifyCollectorSignal(bad as number)).toBe("UNAVAILABLE");
    }
  });

  it("computes freshness bands", () => {
    expect(computeCollectorFreshness(1000)).toBe("LIVE");
    expect(computeCollectorFreshness(120_001)).toBe("STALE");
    expect(computeCollectorFreshness(600_001)).toBe("UNAVAILABLE");
    expect(computeCollectorFreshness(null)).toBe("UNAVAILABLE");
  });

  it("LIVE snapshot is actionable", () => {
    const s = buildSnapshot(base);
    expect(s.freshness).toBe("LIVE");
    expect(s.signal).toBe("NEUTRAL");
    expect(s.ratio).toBe(70);
  });

  it("STALE snapshot never emits actionable signal", () => {
    const s = buildSnapshot({ ...base, now: base.receivedAtMs + 300_000 });
    expect(s.freshness).toBe("STALE");
    expect(s.signal).toBe("UNAVAILABLE");
    // ratio remains visible for information; consumer must mark stale.
    expect(s.ratio).toBe(70);
  });

  it("UNAVAILABLE snapshot clears actionable state", () => {
    const s = buildSnapshot({ ...base, now: base.receivedAtMs + 900_000 });
    expect(s.freshness).toBe("UNAVAILABLE");
    expect(s.signal).toBe("UNAVAILABLE");
    expect(s.ratio).toBeNull();
  });

  it("invalid ratio → UNAVAILABLE", () => {
    for (const bad of [NaN, -1, 0]) {
      const s = buildSnapshot({ ...base, ratio: bad });
      expect(s.ratio).toBeNull();
      expect(s.signal).toBe("UNAVAILABLE");
    }
  });

  it("does not preserve a remote BUY_GOLD after freshness collapses", () => {
    const s = buildSnapshot({
      ...base,
      now: base.receivedAtMs + 300_000,
      remoteSignal: "BUY_GOLD",
    });
    expect(s.signal).toBe("UNAVAILABLE");
  });
});