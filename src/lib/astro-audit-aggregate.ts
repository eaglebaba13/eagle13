// Phase 21.0C · Aggregate metrics + boundary risk + CSV exports.
// Reads Phase 21.0B AuditReport[]; never mutates production paths.

import type { AuditReport, PlanetComparison } from "./astro-audit";

export type PlanetAggregate = {
  planet: string;
  n: number;
  meanAbsDiff: number;
  medianDiff: number;
  maxAbsDiff: number;
  exactPct: number;
  acceptablePct: number;
  warningPct: number;
  failPct: number;
  signMatchPct: number;
  nakshatraMatchPct: number;
  padaMatchPct: number;
  retroMatchPct: number;
};

export type ModeAggregate = {
  mode: string;
  fixtures: number;
  perPlanet: PlanetAggregate[];
  moon?: PlanetAggregate;
  levelsChangedFixtures: number;
  maxLevelDelta: number;
};

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function planetAggregate(planet: string, comps: PlanetComparison[]): PlanetAggregate {
  const abs = comps.map((c) => Math.abs(c.diffDeg));
  const n = comps.length;
  return {
    planet,
    n,
    meanAbsDiff: n ? abs.reduce((a, b) => a + b, 0) / n : 0,
    medianDiff: median(comps.map((c) => c.diffDeg)),
    maxAbsDiff: n ? Math.max(...abs) : 0,
    exactPct: pct(comps.filter((c) => c.toleranceStatus === "EXACT").length, n),
    acceptablePct: pct(comps.filter((c) => c.toleranceStatus === "ACCEPTABLE").length, n),
    warningPct: pct(comps.filter((c) => c.toleranceStatus === "WARNING").length, n),
    failPct: pct(comps.filter((c) => c.toleranceStatus === "FAIL").length, n),
    signMatchPct: pct(comps.filter((c) => c.signMatch).length, n),
    nakshatraMatchPct: pct(comps.filter((c) => c.nakshatraMatch).length, n),
    padaMatchPct: pct(comps.filter((c) => c.padaMatch).length, n),
    retroMatchPct: pct(comps.filter((c) => c.retroMatch).length, n),
  };
}

/** Aggregate reports grouped by mode. */
export function aggregateByMode(reports: AuditReport[]): ModeAggregate[] {
  const byMode = new Map<string, AuditReport[]>();
  for (const r of reports) {
    const arr = byMode.get(r.mode) ?? [];
    arr.push(r);
    byMode.set(r.mode, arr);
  }
  const out: ModeAggregate[] = [];
  for (const [mode, rs] of byMode) {
    const byPlanet = new Map<string, PlanetComparison[]>();
    for (const r of rs) for (const p of r.planets) {
      const a = byPlanet.get(p.planet) ?? [];
      a.push(p);
      byPlanet.set(p.planet, a);
    }
    const perPlanet: PlanetAggregate[] = [];
    let moon: PlanetAggregate | undefined;
    for (const [planet, comps] of byPlanet) {
      const agg = planetAggregate(planet, comps);
      if (planet === "Moon") moon = agg;
      else perPlanet.push(agg);
    }
    perPlanet.sort((a, b) => a.planet.localeCompare(b.planet));
    out.push({
      mode,
      fixtures: rs.length,
      perPlanet,
      moon,
      levelsChangedFixtures: rs.filter((r) => r.summary.levelsChanged > 0).length,
      maxLevelDelta: rs.reduce((m, r) => Math.max(m, r.summary.maxLevelDelta), 0),
    });
  }
  return out.sort((a, b) => a.mode.localeCompare(b.mode));
}

export type BoundaryRisk = {
  fixtureVersion: string;
  planet: string;
  diffDeg: number;
  signChange: boolean;
  nakshatraChange: boolean;
  padaChange: boolean;
  retroChange: boolean;
  levelDelta: number;
};

/** Rows where a small longitude diff crosses a categorical boundary. */
export function boundaryRisks(reports: AuditReport[]): BoundaryRisk[] {
  const out: BoundaryRisk[] = [];
  for (const r of reports) {
    for (const p of r.planets) {
      const li = r.levelImpacts.find((l) => l.planet === p.planet);
      const levelDelta = li?.maxLevelDelta ?? 0;
      const anyBoundary =
        !p.signMatch || !p.nakshatraMatch || !p.padaMatch || !p.retroMatch;
      if (!anyBoundary && levelDelta === 0) continue;
      out.push({
        fixtureVersion: r.fixture.fixtureVersion,
        planet: p.planet,
        diffDeg: p.diffDeg,
        signChange: !p.signMatch,
        nakshatraChange: !p.nakshatraMatch,
        padaChange: !p.padaMatch,
        retroChange: !p.retroMatch,
        levelDelta,
      });
    }
  }
  return out;
}

export function planetComparisonCsv(reports: AuditReport[]): string {
  const lines = [
    "fixture,mode,planet,currentLon,refLon,diffDeg,diffArcsec,status,signMatch,nakMatch,padaMatch,retroMatch,maxLevelDelta",
  ];
  for (const r of reports) {
    for (const p of r.planets) {
      const li = r.levelImpacts.find((l) => l.planet === p.planet);
      lines.push([
        r.fixture.fixtureVersion, r.mode, p.planet,
        p.current.siderealLongitude, p.reference.siderealLongitude,
        p.diffDeg.toFixed(6), p.diffArcsec.toFixed(3),
        p.toleranceStatus, p.signMatch, p.nakshatraMatch, p.padaMatch, p.retroMatch,
        li?.maxLevelDelta ?? 0,
      ].join(","));
    }
  }
  return lines.join("\n");
}

export function boundaryRiskCsv(rows: BoundaryRisk[]): string {
  const lines = [
    "fixture,planet,diffDeg,signChange,nakChange,padaChange,retroChange,levelDelta",
  ];
  for (const r of rows) {
    lines.push([
      r.fixtureVersion, r.planet, r.diffDeg.toFixed(6),
      r.signChange, r.nakshatraChange, r.padaChange, r.retroChange, r.levelDelta,
    ].join(","));
  }
  return lines.join("\n");
}

export const MIN_FIXTURES_FOR_PRODUCTION_VERDICT = 20;

/** Phase 21.0C stop-condition: verdict only unlocks with ≥20 valid fixtures. */
export function coverageStatus(reports: AuditReport[]): {
  fixtures: number;
  meetsMinimum: boolean;
  modes: string[];
  sources: string[];
  missingConventions: number;
} {
  const modes = [...new Set(reports.map((r) => r.mode))];
  const sources = [...new Set(reports.map((r) => r.fixture.referenceEngine))];
  const missingConventions = reports.filter(
    (r) => !r.fixture.nodeMode || !r.fixture.moonConvention || !r.fixture.ayanamshaMode,
  ).length;
  return {
    fixtures: reports.length,
    meetsMinimum: reports.length >= MIN_FIXTURES_FOR_PRODUCTION_VERDICT,
    modes,
    sources,
    missingConventions,
  };
}