import { describe, it, expect } from "vitest";
import {
  classifyRatio,
  computeGoldSilverSnapshot,
  distanceFromNearestThreshold,
  GOLD_SILVER_LOWER_THRESHOLD,
  GOLD_SILVER_UPPER_THRESHOLD,
} from "./gold-silver-ratio";

const NOW = Date.parse("2026-07-16T10:00:00Z");
const fresh = new Date(NOW - 60_000).toISOString();
const stale = new Date(NOW - 60 * 60_000).toISOString();

describe("Phase 24A · Gold–Silver Ratio boundary rules", () => {
  it("ratio 54.99 → BUY_GOLD", () => {
    expect(classifyRatio(54.99)).toBe("BUY_GOLD");
  });
  it("ratio exactly 55 → WAIT", () => {
    expect(classifyRatio(55)).toBe("WAIT");
  });
  it("ratio between (60) → WAIT", () => {
    expect(classifyRatio(60)).toBe("WAIT");
  });
  it("ratio exactly 75 → WAIT", () => {
    expect(classifyRatio(75)).toBe("WAIT");
  });
  it("ratio 75.01 → BUY_SILVER", () => {
    expect(classifyRatio(75.01)).toBe("BUY_SILVER");
  });
  it("thresholds are 55 / 75", () => {
    expect(GOLD_SILVER_LOWER_THRESHOLD).toBe(55);
    expect(GOLD_SILVER_UPPER_THRESHOLD).toBe(75);
  });
});

describe("Phase 24A · snapshot semantics", () => {
  it("computes ratio and BUY_GOLD signal below 55", () => {
    const s = computeGoldSilverSnapshot({
      goldPrice: 2160, silverPrice: 41, provider: "Yahoo",
      goldTimestamp: fresh, silverTimestamp: fresh, now: NOW,
    });
    expect(s.ratio).toBeLessThan(55);
    expect(s.signal).toBe("BUY_GOLD");
    expect(s.dataQuality).toBe("OK");
    expect(s.freshness).toBe("LIVE");
  });
  it("computes BUY_SILVER signal above 75", () => {
    const s = computeGoldSilverSnapshot({
      goldPrice: 2400, silverPrice: 30, provider: "Yahoo",
      goldTimestamp: fresh, silverTimestamp: fresh, now: NOW,
    });
    expect(s.signal).toBe("BUY_SILVER");
  });
  it("missing gold or silver price → DATA_UNAVAILABLE", () => {
    expect(
      computeGoldSilverSnapshot({ goldPrice: null, silverPrice: 25, now: NOW }).signal,
    ).toBe("DATA_UNAVAILABLE");
    expect(
      computeGoldSilverSnapshot({ goldPrice: 2000, silverPrice: null, now: NOW }).signal,
    ).toBe("DATA_UNAVAILABLE");
  });
  it("incompatible units → DATA_UNAVAILABLE", () => {
    const s = computeGoldSilverSnapshot({
      goldPrice: 2000, silverPrice: 25,
      goldUnit: "USD/oz", silverUnit: "INR/kg",
      goldTimestamp: fresh, silverTimestamp: fresh, now: NOW,
    });
    expect(s.signal).toBe("DATA_UNAVAILABLE");
    expect(s.dataQuality).toBe("INCOMPATIBLE_UNITS");
  });
  it("stale data → no trade signal", () => {
    const s = computeGoldSilverSnapshot({
      goldPrice: 2000, silverPrice: 25,
      goldTimestamp: stale, silverTimestamp: stale, now: NOW,
    });
    expect(s.signal).toBe("DATA_UNAVAILABLE");
    expect(s.freshness).toBe("STALE");
    expect(s.ratio).not.toBeNull();
  });
  it("distanceFromNearestThreshold returns min gap", () => {
    expect(distanceFromNearestThreshold(60)).toBe(5);
    expect(distanceFromNearestThreshold(50)).toBe(5);
    expect(distanceFromNearestThreshold(80)).toBe(5);
  });
});