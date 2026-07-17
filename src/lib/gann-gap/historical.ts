// Phase 2I-C — Pure historical accuracy evaluator for Gann Gap Outlook.
//
// Given a series of frozen predictions and their (already-recorded)
// outcomes, produce win-rate metrics. Never fetches. Never predicts using
// data from the same or a future session (leakage guard is a hard invariant
// enforced by callers; here we only consume already-labelled pairs).

import type { GannGapOutlookLabel } from "./types";
import type { ActualGapOutcome } from "./outcome-rules";

export interface FrozenPredictionRecord {
  readonly predictionId: string;
  readonly tradingDate: string;         // session that produced the prediction (IST YYYY-MM-DD)
  readonly nextTradingDate: string;     // session the prediction is for
  readonly label: GannGapOutlookLabel;
  readonly reference: number | null;
  readonly formulaVersion: string;
  readonly frozenAt: string;            // ISO timestamp after 15:26 IST
}

export interface OutcomeRecord {
  readonly predictionId: string;
  readonly outcome: ActualGapOutcome;
  readonly ruleVersion: string;
  readonly evaluatedAt: string;         // must be strictly after the prediction's frozenAt
}

export interface HistoricalAccuracyMetrics {
  readonly total: number;
  readonly evaluated: number;
  readonly pending: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly winRatePct: number | null;
  readonly minSampleSize: number;
  readonly meetsMinSample: boolean;
  readonly perLabel: ReadonlyMap<GannGapOutlookLabel, { readonly n: number; readonly correct: number }>;
  readonly leakageDetected: number;     // count of records rejected for leakage
}

export const DEFAULT_MIN_HISTORICAL_SAMPLE = 20;

function correctFor(label: GannGapOutlookLabel, outcome: ActualGapOutcome): boolean | null {
  if (outcome === "OUTCOME_UNAVAILABLE") return null;
  if (label === "GAP_UP_RESEARCH") return outcome === "ACTUAL_GAP_UP";
  if (label === "GAP_DOWN_RESEARCH") return outcome === "ACTUAL_GAP_DOWN";
  if (label === "INDECISION" || label === "NO_VALID_SETUP") return outcome === "ACTUAL_FLAT";
  return null;
}

export function evaluateHistoricalAccuracy(
  predictions: readonly FrozenPredictionRecord[],
  outcomes: readonly OutcomeRecord[],
  opts: { minSampleSize?: number } = {},
): HistoricalAccuracyMetrics {
  const minSample = opts.minSampleSize ?? DEFAULT_MIN_HISTORICAL_SAMPLE;
  const outcomeById = new Map<string, OutcomeRecord>();
  for (const o of outcomes) outcomeById.set(o.predictionId, o);

  let correct = 0, incorrect = 0, evaluated = 0, leakage = 0;
  const perLabel = new Map<GannGapOutlookLabel, { n: number; correct: number }>();

  for (const p of predictions) {
    const o = outcomeById.get(p.predictionId);
    if (!o) continue;
    // Leakage guard: outcome must be evaluated strictly after freeze.
    if (Date.parse(o.evaluatedAt) <= Date.parse(p.frozenAt)) {
      leakage++;
      continue;
    }
    const c = correctFor(p.label, o.outcome);
    if (c === null) continue;
    evaluated++;
    if (c) correct++;
    else incorrect++;
    const bucket = perLabel.get(p.label) ?? { n: 0, correct: 0 };
    bucket.n++;
    if (c) bucket.correct++;
    perLabel.set(p.label, bucket);
  }

  const total = predictions.length;
  const pending = total - evaluated - leakage;
  const winRatePct = evaluated === 0 ? null : (correct / evaluated) * 100;
  return {
    total,
    evaluated,
    pending,
    correct,
    incorrect,
    winRatePct,
    minSampleSize: minSample,
    meetsMinSample: evaluated >= minSample,
    perLabel,
    leakageDetected: leakage,
  };
}
