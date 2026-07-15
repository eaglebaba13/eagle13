// Phase 21.2 · Layer 2 — Level Ranking & Clustering.
//
// Pure. Given the 36 raw levels + optional pivot values, produce clusters,
// ranked safe buy/sell lists, and nearest / next-safe selections. Spec §§10–14.

import type {
  RawAstroLevel,
  LevelSide,
  SafetyBadge,
} from "./gann-intraday.types";
import { getInstrumentPolicy, type InstrumentSymbol } from "./gann-intraday-policy";

export type PivotInputs = {
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
};

export type PivotConfluence = "NONE" | "WEAK" | "STRONG";

export type RankedLevel = RawAstroLevel & {
  hasSun: boolean;
  hasMoon: boolean;
  sunMoonPriority: boolean;
  clusterCount: number;
  clusterPlanets: string[];
  exact360Distance: number;
  exact360Confluence: boolean;
  pivotConfluence: PivotConfluence;
  nearestPivotDistance: number | null;
};

export type LevelCluster = {
  representativeLevel: number;
  minLevel: number;
  maxLevel: number;
  planets: string[];
  levelCount: number;
  hasSun: boolean;
  hasMoon: boolean;
  exact360Confluence: boolean;
  pivotConfluence: PivotConfluence;
  side: LevelSide;
  safety: SafetyBadge;
};

function nearestPivotDistance(value: number, pivots?: PivotInputs): number | null {
  if (!pivots) return null;
  const pts = [pivots.pivot, pivots.r1, pivots.r2, pivots.s1, pivots.s2];
  let best = Infinity;
  for (const p of pts) best = Math.min(best, Math.abs(value - p));
  return best;
}

function pivotConfluenceFor(
  value: number,
  pivots: PivotInputs | undefined,
  exact360Tol: number,
): PivotConfluence {
  if (!pivots) return "NONE";
  const d = nearestPivotDistance(value, pivots) ?? Infinity;
  if (d <= exact360Tol / 2) return "STRONG";
  if (d <= exact360Tol) return "WEAK";
  return "NONE";
}

