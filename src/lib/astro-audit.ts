// Client-safe audit types + tolerance classification for Phase 21.0B.
// Server-only comparison engine lives in `astro-audit.server.ts`.
//
// This module is intentionally isolated from the production astro engine —
// nothing here is used by live/backtest/replay/decision paths. It exists to
// score EagleBaba's astronomy against externally captured reference values
// (Swiss Ephemeris / Drik / MPanchang / Prokerala fixtures).

export type AuditMode =
  | "CURRENT_EAGLEBABA"
  | "SWISS_LAHIRI_MEAN_NODE"
  | "SWISS_LAHIRI_TRUE_NODE";

export type ToleranceStatus = "EXACT" | "ACCEPTABLE" | "WARNING" | "FAIL";

/** Longitude tolerance thresholds (degrees). See Phase 21.0B §6. */
export const LONGITUDE_TOLERANCE = {
  planet: { exact: 0.05, acceptable: 0.15, warning: 0.5 },
  moon:   { exact: 0.05, acceptable: 0.1,  warning: 0.25 },
} as const;

export function classifyLongitudeDiff(
  diffDeg: number,
  kind: "planet" | "moon" = "planet",
): ToleranceStatus {
  const d = Math.abs(diffDeg);
  const t = LONGITUDE_TOLERANCE[kind];
  if (d <= t.exact) return "EXACT";
  if (d <= t.acceptable) return "ACCEPTABLE";
  if (d <= t.warning) return "WARNING";
  return "FAIL";
}

/** Signed longitude difference, folded to (-180, 180]. */
export function signedLongitudeDiff(a: number, b: number): number {
  let d = a - b;
  d = ((((d + 180) % 360) + 360) % 360) - 180;
  return d;
}

export type ReferencePlanet = {
  planet: string;
  siderealLongitude: number; // 0..360, Lahiri sidereal
  sign: string;
  degreeInSign: number; // 0..30
  nakshatra: string;
  pada: number;
  retrograde: boolean;
  nodeMode?: "mean" | "true"; // Rahu/Ketu only
  source: string; // e.g. "swisseph-2.10.03 (Lahiri, mean node)"
};

export type ReferenceFixture = {
  fixtureVersion: string;
  capturedAt: string;   // ISO — when fixture was captured (not "now")
  timestampIso: string; // ISO — the astronomical instant being audited
  timezone: string;
  location: {
    label: string;
    latitude: number;
    longitude: number;
    elevationMeters: number;
  };
  referenceEngine: string; // e.g. "Swiss Ephemeris 2.10.03"
  ayanamshaMode: string;   // e.g. "Lahiri (Chitrapaksha)"
  ayanamsha: number;       // degrees at timestampIso
  nodeMode: "mean" | "true";
  moonConvention: "geocentric" | "topocentric";
  planets: ReferencePlanet[];
  notes?: string;
};

export type PlanetComparison = {
  planet: string;
  current: {
    siderealLongitude: number;
    sign: string;
    degreeInSign: number;
    nakshatra: string;
    pada: number;
    retrograde: boolean;
  };
  reference: ReferencePlanet;
  diffDeg: number;             // signed, folded
  diffArcsec: number;
  toleranceStatus: ToleranceStatus;
  signMatch: boolean;
  nakshatraMatch: boolean;
  padaMatch: boolean;
  retroMatch: boolean;
};

export type AyanamshaComparison = {
  current: number;
  reference: number;
  diffDeg: number;
  diffArcsec: number;
  toleranceStatus: ToleranceStatus;
};

export type LevelImpact = {
  planet: string;
  currentDegree: number;
  referenceDegree: number;
  currentLevels: { r1: number; r2: number; s1: number; s2: number };
  referenceLevels: { r1: number; r2: number; s1: number; s2: number };
  maxLevelDelta: number;
  anyChange: boolean;
};

export type AuditVerdict =
  | "KEEP_CURRENT_ENGINE"
  | "KEEP_CURRENT_ENGINE_WITH_DOCUMENTED_TOLERANCE"
  | "ADD_SWISS_EPHEMERIS_OPTIONAL_MODE"
  | "MIGRATE_TO_SWISS_LAHIRI_MEAN_NODE"
  | "MIGRATE_TO_SWISS_LAHIRI_TRUE_NODE"
  | "CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE";

export type AuditReport = {
  auditVersion: string;
  generatedAt: string;
  fixture: ReferenceFixture;
  ayanamsha: AyanamshaComparison;
  planets: PlanetComparison[];
  levelImpacts: LevelImpact[];
  summary: {
    totalPlanets: number;
    exact: number;
    acceptable: number;
    warning: number;
    fail: number;
    nakshatraMismatches: number;
    padaMismatches: number;
    retroMismatches: number;
    maxLevelDelta: number;
    levelsChanged: number;
  };
  verdict: AuditVerdict;
  verdictReason: string;
};

export const AUDIT_VERSION = "21.0B-1" as const;

/**
 * Derive a final recommendation from a single-fixture comparison. This is
 * deliberately conservative — a real production migration requires many
 * fixtures and knowledge of the original Gann source's node/moon convention
 * (see Phase 21.0B stop conditions).
 */
export function deriveVerdict(
  planets: PlanetComparison[],
  levelImpacts: LevelImpact[],
  originalSourceKnown = false,
): { verdict: AuditVerdict; reason: string } {
  if (planets.length === 0) {
    return {
      verdict: "CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE",
      reason: "No planet comparisons available in this fixture.",
    };
  }
  const failing = planets.filter((p) => p.toleranceStatus === "FAIL").length;
  const warning = planets.filter((p) => p.toleranceStatus === "WARNING").length;
  const maxDelta = levelImpacts.reduce(
    (m, l) => Math.max(m, l.maxLevelDelta),
    0,
  );
  if (!originalSourceKnown) {
    return {
      verdict: "CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE",
      reason:
        "Original Gann Nifty Astro node mode (Mean vs True) and Moon convention " +
        "(geocentric vs topocentric) are not documented in the reference fixture. " +
        "Per Phase 21.0B stop conditions, production astronomy must not be migrated " +
        "until the original methodology's conventions are confirmed.",
    };
  }
  if (failing === 0 && warning === 0 && maxDelta <= 1) {
    return {
      verdict: "KEEP_CURRENT_ENGINE",
      reason: `All ${planets.length} planet comparisons within EXACT/ACCEPTABLE tolerance and max level delta ≤ 1.`,
    };
  }
  if (failing === 0) {
    return {
      verdict: "KEEP_CURRENT_ENGINE_WITH_DOCUMENTED_TOLERANCE",
      reason: `No FAIL results; ${warning} WARNING result(s). Downstream max level delta = ${maxDelta}.`,
    };
  }
  return {
    verdict: "ADD_SWISS_EPHEMERIS_OPTIONAL_MODE",
    reason: `${failing} planet(s) exceed the 0.5° FAIL threshold; add Swiss mode as an audit-only option before considering migration.`,
  };
}
