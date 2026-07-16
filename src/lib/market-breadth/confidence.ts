// Phase 27 · Stage 3 — Transparent research confidence scoring.
//
// Deterministic, versioned, explainable. NO ML. All contributions are
// captured on the breakdown so exports can audit them.

import type {
  ConfidenceBreakdown,
  ConflictItem,
  MarketBreadthSnapshot,
  PcrConfirmation,
  VixRegimeReading,
} from "./types";
import { directionOfBreadth, directionOfPcr } from "./conflict-detector";

export const CONFIDENCE_FORMULA_VERSION = "gti-confidence@1.0.0";

export interface ConfidenceInput {
  readonly breadthSnapshots: readonly (MarketBreadthSnapshot | null)[];
  readonly pcr: PcrConfirmation;
  readonly vix: VixRegimeReading;
  readonly conflicts: readonly ConflictItem[];
}

export function computeConfidence(input: ConfidenceInput): ConfidenceBreakdown {
  const base = 50;
  const present = input.breadthSnapshots.filter((s) => s && s.dataQuality !== "FAILED") as MarketBreadthSnapshot[];
  const total = input.breadthSnapshots.length;
  const coverageRatio = total === 0 ? 0 : present.length / total;
  const coveragePenalty = Math.round((1 - coverageRatio) * 30);

  const staleCount = present.filter((s) => s.freshness === "STALE").length;
  const freshnessPenalty = Math.min(20, staleCount * 5) + (input.pcr.freshness === "STALE" ? 5 : 0);

  const conflictPenalty = Math.min(30, input.conflicts.length * 6);

  // Agreement: count breadth snapshots agreeing with the majority direction.
  const dirs = present.map((s) => directionOfBreadth(s)).filter((d) => d === "BULLISH" || d === "BEARISH");
  let agreementBonus = 0;
  if (dirs.length >= 2) {
    const bull = dirs.filter((d) => d === "BULLISH").length;
    const bear = dirs.filter((d) => d === "BEARISH").length;
    const majority = Math.max(bull, bear);
    agreementBonus = Math.round((majority / dirs.length) * 15);
  }

  const pcrDir = directionOfPcr(input.pcr);
  const pcrBonus = input.pcr.available && (pcrDir === "BULLISH" || pcrDir === "BEARISH") ? 10 : 0;

  const vixConsistencyBonus =
    input.vix.regime !== "UNKNOWN" && input.vix.freshness !== "STALE" ? 5 : 0;

  const total_ = Math.max(
    0,
    Math.min(
      100,
      base - coveragePenalty - freshnessPenalty - conflictPenalty + agreementBonus + pcrBonus + vixConsistencyBonus,
    ),
  );
  return {
    base,
    coveragePenalty,
    freshnessPenalty,
    conflictPenalty,
    agreementBonus,
    pcrBonus,
    vixConsistencyBonus,
    total: total_,
    formulaVersion: CONFIDENCE_FORMULA_VERSION,
  };
}
