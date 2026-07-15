/**
 * EagleBaba Engine v1.0 — frozen calculation core.
 * These versions are surfaced in the License panel, headers, and reports so
 * users always know which deterministic engine produced their results.
 */
export const ENGINE_VERSION = {
  engine: "v1.0",
  formula: "v1.0",
  astro: "v1.0",
  signal: "v1.0",
  decision: "v1.0",
  risk: "v1.0",
  backtest: "v1.0",
  replay: "v1.0",
  options: "v1.0",
  broker: "v1.0",
  saas: "v0.1",
  // Phase 21.0 — Gann Nifty Astro Formula correction.
  astroFormulaVersion: "GANN_NIFTY_ASTRO_V1_1",
  levelFormulaVersion: "GANN_NIFTY_ASTRO_V1_1",
  legacyFormulaVersion: "LEGACY_EAGLEBABA_CASCADE_V1",
  effectiveFrom: "2026-07-14",
} as const;

export type EngineVersion = typeof ENGINE_VERSION;

export const ASTRO_FORMULA_VERSIONS = {
  GANN_NIFTY_ASTRO_V1_1: "GANN_NIFTY_ASTRO_V1_1",
  LEGACY_EAGLEBABA_CASCADE_V1: "LEGACY_EAGLEBABA_CASCADE_V1",
} as const;

/**
 * Phase 21.2 — Intraday methodology version registry.
 * These are SEPARATE from the sign-degree R1/R2/S1/S2 table method and MUST
 * NOT be used interchangeably. See Phase 21.2 spec §1.
 */
export const INTRADAY_FORMULA_VERSIONS = {
  GANN_ASTRO_INTRADAY_ABSOLUTE_V1: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1",
  GANN_SIGN_DEGREE_TABLE_V1_1: "GANN_SIGN_DEGREE_TABLE_V1_1",
  LEGACY_EAGLEBABA_CASCADE_V1: "LEGACY_EAGLEBABA_CASCADE_V1",
  SMC_V1: "SMC_V1",
} as const;

/** Phase 21.2 Stage 4 — replay validation channel for the absolute-degree
 *  intraday methodology. Independent of the production Market Replay engine. */
export const GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION =
  "GANN_ABSOLUTE_INTRADAY_REPLAY_V1" as const;
export type GannAbsoluteReplayVersion = typeof GANN_ABSOLUTE_INTRADAY_REPLAY_VERSION;

/** Phase 21.2 Stage 5 — historical validation, shadow alerts, readiness gate.
 *  Isolated version tokens so no downstream production surface can accidentally
 *  consume validation-only artefacts as if they were signed engine output. */
export const GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION =
  "GANN_ABSOLUTE_INTRADAY_VALIDATION_V1" as const;
export const SHADOW_ALERT_VERSION = "SHADOW_ALERT_V1" as const;
export const READINESS_GATE_VERSION = "READINESS_GATE_V1" as const;

/** Phase 21.2 Stage 5.1 — historical CSV ingestion pipeline version. */
export const GANN_ABSOLUTE_INTRADAY_INGEST_VERSION =
  "GANN_ABSOLUTE_INTRADAY_INGEST_V1" as const;

export type IntradayFormulaVersion =
  (typeof INTRADAY_FORMULA_VERSIONS)[keyof typeof INTRADAY_FORMULA_VERSIONS];

/** Default intraday Astro method — paid-course absolute-degree engine. */
export const DEFAULT_INTRADAY_FORMULA_VERSION: IntradayFormulaVersion =
  INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1;

export function intradayFormulaLabel(v: IntradayFormulaVersion): string {
  switch (v) {
    case INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1:
      return "Absolute Degree Intraday v1";
    case INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1:
      return "Sign Degree Table v1.1";
    case INTRADAY_FORMULA_VERSIONS.SMC_V1:
      return "SMC Historical v1";
    default:
      return "Legacy Cascade v1";
  }
}

export type AstroFormulaVersion =
  (typeof ASTRO_FORMULA_VERSIONS)[keyof typeof ASTRO_FORMULA_VERSIONS];

export const DEFAULT_ASTRO_FORMULA_VERSION: AstroFormulaVersion =
  ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1;

/**
 * Namespace token bumped whenever the cache-key shape or the authoritative
 * Astro formula changes. Old (unversioned) cache entries created before
 * Phase 21.0A will naturally orphan because none of the new keys collide
 * with any previous key.
 */
export const CACHE_NAMESPACE_VERSION = "v2" as const;

/** Human-readable label for a formula version — used by UI badges and exports. */
export function astroFormulaLabel(v: AstroFormulaVersion): string {
  return v === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1
    ? "Legacy Cascade v1"
    : "Gann Nifty Astro v1.1";
}

/** Short slug for filenames — always safe, no spaces. */
export function astroFormulaSlug(v: AstroFormulaVersion): string {
  return v === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1
    ? "LEGACY_CASCADE_V1"
    : "GANN_ASTRO_V1_1";
}

export function isLegacyAstroFormula(v: AstroFormulaVersion): boolean {
  return v === ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1;
}

/**
 * Build a cache key namespaced by the corrected-formula rollout. Every server
 * function that depends on Astro Levels MUST route its cache key through here
 * (or an equivalent prefix) so a legacy value can never satisfy a v1.1 request.
 */
export function astroCacheKey(
  base: string,
  version: AstroFormulaVersion = DEFAULT_ASTRO_FORMULA_VERSION,
): string {
  return `${CACHE_NAMESPACE_VERSION}:${version}:${base}`;
}