// Phase 2I-D — Pure analytics for Gann Gap Outlook historical validation.
// Confusion matrix, per-class precision, sample-status classifier.
// Consumes only frozen predictions + evaluated outcomes. No fetches.

import type { FrozenPredictionRecord, OutcomeRecord } from "./historical";
import type { GannGapOutlookLabel } from "./types";
import type { ActualGapOutcome } from "./outcome-rules";

export type GannGapSampleStatus =
  | "INSUFFICIENT_SAMPLE"
  | "PRELIMINARY"
  | "RESEARCH_VALIDATED";

export function classifySampleStatus(evaluated: number): GannGapSampleStatus {
  if (evaluated < 30) return "INSUFFICIENT_SAMPLE";
  if (evaluated < 100) return "PRELIMINARY";
  return "RESEARCH_VALIDATED";
}

export const PREDICTED_CLASSES = ["GAP_UP", "GAP_DOWN", "FLAT"] as const;
export type PredictedClass = (typeof PREDICTED_CLASSES)[number];
export const ACTUAL_CLASSES = ["GAP_UP", "GAP_DOWN", "FLAT"] as const;
export type ActualClass = (typeof ACTUAL_CLASSES)[number];

export function toPredictedClass(label: GannGapOutlookLabel): PredictedClass | null {
  if (label === "GAP_UP_RESEARCH") return "GAP_UP";
  if (label === "GAP_DOWN_RESEARCH") return "GAP_DOWN";
  if (label === "INDECISION" || label === "NO_VALID_SETUP") return "FLAT";
  return null;
}

export function toActualClass(outcome: ActualGapOutcome): ActualClass | null {
  if (outcome === "ACTUAL_GAP_UP") return "GAP_UP";
  if (outcome === "ACTUAL_GAP_DOWN") return "GAP_DOWN";
  if (outcome === "ACTUAL_FLAT") return "FLAT";
  return null;
}

export interface ConfusionMatrix {
  readonly counts: Record<PredictedClass, Record<ActualClass, number>>;
  readonly rowTotals: Record<PredictedClass, number>;
  readonly colTotals: Record<ActualClass, number>;
  readonly grand: number;
}

export interface ClassPrecision {
  readonly n: number;
  readonly correct: number;
  readonly precisionPct: number | null;
}

export interface GannGapAnalytics {
  readonly total: number;
  readonly evaluated: number;
  readonly pending: number;
  readonly leakageDetected: number;
  readonly correct: number;
  readonly incorrect: number;
  readonly accuracyPct: number | null;
  readonly sampleStatus: GannGapSampleStatus;
  readonly matrix: ConfusionMatrix;
  readonly perClass: Record<PredictedClass, ClassPrecision>;
  readonly gapUpPrecisionPct: number | null;
  readonly gapDownPrecisionPct: number | null;
  readonly flatPrecisionPct: number | null;
}

export function computeGannGapAnalytics(
  predictions: readonly FrozenPredictionRecord[],
  outcomes: readonly OutcomeRecord[],
): GannGapAnalytics {
  const outcomeById = new Map<string, OutcomeRecord>();
  for (const o of outcomes) outcomeById.set(o.predictionId, o);

  const counts: Record<PredictedClass, Record<ActualClass, number>> = {
    GAP_UP:   { GAP_UP: 0, GAP_DOWN: 0, FLAT: 0 },
    GAP_DOWN: { GAP_UP: 0, GAP_DOWN: 0, FLAT: 0 },
    FLAT:     { GAP_UP: 0, GAP_DOWN: 0, FLAT: 0 },
  };
  const rowTotals: Record<PredictedClass, number> = { GAP_UP: 0, GAP_DOWN: 0, FLAT: 0 };
  const colTotals: Record<ActualClass, number> = { GAP_UP: 0, GAP_DOWN: 0, FLAT: 0 };
  let grand = 0;
  let evaluated = 0;
  let leakage = 0;
  let correct = 0;

  for (const p of predictions) {
    const o = outcomeById.get(p.predictionId);
    if (!o) continue;
    if (Date.parse(o.evaluatedAt) <= Date.parse(p.frozenAt)) {
      leakage++;
      continue;
    }
    const pc = toPredictedClass(p.label);
    const ac = toActualClass(o.outcome);
    if (!pc || !ac) continue;
    counts[pc][ac]++;
    rowTotals[pc]++;
    colTotals[ac]++;
    grand++;
    evaluated++;
    if (pc === ac) correct++;
  }

  const incorrect = evaluated - correct;
  const total = predictions.length;
  const pending = total - evaluated - leakage;

  const perClass: Record<PredictedClass, ClassPrecision> = {
    GAP_UP: {
      n: rowTotals.GAP_UP,
      correct: counts.GAP_UP.GAP_UP,
      precisionPct: rowTotals.GAP_UP === 0 ? null : (counts.GAP_UP.GAP_UP / rowTotals.GAP_UP) * 100,
    },
    GAP_DOWN: {
      n: rowTotals.GAP_DOWN,
      correct: counts.GAP_DOWN.GAP_DOWN,
      precisionPct: rowTotals.GAP_DOWN === 0 ? null : (counts.GAP_DOWN.GAP_DOWN / rowTotals.GAP_DOWN) * 100,
    },
    FLAT: {
      n: rowTotals.FLAT,
      correct: counts.FLAT.FLAT,
      precisionPct: rowTotals.FLAT === 0 ? null : (counts.FLAT.FLAT / rowTotals.FLAT) * 100,
    },
  };

  return {
    total,
    evaluated,
    pending,
    leakageDetected: leakage,
    correct,
    incorrect,
    accuracyPct: evaluated === 0 ? null : (correct / evaluated) * 100,
    sampleStatus: classifySampleStatus(evaluated),
    matrix: { counts, rowTotals, colTotals, grand },
    perClass,
    gapUpPrecisionPct: perClass.GAP_UP.precisionPct,
    gapDownPrecisionPct: perClass.GAP_DOWN.precisionPct,
    flatPrecisionPct: perClass.FLAT.precisionPct,
  };
}