/** Deterministically cluster levels by side + tolerance. Spec §11. */
export function clusterLevels(
  levels: RawAstroLevel[],
  tolerance: number,
  pivots?: PivotInputs,
  exact360Tolerance = 10,
): LevelCluster[] {
  const bySide: Record<LevelSide, RawAstroLevel[]> = {
    RESISTANCE: [],
    SUPPORT: [],
    NEUTRAL: [],
  };
  for (const l of levels) bySide[l.side].push(l);

  const clusters: LevelCluster[] = [];
  for (const side of ["RESISTANCE", "SUPPORT", "NEUTRAL"] as LevelSide[]) {
    const sorted = [...bySide[side]].sort((a, b) => a.value - b.value);
    let cur: RawAstroLevel[] = [];
    const flush = () => {
      if (cur.length === 0) return;
      const values = cur.map((l) => l.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      // Representative: prefer the HIGHER level (spec §11 duplicate policy).
      const representative = max;
      const planets = Array.from(new Set(cur.map((l) => l.planet)));
      const hasSun = planets.includes("Sun");
      const hasMoon = planets.includes("Moon");
      const exact360Confluence = cur.some(
        (l) => Math.abs(l.value - Math.round(l.value / 360) * 360) <= exact360Tolerance,
      );
      const safety: SafetyBadge = cur.every((l) => l.safety === "SAFE")
        ? "SAFE"
        : "RISKY";
      clusters.push({
        representativeLevel: representative,
        minLevel: min,
        maxLevel: max,
        planets,
        levelCount: cur.length,
        hasSun,
        hasMoon,
        exact360Confluence,
        pivotConfluence: pivotConfluenceFor(representative, pivots, exact360Tolerance),
        side,
        safety,
      });
      cur = [];
    };
    for (const l of sorted) {
      if (cur.length === 0) {
        cur.push(l);
        continue;
      }
      const last = cur[cur.length - 1];
      if (Math.abs(l.value - last.value) <= tolerance) cur.push(l);
      else {
        flush();
        cur.push(l);
      }
    }
    flush();
  }
  return clusters;
}

export type RankedBundle = {
  ranked: RankedLevel[];
  clusters: LevelCluster[];
  nearestSafeBuy: RankedLevel | null;
  nextSafeBuy: RankedLevel | null;
  nearestSafeSell: RankedLevel | null;
  nextSafeSell: RankedLevel | null;
};

/**
 * Rank levels per spec §12 tie-break order:
 *   1. Safe over risky
 *   2. Home/Pivot confluence (STRONG > WEAK > NONE)
 *   3. First reachable from close (nearer wins)
 *   4. Cluster count
 *   5. Sun/Moon presence
 *   6. Near exact multiple of 360
 *   7. Stable deterministic tie-breaker (planet order, then sourceLevel)
 */
export function rankLevels(
  instrument: InstrumentSymbol,
  levels: RawAstroLevel[],
  pivots?: PivotInputs,
): RankedBundle {
  const policy = getInstrumentPolicy(instrument);
  const clusters = clusterLevels(
    levels,
    policy.clusterTolerancePoints,
    pivots,
    policy.exact360TolerancePoints,
  );

  // Map each raw level to its cluster (by side + value proximity).
  const clusterOf = (l: RawAstroLevel): LevelCluster | undefined =>
    clusters.find(
      (c) =>
        c.side === l.side &&
        l.value >= c.minLevel - 0.5 &&
        l.value <= c.maxLevel + 0.5,
    );

  const ranked: RankedLevel[] = levels.map((l) => {
    const c = clusterOf(l);
    const planetsInCluster = c?.planets ?? [l.planet];
    const nearest360 = Math.abs(l.value - Math.round(l.value / 360) * 360);
    return {
      ...l,
      hasSun: planetsInCluster.includes("Sun"),
      hasMoon: planetsInCluster.includes("Moon"),
      sunMoonPriority:
        planetsInCluster.includes("Sun") || planetsInCluster.includes("Moon"),
      clusterCount: c?.levelCount ?? 1,
      clusterPlanets: planetsInCluster,
      exact360Distance: nearest360,
      exact360Confluence: nearest360 <= policy.exact360TolerancePoints,
      pivotConfluence: pivotConfluenceFor(l.value, pivots, policy.exact360TolerancePoints),
      nearestPivotDistance: nearestPivotDistance(l.value, pivots),
    };
  });

  const confluenceRank = (c: PivotConfluence): number =>
    c === "STRONG" ? 2 : c === "WEAK" ? 1 : 0;

  const planetOrder = new Map(
    ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"].map(
      (p, i) => [p, i],
    ),
  );
  const sourceOrder: Record<string, number> = { L1: 0, L2: 1, L3: 2, L4: 3 };

  const cmp = (a: RankedLevel, b: RankedLevel): number => {
    // 1. Safe over risky
    if (a.safety !== b.safety) return a.safety === "SAFE" ? -1 : 1;
    // 2. Pivot confluence
    const pc = confluenceRank(b.pivotConfluence) - confluenceRank(a.pivotConfluence);
    if (pc !== 0) return pc;
    // 3. Distance from previous close
    if (a.distanceFromClose !== b.distanceFromClose)
      return a.distanceFromClose - b.distanceFromClose;
    // 4. Cluster count (bigger cluster wins)
    if (a.clusterCount !== b.clusterCount) return b.clusterCount - a.clusterCount;
    // 5. Sun/Moon presence
    if (a.sunMoonPriority !== b.sunMoonPriority) return a.sunMoonPriority ? -1 : 1;
    // 6. Exact-360 proximity
    if (a.exact360Distance !== b.exact360Distance)
      return a.exact360Distance - b.exact360Distance;
    // 7. Stable planet/source order
    const p = (planetOrder.get(a.planet) ?? 99) - (planetOrder.get(b.planet) ?? 99);
    if (p !== 0) return p;
    return (sourceOrder[a.sourceLevel] ?? 9) - (sourceOrder[b.sourceLevel] ?? 9);
  };

  const safeBuys = ranked
    .filter((r) => r.side === "SUPPORT" && r.safety === "SAFE")
    .sort(cmp);
  const safeSells = ranked
    .filter((r) => r.side === "RESISTANCE" && r.safety === "SAFE")
    .sort(cmp);

  return {
    ranked,
    clusters,
    nearestSafeBuy: safeBuys[0] ?? null,
    nextSafeBuy: safeBuys[1] ?? null,
    nearestSafeSell: safeSells[0] ?? null,
    nextSafeSell: safeSells[1] ?? null,
  };
}