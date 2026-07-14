// Shared Level Engine — pure, side-effect free calculations extracted from
// live-terminal.tsx and live-levels.tsx. Every formula, threshold and rounding
// step is preserved verbatim from the original inline implementations so that
// outputs (status / signal / distance / confidence / sort order / nearest) are
// bitwise identical.
import type { Lvl, LevelKind, LevelStatus, LevelSignal } from "@/types/levels";

export type PlanetWithLevels = {
  planet: string;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
};

export function calculateDistance(price: number, value: number): number {
  return Math.abs(price - value);
}

export function getLevelStatus(
  price: number,
  value: number,
  isResistance: boolean,
  tolerance: number,
): LevelStatus {
  const d = calculateDistance(price, value);
  if (d <= tolerance) return "TOUCHED";
  if (isResistance) {
    if (price > value) return "BROKEN";
    return d <= tolerance * 5 ? "ACTIVE" : "PENDING";
  }
  if (price < value) return "BROKEN";
  return d <= tolerance * 5 ? "ACTIVE" : "PENDING";
}

export function getLevelSignal(
  price: number,
  value: number,
  isResistance: boolean,
  tolerance: number,
): LevelSignal {
  const d = calculateDistance(price, value);
  if (d <= tolerance) return "WATCH";
  if (isResistance) return price > value ? "BUY" : "SELL";
  return price < value ? "SELL" : "BUY";
}

// Confidence identical to prior inline formula:
//   max(5, min(99, round(100 - min(90, (distance / tolerance) * 7))))
function computeConfidence(distance: number, tolerance: number): number {
  return Math.max(
    5,
    Math.min(99, Math.round(100 - Math.min(90, (distance / tolerance) * 7))),
  );
}

export function buildLevels(
  planets: PlanetWithLevels[],
  price: number,
  tolerance: number,
): Lvl[] {
  const out: Lvl[] = [];
  for (const p of planets) {
    const defs: [LevelKind, number, boolean][] = [
      ["R3", p.r3, true], ["R2", p.r2, true], ["R1", p.r1, true],
      ["S1", p.s1, false], ["S2", p.s2, false], ["S3", p.s3, false],
    ];
    for (const [kind, value, isR] of defs) {
      const distance = calculateDistance(price, value);
      out.push({
        planet: p.planet,
        kind,
        value,
        isResistance: isR,
        distance,
        status: getLevelStatus(price, value, isR, tolerance),
        signal: getLevelSignal(price, value, isR, tolerance),
        confidence: computeConfidence(distance, tolerance),
      });
    }
  }
  return out;
}

export function sortLevels(lvls: Lvl[]): Lvl[] {
  return [...lvls].sort((a, b) => a.distance - b.distance);
}

export function findNearestLevel(lvls: Lvl[]): Lvl | null {
  if (lvls.length === 0) return null;
  let best = lvls[0];
  for (let i = 1; i < lvls.length; i++) {
    if (lvls[i].distance < best.distance) best = lvls[i];
  }
  return best;
}