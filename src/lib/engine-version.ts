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