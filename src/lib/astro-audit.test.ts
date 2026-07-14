import { describe, it, expect } from "vitest";
import {
  AUDIT_VERSION,
  classifyLongitudeDiff,
  deriveVerdict,
  inferAuditMode,
  PROVISIONAL_METHODOLOGY_DEFAULT,
  signedLongitudeDiff,
  LONGITUDE_TOLERANCE,
  type LevelImpact,
  type PlanetComparison,
  type ReferenceFixture,
} from "./astro-audit";
import { runAstroAudit } from "./astro-audit.server";
import { computeAstroPositions } from "./astro-engine.server";
import { computeGannAstroLevels } from "./astro-levels";

describe("Phase 21.0B · tolerance classification", () => {
  it("classifies planet longitude diffs correctly", () => {
    expect(classifyLongitudeDiff(0.01)).toBe("EXACT");
    expect(classifyLongitudeDiff(0.1)).toBe("ACCEPTABLE");
    expect(classifyLongitudeDiff(0.3)).toBe("WARNING");
    expect(classifyLongitudeDiff(0.9)).toBe("FAIL");
    expect(classifyLongitudeDiff(-0.6)).toBe("FAIL");
  });
  it("uses tighter Moon thresholds", () => {
    expect(classifyLongitudeDiff(0.08, "moon")).toBe("ACCEPTABLE");
    expect(classifyLongitudeDiff(0.2, "moon")).toBe("WARNING");
    expect(classifyLongitudeDiff(0.4, "moon")).toBe("FAIL");
  });
  it("thresholds match Phase 21.0B spec", () => {
    expect(LONGITUDE_TOLERANCE.planet).toEqual({ exact: 0.05, acceptable: 0.15, warning: 0.5 });
    expect(LONGITUDE_TOLERANCE.moon).toEqual({ exact: 0.05, acceptable: 0.1, warning: 0.25 });
  });
});

describe("Phase 21.0B · signedLongitudeDiff wrap safety", () => {
  it("folds to (-180, 180]", () => {
    expect(signedLongitudeDiff(359.9, 0.1)).toBeCloseTo(-0.2, 6);
    expect(signedLongitudeDiff(0.1, 359.9)).toBeCloseTo(0.2, 6);
    expect(signedLongitudeDiff(100, 100)).toBe(0);
  });
});

describe("Phase 21.0B · deriveVerdict", () => {
  const mkP = (status: PlanetComparison["toleranceStatus"]): PlanetComparison =>
    ({ toleranceStatus: status } as unknown as PlanetComparison);
  const zeroImpact: LevelImpact[] = [];

  it("returns CANNOT_DETERMINE with no planets", () => {
    const v = deriveVerdict([], [], true);
    expect(v.verdict).toBe("CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE");
    expect(v.evidence).toBe("INFERENCE");
  });
  it("returns CANNOT_DETERMINE when original source unknown (default)", () => {
    const v = deriveVerdict([mkP("EXACT")], zeroImpact);
    expect(v.verdict).toBe("CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE");
    expect(v.evidence).toBe("HYPOTHESIS");
    expect(v.reason).toMatch(/PROVISIONAL/);
  });
  it("KEEP_CURRENT when clean and source known", () => {
    const v = deriveVerdict([mkP("EXACT"), mkP("ACCEPTABLE")], zeroImpact, true);
    expect(v.verdict).toBe("KEEP_CURRENT_ENGINE");
    expect(v.evidence).toBe("BACKTEST_RESULT");
  });
  it("KEEP_CURRENT_WITH_TOLERANCE on WARNING but no FAIL", () => {
    const v = deriveVerdict([mkP("WARNING"), mkP("EXACT")], zeroImpact, true);
    expect(v.verdict).toBe("KEEP_CURRENT_ENGINE_WITH_DOCUMENTED_TOLERANCE");
    expect(v.evidence).toBe("BACKTEST_RESULT");
  });
  it("ADD_SWISS on FAIL", () => {
    const v = deriveVerdict([mkP("FAIL"), mkP("EXACT")], zeroImpact, true);
    expect(v.verdict).toBe("ADD_SWISS_EPHEMERIS_OPTIONAL_MODE");
    expect(v.evidence).toBe("INFERENCE");
  });
});

describe("Phase 21.0B · provisional methodology default", () => {
  it("is labelled PROVISIONAL, not a proven Gann convention", () => {
    expect(PROVISIONAL_METHODOLOGY_DEFAULT.status).toBe("PROVISIONAL METHODOLOGY DEFAULT");
    expect(PROVISIONAL_METHODOLOGY_DEFAULT.nodeMode).toBe("mean");
    expect(PROVISIONAL_METHODOLOGY_DEFAULT.moonConvention).toBe("geocentric");
    expect(PROVISIONAL_METHODOLOGY_DEFAULT.ayanamsha).toBe("Lahiri (Chitrapaksha)");
  });
});

