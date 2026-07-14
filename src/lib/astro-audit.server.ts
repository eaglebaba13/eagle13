// Server-only Phase 21.0B audit engine. NOT imported by any production
// live/backtest/replay/decision path — audit route + tests only.

import { computeAstroPositions } from "./astro-engine.server";
import { computeCycles, computeGannAstroLevels } from "./astro-levels";
import {
  AUDIT_VERSION,
  classifyLongitudeDiff,
  deriveVerdict,
  inferAuditMode,
  PROVISIONAL_METHODOLOGY_DEFAULT,
  signedLongitudeDiff,
  type AuditReport,
  type LevelImpact,
  type PlanetComparison,
  type ReferenceFixture,
} from "./astro-audit";

/** Run a single-fixture audit. Reference fixture is captured externally
 *  (Swiss / Drik / MPanchang) — see src/lib/__fixtures__/astro-reference. */
export function runAstroAudit(fixture: ReferenceFixture): AuditReport {
  const when = new Date(fixture.timestampIso);
  const pos = computeAstroPositions(when);

  // Ayanamsha comparison.
  const ayDiff = pos.ayanamsa - fixture.ayanamsha;
  const ayanamsha = {
    current: pos.ayanamsa,
    reference: fixture.ayanamsha,
    diffDeg: ayDiff,
    diffArcsec: Math.round(ayDiff * 3600 * 1000) / 1000,
    toleranceStatus: classifyLongitudeDiff(ayDiff, "planet"),
  };

  // Planet comparisons.
  const planets: PlanetComparison[] = [];
  for (const ref of fixture.planets) {
    const cur = pos.planets.find((p) => p.planet === ref.planet);
    if (!cur) continue;
    const diff = signedLongitudeDiff(cur.absDegree, ref.siderealLongitude);
    const kind = ref.planet === "Moon" ? "moon" : "planet";
    planets.push({
      planet: ref.planet,
      current: {
        siderealLongitude: cur.absDegree,
        sign: cur.sign,
        degreeInSign: cur.degree,
        nakshatra: cur.nakshatra,
        pada: cur.pada,
        retrograde: cur.retro,
      },
      reference: ref,
      diffDeg: diff,
      diffArcsec: Math.round(diff * 3600 * 1000) / 1000,
      toleranceStatus: classifyLongitudeDiff(diff, kind),
      signMatch: cur.sign === ref.sign,
      nakshatraMatch: cur.nakshatra === ref.nakshatra,
      padaMatch: cur.pada === ref.pada,
      retroMatch: cur.retro === ref.retrograde,
    });
  }

  // Downstream Gann level impact (uses NIFTY-style prevClose = 24176).
  // Only demonstrates whether astronomy differences flip integer levels.
  const cycles = computeCycles(24176);
  const levelImpacts: LevelImpact[] = planets.map((p) => {
    const curLv = computeGannAstroLevels(cycles, p.current.degreeInSign);
    const refDeg = p.reference.degreeInSign;
    const safeRefDeg = refDeg >= 0 && refDeg < 30 ? refDeg : p.current.degreeInSign;
    const refLv = computeGannAstroLevels(cycles, safeRefDeg);
    const deltas = [
      Math.abs(curLv.r1 - refLv.r1),
      Math.abs(curLv.r2 - refLv.r2),
      Math.abs(curLv.s1 - refLv.s1),
      Math.abs(curLv.s2 - refLv.s2),
    ];
    const maxDelta = Math.max(...deltas);
    return {
      planet: p.planet,
      currentDegree: p.current.degreeInSign,
      referenceDegree: safeRefDeg,
      currentLevels: curLv,
      referenceLevels: refLv,
      maxLevelDelta: maxDelta,
      anyChange: maxDelta > 0,
    };
  });

  const summary = {
    totalPlanets: planets.length,
    exact: planets.filter((p) => p.toleranceStatus === "EXACT").length,
    acceptable: planets.filter((p) => p.toleranceStatus === "ACCEPTABLE").length,
    warning: planets.filter((p) => p.toleranceStatus === "WARNING").length,
    fail: planets.filter((p) => p.toleranceStatus === "FAIL").length,
    nakshatraMismatches: planets.filter((p) => !p.nakshatraMatch).length,
    padaMismatches: planets.filter((p) => !p.padaMatch).length,
    retroMismatches: planets.filter((p) => !p.retroMatch).length,
    maxLevelDelta: levelImpacts.reduce((m, l) => Math.max(m, l.maxLevelDelta), 0),
    levelsChanged: levelImpacts.filter((l) => l.anyChange).length,
  };

  // Original Gann source's node mode & Moon convention are documented in
  // fixture.notes when known. Absent explicit confirmation, the verdict
  // stays at CANNOT_DETERMINE per Phase 21.0B stop conditions.
  const originalSourceKnown = Boolean(
    fixture.notes && /original[\s-]?source[:=]\s*confirmed/i.test(fixture.notes),
  );
  const { verdict, reason, evidence } = deriveVerdict(
    planets,
    levelImpacts,
    originalSourceKnown,
  );

  return {
    auditVersion: AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    mode: inferAuditMode(fixture),
    provisionalDefault: PROVISIONAL_METHODOLOGY_DEFAULT,
    fixture,
    ayanamsha,
    planets,
    levelImpacts,
    summary,
    verdict,
    verdictEvidence: evidence,
    verdictReason: reason,
  };
}

export function auditReportToCsv(r: AuditReport): string {
  const rows: string[] = [];
  rows.push(
    "planet,currentLon,refLon,diffDeg,diffArcsec,status,signMatch,nakMatch,padaMatch,retroMatch,maxLevelDelta",
  );
  for (const p of r.planets) {
    const li = r.levelImpacts.find((l) => l.planet === p.planet);
    rows.push(
      [
        p.planet,
        p.current.siderealLongitude,
        p.reference.siderealLongitude,
        p.diffDeg.toFixed(6),
        p.diffArcsec.toFixed(3),
        p.toleranceStatus,
        p.signMatch,
        p.nakshatraMatch,
        p.padaMatch,
        p.retroMatch,
        li?.maxLevelDelta ?? 0,
      ].join(","),
    );
  }
  return rows.join("\n");
}
