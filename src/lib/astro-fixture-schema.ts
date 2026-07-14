// Phase 21.0C · Extended reference-fixture schema, validation, normalization.
// Additive over Phase 21.0B `ReferenceFixture` — production astronomy unchanged.
//
// Adds provenance metadata (sourceUrl, evidenceTier, originalSourceConfirmed),
// per-planet fields (tropicalLongitude, speed, motion), and Panchang capture.
// The Phase 21.0B audit engine only reads the base shape; extended fields are
// preserved verbatim for reporting and never inferred.

import { NAKSHATRAS, SIGNS } from "./astro-constants";
import type { EvidenceTier, ReferenceFixture, ReferencePlanet } from "./astro-audit";

export type FixtureSource =
  | "SWISS_EPHEMERIS"
  | "DRIK_PANCHANG"
  | "MPANCHANG"
  | "PROKERALA"
  | "OTHER";

export type OriginalSourceEvidence =
  | "UNKNOWN"
  | "CONFIRMED_MEAN_GEOCENTRIC"
  | "CONFIRMED_TRUE_GEOCENTRIC"
  | "CONFIRMED_MEAN_TOPOCENTRIC"
  | "CONFIRMED_TRUE_TOPOCENTRIC";

export type ExtendedReferencePlanet = ReferencePlanet & {
  tropicalLongitude?: number | null;
  speed?: number | null;
  motion?: "direct" | "retrograde" | "stationary" | null;
};

export type ExtendedReferenceFixture = ReferenceFixture & {
  fixtureId?: string;
  source?: FixtureSource;
  sourceUrl?: string;
  timestampIst?: string;
  timestampUtc?: string;
  evidenceTier?: EvidenceTier;
  originalSourceEvidence?: OriginalSourceEvidence;
  originalSourceConfirmed?: boolean;
  capture?: "manual" | "automated";
  panchang?: {
    tithi?: string | null;
    yoga?: string | null;
    karana?: string | null;
    sunrise?: string | null;
    sunset?: string | null;
  };
};

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
};

const PLANET_NAMES = new Set([
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Rahu", "Ketu",
]);

function isFiniteInRange(v: unknown, lo: number, hi: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
}

function isIso(s: unknown): s is string {
  return typeof s === "string" && !Number.isNaN(Date.parse(s));
}

/** Validate one fixture. Missing conventions are ERRORS, not silent inference. */
export function validateFixture(f: ExtendedReferenceFixture): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const push = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!f.fixtureVersion) push("fixtureVersion", "required");
  if (!isIso(f.timestampIso)) push("timestampIso", "invalid ISO timestamp");
  if (!isIso(f.capturedAt)) push("capturedAt", "invalid ISO timestamp");
  if (!f.timezone) push("timezone", "required (e.g. Asia/Kolkata)");
  if (!f.location) push("location", "required");
  else {
    if (!isFiniteInRange(f.location.latitude, -90, 90)) push("location.latitude", "out of range");
    if (!isFiniteInRange(f.location.longitude, -180, 180)) push("location.longitude", "out of range");
    if (!isFiniteInRange(f.location.elevationMeters, -500, 9000)) push("location.elevationMeters", "out of range");
  }
  if (!f.referenceEngine) push("referenceEngine", "required");
  if (!f.ayanamshaMode) push("ayanamshaMode", "required (declare Lahiri/other)");
  if (!isFiniteInRange(f.ayanamsha, 0, 30)) push("ayanamsha", "expected 0..30°");
  if (f.nodeMode !== "mean" && f.nodeMode !== "true") push("nodeMode", "must be 'mean' or 'true'");
  if (f.moonConvention !== "geocentric" && f.moonConvention !== "topocentric") {
    push("moonConvention", "must be 'geocentric' or 'topocentric'");
  }

  if (!Array.isArray(f.planets) || f.planets.length === 0) {
    push("planets", "at least one planet required");
  } else {
    const seen = new Set<string>();
    f.planets.forEach((p, i) => {
      const base = `planets[${i}]`;
      if (!p.planet || !PLANET_NAMES.has(p.planet)) push(`${base}.planet`, `unknown planet '${p.planet}'`);
      if (seen.has(p.planet)) push(`${base}.planet`, `duplicate planet '${p.planet}'`);
      seen.add(p.planet);
      if (!isFiniteInRange(p.siderealLongitude, 0, 360)) push(`${base}.siderealLongitude`, "expected 0..360°");
      if (!isFiniteInRange(p.degreeInSign, 0, 30)) push(`${base}.degreeInSign`, "expected 0..30°");
      if (!isFiniteInRange(p.pada, 1, 4)) push(`${base}.pada`, "expected 1..4");
      if (!SIGNS.includes(p.sign as (typeof SIGNS)[number])) push(`${base}.sign`, `unknown sign '${p.sign}'`);
      if (!NAKSHATRAS.includes(p.nakshatra as (typeof NAKSHATRAS)[number])) {
        push(`${base}.nakshatra`, `unknown nakshatra '${p.nakshatra}'`);
      }
      if (typeof p.retrograde !== "boolean") push(`${base}.retrograde`, "must be boolean");
      if (!p.source) warn(`${base}.source`, "recommend citing source per row");
    });

    // Rahu / Ketu must be 180° apart when both present.
    const rahu = f.planets.find((p) => p.planet === "Rahu");
    const ketu = f.planets.find((p) => p.planet === "Ketu");
    if (rahu && ketu) {
      const diff = Math.abs(((rahu.siderealLongitude - ketu.siderealLongitude + 540) % 360) - 180);
      if (diff > 0.05) warn("planets.rahu_ketu", `Rahu/Ketu opposition off by ${diff.toFixed(3)}°`);
    }
  }

  if (!f.notes) warn("notes", "recommend recording original-source evidence status");
  return { ok: errors.length === 0, errors, warnings };
}

/** Duplicate detection across a fixture set. Groups by (source|timestamp|mode). */
export function findDuplicates(
  fixtures: ExtendedReferenceFixture[],
): { ids: string[]; combos: string[] } {
  const ids = new Map<string, number>();
  const combos = new Map<string, number>();
  for (const f of fixtures) {
    ids.set(f.fixtureVersion, (ids.get(f.fixtureVersion) ?? 0) + 1);
    const key = `${f.source ?? f.referenceEngine}|${f.timestampIso}|${f.nodeMode}|${f.moonConvention}`;
    combos.set(key, (combos.get(key) ?? 0) + 1);
  }
  return {
    ids: [...ids.entries()].filter(([, n]) => n > 1).map(([k]) => k),
    combos: [...combos.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  };
}

/** Group fixtures into comparison-safe buckets. */
export function groupComparable(
  fixtures: ExtendedReferenceFixture[],
): Map<string, ExtendedReferenceFixture[]> {
  const out = new Map<string, ExtendedReferenceFixture[]>();
  for (const f of fixtures) {
    const key = [
      f.timestampIso,
      f.location?.label ?? "",
      f.ayanamshaMode,
      f.nodeMode,
      f.moonConvention,
    ].join("|");
    const arr = out.get(key) ?? [];
    arr.push(f);
    out.set(key, arr);
  }
  return out;
}