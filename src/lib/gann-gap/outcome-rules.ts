// Phase 2I-C — Versioned outcome evaluation rules.
// Pure. Bumping the version invalidates prior outcome records for the same
// prediction (a re-evaluation writes a new row under the new version).

export const OUTCOME_RULE_VERSION = "gann-gap-outcome@1.0.0";

/** Half-width of the flat-gap band as a fraction of the previous close. */
export const FLAT_GAP_TOLERANCE_PCT = 0.001; // 0.1%

export type ActualGapOutcome =
  | "ACTUAL_GAP_UP"
  | "ACTUAL_GAP_DOWN"
  | "ACTUAL_FLAT"
  | "OUTCOME_UNAVAILABLE";

export interface ClassifyOutcomeInput {
  readonly previousClose: number | null;
  readonly nextOpen: number | null;
}

export interface ClassifyOutcomeResult {
  readonly outcome: ActualGapOutcome;
  readonly gapPoints: number | null;
  readonly gapPercent: number | null;
  readonly reason: string;
}

export function classifyActualOutcome(i: ClassifyOutcomeInput): ClassifyOutcomeResult {
  const p = i.previousClose;
  const n = i.nextOpen;
  if (p == null || !Number.isFinite(p) || p <= 0) {
    return { outcome: "OUTCOME_UNAVAILABLE", gapPoints: null, gapPercent: null, reason: "Previous close unavailable" };
  }
  if (n == null || !Number.isFinite(n) || n <= 0) {
    return { outcome: "OUTCOME_UNAVAILABLE", gapPoints: null, gapPercent: null, reason: "Next-session open unavailable" };
  }
  const gapPoints = n - p;
  const gapPercent = gapPoints / p;
  const tol = FLAT_GAP_TOLERANCE_PCT;
  if (Math.abs(gapPercent) <= tol) {
    return { outcome: "ACTUAL_FLAT", gapPoints, gapPercent, reason: "Gap within flat tolerance" };
  }
  return {
    outcome: gapPoints > 0 ? "ACTUAL_GAP_UP" : "ACTUAL_GAP_DOWN",
    gapPoints,
    gapPercent,
    reason: gapPoints > 0 ? "Next open above previous close beyond tolerance" : "Next open below previous close beyond tolerance",
  };
}
