// Phase 21.2 · Stage 5 — read-only Decision adapter.
//
// This module is a pure transform from an IntradaySnapshot + SessionSimulation
// into a decision-shaped envelope. It DOES NOT and MUST NOT import any file
// from the production Decision Engine. A repo-structure test asserts this.

import {
  GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "./engine-version";
import type { IntradaySnapshot } from "./gann-intraday.functions";
import type { SessionSimulation } from "./gann-intraday-simulator";
import type { Direction } from "./gann-formula-compare";

export type DataQuality = "OK" | "PARTIAL" | "MISSING";

export type AbsoluteValidationSignal = {
  version: typeof GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION;
  formulaVersion: typeof INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1;
  direction: Direction;
  confidence: number; // 0..1
  grade: "A" | "B" | "C" | "NONE";
  dataQuality: DataQuality;
  reasons: string[];
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION";
};

export function absoluteIntradayValidationSignal(
  snapshot: IntradaySnapshot,
  simulation: SessionSimulation | null,
): AbsoluteValidationSignal {
  const reasons: string[] = [];
  let dataQuality: DataQuality = "OK";
  if (snapshot.status === "NO_TRADING_SESSION") {
    dataQuality = "MISSING";
    reasons.push("No trading session for date");
  }
  if (snapshot.rankedLevels.length === 0) {
    dataQuality = "MISSING";
    reasons.push("No ranked levels available");
  }
  if (!simulation) {
    dataQuality = dataQuality === "MISSING" ? "MISSING" : "PARTIAL";
    reasons.push("Simulation not yet available");
  }

  // Direction & grade — take the strongest approved cube result from the sim.
  let direction: Direction = "WAIT";
  let grade: AbsoluteValidationSignal["grade"] = "NONE";
  let confidence = 0;
  if (simulation) {
    const gradeOrder = { A: 3, B: 2, C: 1, NONE: 0 } as const;
    let best: (typeof simulation.perLevel)[number] | null = null;
    for (const p of simulation.perLevel) {
      if (p.cube.action !== "BUY" && p.cube.action !== "SELL") continue;
      if (!best || gradeOrder[p.cube.cubeGrade] > gradeOrder[best.cube.cubeGrade]) {
        best = p;
      }
    }
    if (best) {
      direction = best.cube.action;
      grade = best.cube.cubeGrade;
      const alignedRatio =
        best.cube.conditionsAligned /
        Math.max(1, best.cube.conditionsAvailable);
      confidence = Math.min(1, Math.max(0, alignedRatio));
      reasons.push(...best.cube.reasons);
    } else {
      reasons.push("No approved cube setup");
      direction = "NO_TRADE";
    }
  }

  return {
    version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
    formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
    direction,
    confidence,
    grade,
    dataQuality,
    reasons,
    labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
  };
}