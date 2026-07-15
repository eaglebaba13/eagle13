import { describe, it, expect } from "vitest";
import { detectTouches, type TimedCandle5m } from "./gann-intraday-touch";
import type { RankedLevel } from "./gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const lvl = (over: Partial<RankedLevel> = {}): RankedLevel => ({
  planet: "Sun",
  absoluteDegree: 70,
  sourceLevel: "L2",
  value: 18430,
  previousClose: 18665,
  upperMultiple: 18720,
  lowerMultiple: 18360,
  distanceFromClose: 235,
  side: "SUPPORT",
  tradeBias: "BUY",
  safety: "SAFE",
  formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  hasSun: true,
  hasMoon: false,
  sunMoonPriority: true,
  clusterCount: 1,
  clusterPlanets: ["Sun"],
  exact360Distance: 70,
  exact360Confluence: false,
  pivotConfluence: "WEAK",
  nearestPivotDistance: 10,
  ...over,
});

const candle = (t: string, o: number, h: number, l: number, c: number): TimedCandle5m => ({
  timeIst: t,
  openTimeMs: new Date(t.replace("+05:30", "Z")).getTime() - 5.5 * 3600 * 1000,
  open: o,
  high: h,
  low: l,
  close: c,
});

describe("Stage 4 · touch detection", () => {
  it("registers a contained touch on the first crossing candle", () => {
    const t = detectTouches(
      "NIFTY50",
      [lvl()],
      [
        candle("2026-07-15T09:15:00+05:30", 18500, 18510, 18490, 18500),
        candle("2026-07-15T09:20:00+05:30", 18470, 18475, 18420, 18425),
      ],
    );
    expect(t[0].firstTouchIndex).toBe(1);
    expect(t[0].containedTouch).toBe(true);
    expect(t[0].distanceAtTouch).toBe(0);
  });

  it("rejects a near-miss beyond NIFTY tolerance (15 pt)", () => {
    const t = detectTouches(
      "NIFTY50",
      [lvl()],
      [candle("2026-07-15T09:20:00+05:30", 18470, 18475, 18450, 18455)],
    );
    // low=18450 vs level 18430 → distance 20 > 15 tolerance
    expect(t[0].firstTouchIndex).toBeNull();
  });

  it("accepts a near-touch inside tolerance", () => {
    const t = detectTouches(
      "NIFTY50",
      [lvl()],
      [candle("2026-07-15T09:20:00+05:30", 18450, 18455, 18442, 18448)],
    );
    // low 18442, level 18430, distance 12 ≤ 15 → touched
    expect(t[0].firstTouchIndex).toBe(0);
    expect(t[0].containedTouch).toBe(false);
  });

  it("uses BANKNIFTY 30 pt tolerance", () => {
    const t = detectTouches(
      "BANKNIFTY",
      [lvl({ value: 43560 })],
      [candle("2026-07-15T09:20:00+05:30", 43600, 43610, 43585, 43590)],
    );
    expect(t[0].firstTouchIndex).toBe(0);
  });
});