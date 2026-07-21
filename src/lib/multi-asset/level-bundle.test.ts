import { describe, it, expect } from "vitest";
import { buildLevelBundle } from "./level-bundle";
import { getInstrument } from "./instruments";
import type { SelectedCandle } from "./daily-candle";

const candle: SelectedCandle = {
  open: 100, high: 110, low: 95, close: 105, volume: 1000,
  candleOpenTime: "2026-07-21T00:00:00.000Z",
  candleCloseTime: "2026-07-22T00:00:00.000Z",
  providerTimezone: "Asia/Kolkata",
  reportingTimezone: "Asia/Kolkata",
  ageHours: 4,
  freshness: "FRESH",
  session24x7: false,
};

describe("buildLevelBundle", () => {
  it("computes pivot levels for NIFTY", () => {
    const b = buildLevelBundle(getInstrument("NIFTY"), candle);
    expect(b.pivot.pp).toBeCloseTo(103.33, 1);
    expect(b.pivot.r3).toBeGreaterThan(b.pivot.r2);
    expect(b.pivot.s3).toBeLessThan(b.pivot.s2);
  });

  it("emits Gann levels for NIFTY", () => {
    const b = buildLevelBundle(getInstrument("NIFTY"), candle);
    expect(b.gann.status).toBe("FRESH");
    expect(b.gann.up).not.toBeNull();
    expect(b.gann.down).not.toBeNull();
  });

  it("marks Gann UNAVAILABLE for metals/crypto per Phase 44B spec", () => {
    for (const id of ["GOLD","SILVER","XAUUSD","XAGUSD","BTC","ETH"] as const) {
      const b = buildLevelBundle(getInstrument(id), { ...candle, session24x7: true });
      expect(b.gann.status).toBe("UNAVAILABLE");
      expect(b.gann.up).toBeNull();
    }
  });

  it("marks Astro UNAVAILABLE for non-index assets", () => {
    const b = buildLevelBundle(getInstrument("BTC"), { ...candle, session24x7: true });
    expect(b.astro.status).toBe("UNAVAILABLE");
    expect(b.astro.levels).toEqual([]);
  });
});