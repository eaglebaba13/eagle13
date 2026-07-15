// Phase 21.2 · Layer 1 — pure Absolute-Degree Astro Level Engine.
//
// Deterministic. No IO. No time. No dependency on live prices.
// Input : previous completed trading-day close + 9 planetary absolute
//         sidereal longitudes at 09:15 IST on trading date T.
// Output: 36 raw levels (9 planets × L1..L4) with side/safety classification.
//
// Spec: §§2, 3, 4, 5, 6, 7, 8, 9.

import {
  INTRADAY_FORMULA_VERSIONS,
  type IntradayFormulaVersion,
} from "./engine-version";
import {
  assertAbsoluteDegree,
  GANN_PLANETS,
  type CycleBounds,
  type PlanetAbsoluteInput,
  type RawAstroLevel,
  type LevelSide,
  type TradeBias,
  type SafetyBadge,
  type SourceLevel,
} from "./gann-intraday.types";
import { getInstrumentPolicy, type InstrumentSymbol } from "./gann-intraday-policy";

const FORMULA: IntradayFormulaVersion =
  INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1;

/** Compute the bounding 360° cycles that straddle previous close. Spec §§5, 6. */
export function computeCycleBounds(previousClose: number): CycleBounds {
  if (!Number.isFinite(previousClose) || previousClose <= 0) {
    throw new Error(`Invalid previousClose: ${previousClose}`);
  }
  const lowerCycleIndex = Math.floor(previousClose / 360);
  const upperCycleIndex = Math.ceil(previousClose / 360);
  const onBoundary = previousClose % 360 === 0;
  const lowerMultiple = lowerCycleIndex * 360;
  const upperMultiple = onBoundary
    ? previousClose + 360 // PROVISIONAL_EXACT_BOUNDARY_POLICY
    : upperCycleIndex * 360;
  return {
    previousClose,
    lowerCycleIndex,
    upperCycleIndex: onBoundary ? lowerCycleIndex + 1 : upperCycleIndex,
    lowerMultiple,
    upperMultiple,
    exactBoundary: onBoundary,
  };
}

function classify(
  value: number,
  previousClose: number,
  safeDistance: number,
): { side: LevelSide; tradeBias: TradeBias; safety: SafetyBadge } {
  let side: LevelSide;
  let tradeBias: TradeBias;
  if (value > previousClose) {
    side = "RESISTANCE";
    tradeBias = "SELL";
  } else if (value < previousClose) {
    side = "SUPPORT";
    tradeBias = "BUY";
  } else {
    side = "NEUTRAL";
    tradeBias = "WAIT";
  }
  const distance = Math.abs(value - previousClose);
  const safety: SafetyBadge = distance >= safeDistance ? "SAFE" : "RISKY";
  return { side, tradeBias, safety };
}

/** Generate the four raw levels for a single planet. Spec §7. */
export function computePlanetLevels(
  input: PlanetAbsoluteInput,
  cycles: CycleBounds,
  safeDistance: number,
): RawAstroLevel[] {
  const A = assertAbsoluteDegree(input.planet, input.absoluteDegree);
  const rows: Array<{ src: SourceLevel; raw: number }> = [
    { src: "L1", raw: cycles.upperMultiple + A },
    { src: "L2", raw: cycles.lowerMultiple + A },
    { src: "L3", raw: cycles.upperMultiple - A },
    { src: "L4", raw: cycles.lowerMultiple - A },
  ];
  return rows.map(({ src, raw }) => {
    const value = Math.round(raw);
    const { side, tradeBias, safety } = classify(
      value,
      cycles.previousClose,
      safeDistance,
    );
    return {
      planet: input.planet,
      absoluteDegree: input.absoluteDegree,
      sourceLevel: src,
      value,
      previousClose: cycles.previousClose,
      upperMultiple: cycles.upperMultiple,
      lowerMultiple: cycles.lowerMultiple,
      distanceFromClose: Math.abs(value - cycles.previousClose),
      side,
      tradeBias,
      safety,
      formulaVersion: FORMULA,
    };
  });
}

export type AbsoluteLevelBundle = {
  formulaVersion: IntradayFormulaVersion;
  instrument: InstrumentSymbol;
  cycles: CycleBounds;
  levels: RawAstroLevel[];
};

/**
 * Build all 36 raw levels for an instrument. Planet order is fixed
 * (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Rahu, Ketu) so that
 * downstream clustering and tie-breaks are deterministic.
 */
export function buildAbsoluteIntradayLevels(args: {
  instrument: InstrumentSymbol;
  previousClose: number;
  planets: PlanetAbsoluteInput[];
}): AbsoluteLevelBundle {
  const policy = getInstrumentPolicy(args.instrument);
  const cycles = computeCycleBounds(args.previousClose);

  const byName = new Map<string, PlanetAbsoluteInput>(
    args.planets.map((p) => [p.planet, p]),
  );
  const missing = GANN_PLANETS.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    throw new Error(
      `Missing absolute degrees for planets: ${missing.join(", ")}`,
    );
  }

  const levels: RawAstroLevel[] = [];
  for (const name of GANN_PLANETS) {
    const rows = computePlanetLevels(byName.get(name)!, cycles, policy.safeDistance);
    levels.push(...rows);
  }
  return {
    formulaVersion: FORMULA,
    instrument: args.instrument,
    cycles,
    levels,
  };
}