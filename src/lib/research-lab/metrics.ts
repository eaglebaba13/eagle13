// Phase 3E — Deterministic study metrics.

import type {
  ConfusionMatrix,
  GapDirection,
  OutcomeThresholds,
  StudyMetrics,
} from "./types";
import { DEFAULT_OUTCOME_THRESHOLDS } from "./types";

export function emptyConfusion(): ConfusionMatrix {
  return {
    gapUpTruePositive: 0,
    gapUpFalsePositive: 0,
    gapUpFalseNegative: 0,
    gapDownTruePositive: 0,
    gapDownFalsePositive: 0,
    gapDownFalseNegative: 0,
    flatCount: 0,
    noTradeCount: 0,
    conflictCount: 0,
    total: 0,
  };
}

export type Pair = {
  readonly predicted: GapDirection | "NO_TRADE" | "CONFLICT" | null;
  readonly actual: GapDirection | null;
  readonly gapPoints: number | null;
  readonly mfe: number;
  readonly mae: number;
};

export function buildConfusion(pairs: readonly Pair[]): ConfusionMatrix {
  const m = { ...emptyConfusion() };
  for (const p of pairs) {
    m.total++;
    if (p.predicted === "NO_TRADE") { m.noTradeCount++; continue; }
    if (p.predicted === "CONFLICT") { m.conflictCount++; continue; }
    if (p.actual === "FLAT") m.flatCount++;
    if (p.predicted === "GAP_UP") {
      if (p.actual === "GAP_UP") m.gapUpTruePositive++;
      else m.gapUpFalsePositive++;
    } else if (p.actual === "GAP_UP") {
      m.gapUpFalseNegative++;
    }
    if (p.predicted === "GAP_DOWN") {
      if (p.actual === "GAP_DOWN") m.gapDownTruePositive++;
      else m.gapDownFalsePositive++;
    } else if (p.actual === "GAP_DOWN") {
      m.gapDownFalseNegative++;
    }
  }
  return m;
}

function safeDiv(n: number, d: number): number | null {
  if (d <= 0) return null;
  return n / d;
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function computeMetrics(
  pairs: readonly Pair[],
  thresholds: OutcomeThresholds = DEFAULT_OUTCOME_THRESHOLDS,
): StudyMetrics {
  const samples = pairs.length;
  const eligible = pairs.filter(
    (p) => p.predicted !== null && p.actual !== null && p.predicted !== "NO_TRADE" && p.predicted !== "CONFLICT",
  );
  const conf = buildConfusion(pairs);
  const totalDir = eligible.length;
  const correct = conf.gapUpTruePositive + conf.gapDownTruePositive
    + eligible.filter((p) => p.predicted === "FLAT" && p.actual === "FLAT").length;
  const accuracy = safeDiv(correct, totalDir);
  const precisionUp = safeDiv(
    conf.gapUpTruePositive,
    conf.gapUpTruePositive + conf.gapUpFalsePositive,
  );
  const recallUp = safeDiv(
    conf.gapUpTruePositive,
    conf.gapUpTruePositive + conf.gapUpFalseNegative,
  );
  const precisionDown = safeDiv(
    conf.gapDownTruePositive,
    conf.gapDownTruePositive + conf.gapDownFalsePositive,
  );
  const recallDown = safeDiv(
    conf.gapDownTruePositive,
    conf.gapDownTruePositive + conf.gapDownFalseNegative,
  );
  const balanced =
    recallUp != null && recallDown != null
      ? (recallUp + recallDown) / 2
      : null;
  const f1Up =
    precisionUp != null && recallUp != null && precisionUp + recallUp > 0
      ? (2 * precisionUp * recallUp) / (precisionUp + recallUp)
      : null;
  const f1Down =
    precisionDown != null && recallDown != null && precisionDown + recallDown > 0
      ? (2 * precisionDown * recallDown) / (precisionDown + recallDown)
      : null;
  // Specificity/FPR/FNR are directional: treat "correct-direction" as positive.
  const tp = conf.gapUpTruePositive + conf.gapDownTruePositive;
  const fp = conf.gapUpFalsePositive + conf.gapDownFalsePositive;
  const fn = conf.gapUpFalseNegative + conf.gapDownFalseNegative;
  const specificity = safeDiv(totalDir - tp - fp - fn, Math.max(totalDir - tp, 0));
  const fpr = safeDiv(fp, fp + Math.max(totalDir - tp - fp - fn, 0));
  const fnr = safeDiv(fn, fn + tp);
  const gapValues = pairs
    .map((p) => p.gapPoints)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avg =
    gapValues.length > 0 ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length : null;
  const mfeVals = pairs.map((p) => p.mfe);
  const maeVals = pairs.map((p) => p.mae);
  const mfeAvg = mfeVals.length ? mfeVals.reduce((a, b) => a + b, 0) / mfeVals.length : 0;
  const maeAvg = maeVals.length ? maeVals.reduce((a, b) => a + b, 0) / maeVals.length : 0;
  // Streaks
  let curCorrect = 0, curWrong = 0, maxCorrect = 0, maxWrong = 0;
  for (const p of eligible) {
    const correctPair =
      (p.predicted === "GAP_UP" && p.actual === "GAP_UP") ||
      (p.predicted === "GAP_DOWN" && p.actual === "GAP_DOWN");
    if (correctPair) { curCorrect++; curWrong = 0; maxCorrect = Math.max(maxCorrect, curCorrect); }
    else { curWrong++; curCorrect = 0; maxWrong = Math.max(maxWrong, curWrong); }
  }
  const insufficient = totalDir < thresholds.minSampleSize;
  return {
    samples,
    eligible: totalDir,
    excluded: samples - totalDir,
    coverage: samples > 0 ? totalDir / samples : 0,
    accuracy,
    balancedAccuracy: balanced,
    precisionGapUp: precisionUp,
    recallGapUp: recallUp,
    precisionGapDown: precisionDown,
    recallGapDown: recallDown,
    f1GapUp: f1Up,
    f1GapDown: f1Down,
    specificity,
    falsePositiveRate: fpr,
    falseNegativeRate: fnr,
    avgGapPoints: avg,
    medianGapPoints: median(gapValues),
    stdev: stdev(gapValues),
    mfeAvg,
    maeAvg,
    maxConsecutiveCorrect: maxCorrect,
    maxConsecutiveIncorrect: maxWrong,
    insufficientSample: insufficient,
  };
}
