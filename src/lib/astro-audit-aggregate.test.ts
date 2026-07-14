import { describe, it, expect } from "vitest";
import {
  aggregateByMode,
  boundaryRisks,
  coverageStatus,
  MIN_FIXTURES_FOR_PRODUCTION_VERDICT,
  planetComparisonCsv,
} from "./astro-audit-aggregate";
import type { AuditReport, PlanetComparison } from "./astro-audit";

function mkComp(planet: string, over: Partial<PlanetComparison> = {}): PlanetComparison {
  return {
    planet,
    current: { siderealLongitude: 100, sign: "Cancer", degreeInSign: 10, nakshatra: "Pushya", pada: 1, retrograde: false },
    reference: { planet, siderealLongitude: 100, sign: "Cancer", degreeInSign: 10, nakshatra: "Pushya", pada: 1, retrograde: false, source: "s" },
    diffDeg: 0, diffArcsec: 0, toleranceStatus: "EXACT",
    signMatch: true, nakshatraMatch: true, padaMatch: true, retroMatch: true,
    ...over,
  };
}

function mkReport(mode: AuditReport["mode"], planets: PlanetComparison[]): AuditReport {
  return {
    auditVersion: "21.0B-2",
    generatedAt: "2026-07-14T00:00:00Z",
    mode,
    provisionalDefault: { status: "PROVISIONAL METHODOLOGY DEFAULT", nodeMode: "mean", moonConvention: "geocentric", ayanamsha: "Lahiri (Chitrapaksha)", rationale: "" },
    fixture: {
      fixtureVersion: `f-${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: "2026-01-01T00:00:00Z", timestampIso: "2024-01-01T03:30:00Z",
      timezone: "Asia/Kolkata",
      location: { label: "Mumbai", latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
      referenceEngine: "test", ayanamshaMode: "Lahiri", ayanamsha: 24,
      nodeMode: "mean", moonConvention: "geocentric", planets: [],
    },
    ayanamsha: { current: 24, reference: 24, diffDeg: 0, diffArcsec: 0, toleranceStatus: "EXACT" },
    planets,
    levelImpacts: planets.map((p) => ({
      planet: p.planet, currentDegree: 10, referenceDegree: 10,
      currentLevels: { r1: 1, r2: 2, s1: 3, s2: 4 },
      referenceLevels: { r1: 1, r2: 2, s1: 3, s2: 4 },
      maxLevelDelta: 0, anyChange: false,
    })),
    summary: { totalPlanets: planets.length, exact: planets.length, acceptable: 0, warning: 0, fail: 0, nakshatraMismatches: 0, padaMismatches: 0, retroMismatches: 0, maxLevelDelta: 0, levelsChanged: 0 },
    verdict: "CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE",
    verdictEvidence: "HYPOTHESIS",
    verdictReason: "",
  };
}

describe("Phase 21.0C · aggregates & coverage", () => {
  it("aggregates per-mode per-planet stats", () => {
    const reports = [
      mkReport("SWISS_LAHIRI_MEAN_GEOCENTRIC", [mkComp("Sun"), mkComp("Moon", { diffDeg: 0.2, toleranceStatus: "WARNING" })]),
      mkReport("SWISS_LAHIRI_MEAN_GEOCENTRIC", [mkComp("Sun", { diffDeg: 0.1, toleranceStatus: "ACCEPTABLE" })]),
    ];
    const agg = aggregateByMode(reports);
    expect(agg).toHaveLength(1);
    expect(agg[0].mode).toBe("SWISS_LAHIRI_MEAN_GEOCENTRIC");
    expect(agg[0].fixtures).toBe(2);
    expect(agg[0].moon?.warningPct).toBe(100);
  });
  it("coverage enforces 20-fixture minimum stop condition", () => {
    const cov = coverageStatus([mkReport("SWISS_LAHIRI_MEAN_GEOCENTRIC", [mkComp("Sun")])]);
    expect(cov.meetsMinimum).toBe(false);
    expect(MIN_FIXTURES_FOR_PRODUCTION_VERDICT).toBe(20);
  });
  it("boundary risks flag nakshatra / pada / retro / level changes", () => {
    const r = mkReport("SWISS_LAHIRI_MEAN_GEOCENTRIC", [
      mkComp("Sun", { nakshatraMatch: false }),
      mkComp("Moon", { padaMatch: false }),
    ]);
    const risks = boundaryRisks([r]);
    expect(risks.length).toBe(2);
    expect(risks.some((x) => x.nakshatraChange)).toBe(true);
    expect(risks.some((x) => x.padaChange)).toBe(true);
  });
  it("planetComparisonCsv is deterministic and header-first", () => {
    const csv = planetComparisonCsv([mkReport("SWISS_LAHIRI_MEAN_GEOCENTRIC", [mkComp("Sun")])]);
    expect(csv.split("\n")[0]).toMatch(/^fixture,mode,planet,/);
    expect(csv.split("\n")).toHaveLength(2);
  });
});