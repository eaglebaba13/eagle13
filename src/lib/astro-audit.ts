// Client-safe audit types + tolerance classification for Phase 21.0B.
// Server-only comparison engine lives in `astro-audit.server.ts`.
//
// This module is intentionally isolated from the production astro engine —
// nothing here is used by live/backtest/replay/decision paths. It exists to
// score EagleBaba's astronomy against externally captured reference values
// (Swiss Ephemeris / Drik / MPanchang / Prokerala fixtures).

/**
 * Phase 21.0B audit modes. Every fixture MUST declare exactly one so
 * comparisons never mix node/Moon conventions.
 *
 * Reference-side conventions are HYPOTHESES until supported by the original
 * Gann Nifty Astro source, an original spreadsheet, an exact historical
 * ephemeris edition, or deterministic backtest evidence.
 */
export type AuditMode =
  | "CURRENT_EAGLEBABA_MEAN_GEOCENTRIC"
  | "SWISS_LAHIRI_MEAN_GEOCENTRIC"
  | "SWISS_LAHIRI_TRUE_GEOCENTRIC"
  | "SWISS_LAHIRI_MEAN_TOPOCENTRIC_MUMBAI";

/**
 * PROVISIONAL METHODOLOGY DEFAULT (not "proven original Gann method").
 *
 * - Node: MEAN
 * - Moon: GEOCENTRIC
 * - Ayanamsha: LAHIRI / CHITRAPAKSHA
 *
 * Chosen to preserve current EagleBaba outputs and match Drik Panchang's
 * default Mean Rahu/Ketu. Do NOT cite this as a historically verified Gann
 * convention.
 */
export const PROVISIONAL_METHODOLOGY_DEFAULT = {
  status: "PROVISIONAL METHODOLOGY DEFAULT" as const,
  nodeMode: "mean" as const,
  moonConvention: "geocentric" as const,
  ayanamsha: "Lahiri (Chitrapaksha)" as const,
  rationale:
    "Preserves current EagleBaba methodology; matches Drik Panchang default; " +
    "avoids changing historical outputs before evidence exists.",
} as const;

/**
 * Evidence tier for every claim surfaced in an audit report. Reports MUST
 * tag each statement so readers can distinguish measurement from folklore.
 */
export type EvidenceTier =
  | "VERIFIED_FACT"      // reproducible + cited (original source / spreadsheet)
  | "DOCUMENTED_DEFAULT" // current production choice, no source claim
  | "INFERENCE"          // logically follows from measured data
  | "HYPOTHESIS"         // plausible, not yet supported by evidence
  | "BACKTEST_RESULT";   // deterministic backtest / replay measurement

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
  mode: AuditMode;
  provisionalDefault: typeof PROVISIONAL_METHODOLOGY_DEFAULT;
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
  verdictEvidence: EvidenceTier;
  verdictReason: string;
};

export const AUDIT_VERSION = "21.0B-2" as const;

/**
 * Infer an audit mode from a fixture's declared conventions. Fixtures MUST
 * declare `nodeMode` and `moonConvention`; the reference engine must be Swiss
 * or explicitly labelled EagleBaba.
 */
export function inferAuditMode(f: ReferenceFixture): AuditMode {
  const isEagle = /eaglebaba|self-baseline/i.test(f.referenceEngine);
  if (isEagle) return "CURRENT_EAGLEBABA_MEAN_GEOCENTRIC";
  if (f.nodeMode === "true") return "SWISS_LAHIRI_TRUE_GEOCENTRIC";
  if (f.moonConvention === "topocentric") return "SWISS_LAHIRI_MEAN_TOPOCENTRIC_MUMBAI";
  return "SWISS_LAHIRI_MEAN_GEOCENTRIC";
}

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
): { verdict: AuditVerdict; reason: string; evidence: EvidenceTier } {
  if (planets.length === 0) {
    return {
      verdict: "CANNOT_DETERMINE_WITHOUT_ORIGINAL_SOURCE",
      reason: "No planet comparisons available in this fixture.",
      evidence: "INFERENCE",
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
        "HYPOTHESIS: reference fixture does not cite an original Gann Nifty Astro " +
        "source. Node mode (Mean vs True) and Moon convention (geocentric vs " +
        "topocentric) remain unverified. Per Phase 21.0B stop conditions, the " +
        "production default (PROVISIONAL: Mean node, geocentric Moon, Lahiri) " +
        "must not migrate without cited source evidence, a matching original " +
        "spreadsheet, or a controlled historical backtest showing material and " +
        "stable improvement.",
      evidence: "HYPOTHESIS",
    };
  }
  if (failing === 0 && warning === 0 && maxDelta <= 1) {
    return {
      verdict: "KEEP_CURRENT_ENGINE",
      reason:
        `BACKTEST_RESULT: all ${planets.length} planet comparisons within ` +
        `EXACT/ACCEPTABLE tolerance and max Gann level delta ≤ 1.`,
      evidence: "BACKTEST_RESULT",
    };
  }
  if (failing === 0) {
    return {
      verdict: "KEEP_CURRENT_ENGINE_WITH_DOCUMENTED_TOLERANCE",
      reason:
        `BACKTEST_RESULT: no FAIL results; ${warning} WARNING result(s). ` +
        `Downstream max Gann level delta = ${maxDelta}.`,
      evidence: "BACKTEST_RESULT",
    };
  }
  return {
    verdict: "ADD_SWISS_EPHEMERIS_OPTIONAL_MODE",
    reason:
      `BACKTEST_RESULT: ${failing} planet(s) exceed the 0.5° FAIL threshold. ` +
      `Recommendation is INFERENCE — add Swiss mode as an audit-only option ` +
      `before considering any production migration.`,
    evidence: "INFERENCE",
  };
}