describe("Phase 21.0B · inferAuditMode", () => {
  const base = {
    fixtureVersion: "x",
    capturedAt: "2026-01-01T00:00:00Z",
    timestampIso: "2024-01-01T03:30:00Z",
    timezone: "Asia/Kolkata",
    location: { label: "Mumbai", latitude: 19, longitude: 72, elevationMeters: 14 },
    ayanamshaMode: "Lahiri",
    ayanamsha: 24,
    planets: [] as ReferenceFixture["planets"],
  };
  const f = (
    engine: string,
    node: "mean" | "true",
    moon: "geocentric" | "topocentric",
  ): ReferenceFixture => ({
    ...base,
    referenceEngine: engine,
    nodeMode: node,
    moonConvention: moon,
  });

  it("EagleBaba self-baseline → CURRENT_EAGLEBABA_MEAN_GEOCENTRIC", () => {
    expect(inferAuditMode(f("self-baseline (EagleBaba current)", "mean", "geocentric")))
      .toBe("CURRENT_EAGLEBABA_MEAN_GEOCENTRIC");
  });
  it("Swiss mean geocentric", () => {
    expect(inferAuditMode(f("Swiss Ephemeris 2.10", "mean", "geocentric")))
      .toBe("SWISS_LAHIRI_MEAN_GEOCENTRIC");
  });
  it("Swiss true geocentric", () => {
    expect(inferAuditMode(f("Swiss Ephemeris 2.10", "true", "geocentric")))
      .toBe("SWISS_LAHIRI_TRUE_GEOCENTRIC");
  });
  it("Swiss mean topocentric", () => {
    expect(inferAuditMode(f("Swiss Ephemeris 2.10", "mean", "topocentric")))
      .toBe("SWISS_LAHIRI_MEAN_TOPOCENTRIC_MUMBAI");
  });
});

describe("Phase 21.0B · runAstroAudit end-to-end", () => {
  const when = new Date(Date.UTC(2024, 0, 1, 3, 30, 0));
  const pos = computeAstroPositions(when);
  const fixture: ReferenceFixture = {
    fixtureVersion: "self-2024-01-01T0330Z",
    capturedAt: "2026-07-14T00:00:00.000Z",
    timestampIso: when.toISOString(),
    timezone: "Asia/Kolkata",
    location: { label: "Mumbai, IN", latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
    referenceEngine: "self-baseline (EagleBaba current)",
    ayanamshaMode: "Lahiri linear (self)",
    ayanamsha: pos.ayanamsa,
    nodeMode: "mean",
    moonConvention: "geocentric",
    planets: pos.planets.map((p) => ({
      planet: p.planet,
      siderealLongitude: p.absDegree,
      sign: p.sign,
      degreeInSign: p.degree,
      nakshatra: p.nakshatra,
      pada: p.pada,
      retrograde: p.retro,
      source: "self-baseline",
    })),
    notes: "self-baseline; original source: NOT confirmed",
  };

  const report = runAstroAudit(fixture);

  it("reports audit version and preserves the fixture", () => {
    expect(report.auditVersion).toBe(AUDIT_VERSION);
    expect(report.fixture.fixtureVersion).toBe(fixture.fixtureVersion);
    expect(report.mode).toBe("CURRENT_EAGLEBABA_MEAN_GEOCENTRIC");
    expect(report.provisionalDefault.status).toBe("PROVISIONAL METHODOLOGY DEFAULT");
  });
  it("all 9 planets EXACT against self-baseline", () => {
    expect(report.summary.totalPlanets).toBe(9);
    expect(report.summary.exact).toBe(9);
    expect(report.summary.fail).toBe(0);
    expect(report.summary.nakshatraMismatches).toBe(0);
    expect(report.summary.padaMismatches).toBe(0);
    expect(report.summary.retroMismatches).toBe(0);
  });
  it("downstream level deltas are all zero when astronomy matches", () => {
    expect(report.summary.maxLevelDelta).toBe(0);
    expect(report.summary.levelsChanged).toBe(0);
  });
  it("verdict is CANNOT_DETERMINE without original-source confirmation", () => {
    expect(report.verdict).toBe("CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE");
    expect(report.verdictEvidence).toBe("HYPOTHESIS");
  });
});

describe("Phase 21.0B · level-impact math", () => {
  it("<1° drift bounds Gann level delta to ≤1 point after rounding", () => {
    const cycles = { base: 67, upper: 24120, lower: 23760 };
    const a = computeGannAstroLevels(cycles, 16.32);
    const b = computeGannAstroLevels(cycles, 16.32 + 0.4);
    const deltas = [
      Math.abs(a.r1 - b.r1),
      Math.abs(a.r2 - b.r2),
      Math.abs(a.s1 - b.s1),
      Math.abs(a.s2 - b.s2),
    ];
    expect(Math.max(...deltas)).toBeLessThanOrEqual(1);
  });
});