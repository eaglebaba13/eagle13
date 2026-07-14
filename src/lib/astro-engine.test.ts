import { describe, it, expect } from "vitest";
import { computeAstroPositions } from "./astro-engine.server";
import { NAKSHATRAS, SIGNS } from "./astro-constants";

// Deterministic reference instant: 2024-01-01 03:30 UTC (09:00 IST).
const REF = new Date(Date.UTC(2024, 0, 1, 3, 30, 0));

describe("computeAstroPositions — planetary positions", () => {
  const pos = computeAstroPositions(REF);

  it("returns all 9 planets with valid sidereal ranges", () => {
    expect(pos.planets).toHaveLength(9);
    for (const p of pos.planets) {
      expect(p.absDegree).toBeGreaterThanOrEqual(0);
      expect(p.absDegree).toBeLessThan(360);
      expect(p.degree).toBeGreaterThanOrEqual(0);
      expect(p.degree).toBeLessThan(30);
      expect(SIGNS).toContain(p.sign);
      expect(NAKSHATRAS).toContain(p.nakshatra);
      expect(p.pada).toBeGreaterThanOrEqual(1);
      expect(p.pada).toBeLessThanOrEqual(4);
    }
  });

  it("keeps Ketu exactly opposite Rahu (180° apart)", () => {
    const rahu = pos.planets.find((p) => p.planet === "Rahu")!;
    const ketu = pos.planets.find((p) => p.planet === "Ketu")!;
    const diff = ((ketu.absDegree - rahu.absDegree + 360) % 360);
    expect(diff).toBeCloseTo(180, 1);
  });

  it("produces a plausible Lahiri ayanamsa (~24° for 2024)", () => {
    expect(pos.ayanamsa).toBeGreaterThan(23.5);
    expect(pos.ayanamsa).toBeLessThan(24.5);
  });

  it("is deterministic for a fixed instant", () => {
    const again = computeAstroPositions(REF);
    expect(again.moonSign).toBe(pos.moonSign);
    expect(again.planets[0].absDegree).toBe(pos.planets[0].absDegree);
  });

  it("marks retrograde planets with negative speed", () => {
    for (const p of pos.planets) {
      expect(p.retro).toBe(p.speed < 0);
      expect(p.motion).toBe(p.retro ? "Retrograde" : "Direct");
    }
    expect(pos.retroCount).toBe(pos.planets.filter((p) => p.retro).length);
  });
});

describe("computeAstroPositions — moon cycle", () => {
  const pos = computeAstroPositions(REF);
  const mp = pos.moonPhase;

  it("reports illumination between 0 and 100", () => {
    expect(mp.illumination).toBeGreaterThanOrEqual(0);
    expect(mp.illumination).toBeLessThanOrEqual(100);
  });
  it("reports elongation within 0..360", () => {
    expect(mp.elongation).toBeGreaterThanOrEqual(0);
    expect(mp.elongation).toBeLessThanOrEqual(360);
  });
  it("schedules the next new and full moon within a synodic month", () => {
    expect(mp.daysToNewMoon).toBeGreaterThanOrEqual(0);
    expect(mp.daysToNewMoon).toBeLessThanOrEqual(30);
    expect(mp.daysToFullMoon).toBeGreaterThanOrEqual(0);
    expect(mp.daysToFullMoon).toBeLessThanOrEqual(30);
    expect(new Date(mp.nextNewMoon).getTime()).toBeGreaterThan(REF.getTime());
    expect(new Date(mp.nextFullMoon).getTime()).toBeGreaterThan(REF.getTime());
  });
  it("gives a recognized phase name", () => {
    expect([
      "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
      "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent",
    ]).toContain(mp.phaseName);
  });
});

describe("computeAstroPositions — bull/bear/retro counts", () => {
  const pos = computeAstroPositions(REF);
  it("keeps counts consistent with the planet flags", () => {
    expect(pos.bullCount).toBe(pos.planets.filter((p) => p.bull).length);
    expect(pos.bearCount).toBe(pos.planets.filter((p) => p.bear).length);
    expect(pos.bullRetroCount).toBe(
      pos.planets.filter((p) => p.retro && p.retroBias === "bull").length,
    );
    expect(pos.bearRetroCount).toBe(
      pos.planets.filter((p) => p.retro && p.retroBias === "bear").length,
    );
  });
});