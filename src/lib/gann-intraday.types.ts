// Phase 21.2 · Gann Nifty Astro Absolute-Degree Intraday Engine — shared types.
//
// Nine planets, four raw levels each, 36 total. Absolute sidereal longitude
// in [0, 360). See spec §§3–8.

import type { IntradayFormulaVersion } from "./engine-version";

export const GANN_PLANETS = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Rahu",
  "Ketu",
] as const;
export type GannPlanet = (typeof GANN_PLANETS)[number];

/** Branded numeric guard: 0 <= v < 360, finite. */
export type AbsolutePlanetDegree = number & { readonly __abs360: unique symbol };

export type SourceLevel = "L1" | "L2" | "L3" | "L4";
export type LevelSide = "RESISTANCE" | "SUPPORT" | "NEUTRAL";
export type TradeBias = "BUY" | "SELL" | "WAIT";
export type SafetyBadge = "SAFE" | "RISKY";

export type PlanetAbsoluteInput = {
  planet: GannPlanet;
  absoluteDegree: AbsolutePlanetDegree;
};

export type RawAstroLevel = {
  planet: GannPlanet;
  absoluteDegree: number;
  sourceLevel: SourceLevel;
  value: number;
  previousClose: number;
  upperMultiple: number;
  lowerMultiple: number;
  distanceFromClose: number;
  side: LevelSide;
  tradeBias: TradeBias;
  safety: SafetyBadge;
  formulaVersion: IntradayFormulaVersion;
};

export type CycleBounds = {
  previousClose: number;
  lowerCycleIndex: number;
  upperCycleIndex: number;
  lowerMultiple: number;
  upperMultiple: number;
  /** True when C % 360 === 0 and the provisional boundary policy applied. */
  exactBoundary: boolean;
};

export class AbsoluteDegreeValidationError extends Error {
  readonly code = "INTRADAY_ABSOLUTE_DEGREE_INVALID" as const;
  constructor(
    readonly planet: string,
    readonly received: unknown,
    readonly reason: string,
  ) {
    super(
      `Invalid absolute planetary degree for ${planet}: ${String(received)} (${reason})`,
    );
  }
}

export class UnsupportedInstrumentError extends Error {
  readonly code = "INTRADAY_ABSOLUTE_METHOD_NOT_VALIDATED" as const;
  constructor(readonly instrument: string) {
    super(
      `Absolute-Degree Intraday method not validated for instrument: ${instrument}`,
    );
  }
}

export function assertAbsoluteDegree(
  planet: string,
  d: unknown,
): AbsolutePlanetDegree {
  if (typeof d !== "number" || !Number.isFinite(d)) {
    throw new AbsoluteDegreeValidationError(planet, d, "not a finite number");
  }
  if (d < 0) {
    throw new AbsoluteDegreeValidationError(planet, d, "negative");
  }
  if (d >= 360) {
    throw new AbsoluteDegreeValidationError(planet, d, ">= 360");
  }
  return d as AbsolutePlanetDegree;
}