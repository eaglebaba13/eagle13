// Immutable golden fixtures for GANN_NIFTY_ASTRO_V1_1.
// Fixtures MUST NOT be regenerated automatically — changes require approval.
import { describe, it, expect } from "vitest";
import {
  computeCycles,
  computeGannAstroLevels,
  computeAstroLevels,
} from "./astro-levels";
import fixture from "./__fixtures__/gann-reference-24176.json";

describe("golden fixture — gann-reference-24176.json", () => {
  const cycles = computeCycles(fixture.input.previousClose);
  it("cycles match", () => {
    expect(cycles).toEqual(fixture.expectedCycles);
  });
  for (const p of fixture.planets) {
    it(`${p.planet} @ ${p.degree}° matches golden R1/R2/S1/S2`, () => {
      expect(computeGannAstroLevels(cycles, p.degree)).toEqual({
        r1: p.r1, r2: p.r2, s1: p.s1, s2: p.s2,
      });
    });
  }
});

describe("cross-module consistency (Phase 21.0 §9)", () => {
  // All consumers (astro.functions, live-astro.functions, backtest, replay)
  // route through computeAstroLevels → computeGannAstroLevels. This test
  // pins that invariant so a future divergence fails loudly.
  it("computeAstroLevels delegates to computeGannAstroLevels", () => {
    const cycles = computeCycles(24500);
    for (const d of [0, 1.5, 12.7, 29.999]) {
      expect(computeAstroLevels(cycles, d)).toEqual(computeGannAstroLevels(cycles, d));
    }
  });
});

describe("additional cycle-boundary fixture", () => {
  it("exact 360-multiple previous close: cycles resolve cleanly", () => {
    // prevClose exactly on a 360 boundary
    const c = computeCycles(360 * 68); // 24480
    expect(c).toEqual({ base: 68, upper: 24480, lower: 24120 });
    // Sample planet at 0.5° verifies rounding half-up on positive side.
    expect(computeGannAstroLevels(c, 0.5)).toEqual({
      r1: 24481, r2: 24480, s1: 24121, s2: 24120,
    });
  });
  it("decimal previous close still yields correct base", () => {
    const c = computeCycles(24176.75);
    expect(c).toEqual({ base: 67, upper: 24120, lower: 23760 });
  });
});