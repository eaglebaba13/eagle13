import { describe, it, expect } from "vitest";
import {
  findDuplicates,
  groupComparable,
  validateFixture,
  type ExtendedReferenceFixture,
} from "./astro-fixture-schema";

const mk = (over: Partial<ExtendedReferenceFixture> = {}): ExtendedReferenceFixture => ({
  fixtureVersion: "test-1",
  capturedAt: "2026-07-14T00:00:00.000Z",
  timestampIso: "2024-01-01T03:30:00.000Z",
  timezone: "Asia/Kolkata",
  location: { label: "Mumbai", latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
  referenceEngine: "Swiss Ephemeris 2.10",
  ayanamshaMode: "Lahiri",
  ayanamsha: 24.15,
  nodeMode: "mean",
  moonConvention: "geocentric",
  planets: [{
    planet: "Sun", siderealLongitude: 256.32, sign: "Sagittarius", degreeInSign: 16.32,
    nakshatra: "Purva Ashadha", pada: 3, retrograde: false, source: "swiss",
  }],
  ...over,
});

describe("Phase 21.0C · fixture schema validation", () => {
  it("accepts a well-formed fixture", () => {
    const v = validateFixture(mk());
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
  });
  it("rejects missing conventions (no silent inference)", () => {
    const v = validateFixture(mk({ nodeMode: undefined as unknown as "mean" }));
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.path === "nodeMode")).toBe(true);
  });
  it("rejects out-of-range longitude", () => {
    const v = validateFixture(mk({
      planets: [{ planet: "Sun", siderealLongitude: 400, sign: "Sagittarius", degreeInSign: 10, nakshatra: "Purva Ashadha", pada: 3, retrograde: false, source: "s" }],
    }));
    expect(v.ok).toBe(false);
  });
  it("rejects unknown nakshatra", () => {
    const v = validateFixture(mk({
      planets: [{ planet: "Sun", siderealLongitude: 256, sign: "Sagittarius", degreeInSign: 16, nakshatra: "Bogus", pada: 3, retrograde: false, source: "s" }],
    }));
    expect(v.ok).toBe(false);
  });
  it("warns when Rahu/Ketu not opposite", () => {
    const v = validateFixture(mk({
      planets: [
        { planet: "Rahu", siderealLongitude: 100, sign: "Cancer", degreeInSign: 10, nakshatra: "Pushya", pada: 1, retrograde: true, source: "s" },
        { planet: "Ketu", siderealLongitude: 250, sign: "Sagittarius", degreeInSign: 10, nakshatra: "Purva Ashadha", pada: 1, retrograde: true, source: "s" },
      ],
    }));
    expect(v.warnings.some((w) => w.path === "planets.rahu_ketu")).toBe(true);
  });
  it("detects duplicate fixture IDs and source|timestamp|mode combos", () => {
    const a = mk({ fixtureVersion: "dup" });
    const b = mk({ fixtureVersion: "dup" });
    const dup = findDuplicates([a, b]);
    expect(dup.ids).toContain("dup");
    expect(dup.combos.length).toBe(1);
  });
  it("groups comparable fixtures and never mixes conventions", () => {
    const a = mk({ fixtureVersion: "a", nodeMode: "mean" });
    const b = mk({ fixtureVersion: "b", nodeMode: "true" });
    const g = groupComparable([a, b]);
    expect(g.size).toBe(2);
  });
});