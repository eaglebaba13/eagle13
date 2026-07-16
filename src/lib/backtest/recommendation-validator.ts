// Phase 21.8 · Stage 2 — Recommendation Validation Engine.
//
// Pure, deterministic, research-only. Consumes historical recommendation
// observations (recommendation output + realised outcome) and returns
// accuracy, precision/recall/F1, Brier score, confusion matrix,
// confidence-calibration buckets, drift breakdowns, reliability rating
// and a stable Run ID. Never fetches data, never mutates inputs, never
// touches broker / decision / risk / live paths, never modifies the
// recommendation engine itself.

import type { MarketRegime } from "./market-regime";
import type {
  RecommendationStatus,
  RecommendationStrategyId,
} from "./regime-recommendation";

export const RECOMMENDATION_VALIDATOR_VERSION =
  "RECOMMENDATION_VALIDATOR_V1" as const;

export const RECOMMENDATION_VALIDATOR_DISCLAIMER =
  "RESEARCH VALIDATION — NOT A LIVE TRADE SIGNAL";

export type RecommendationOutcome = "WIN" | "LOSS" | "FLAT" | "NO_TRADE";

export type ReliabilityRating =
  | "EXCELLENT"
  | "GOOD"
  | "FAIR"
  | "POOR"
  | "UNRELIABLE";

/**
 * A single historical recommendation observation. The recommendation was
 * produced upstream by the existing regime-recommendation engine; the
 * outcome is the realised research-side result (never a live trade).
 */
export type RecommendationObservation = {
  readonly recommendationRunId: string;
  readonly instrument: string;
  readonly timeframe: string;
  readonly regime: MarketRegime;
  /** Optional walk-forward window index / label for drift analysis. */
  readonly window?: string | number | null;
  readonly recommendedStrategy: RecommendationStrategyId | null;
  readonly status: RecommendationStatus;
  /** Recommendation confidence 0..1. */
  readonly confidence: number;
  readonly outcome: RecommendationOutcome;
  readonly pnl?: number;
};

// ---------------------------------------------------------------------------
// Classification helpers.

const POSITIVE_STATUSES: ReadonlySet<RecommendationStatus> = new Set([
  "STRONG_RECOMMENDATION",
  "RECOMMENDATION",
  "CONDITIONAL",
]);

/** A recommendation is "positive" if the engine actually suggested trading. */
export function isPositiveRecommendation(s: RecommendationStatus): boolean {
  return POSITIVE_STATUSES.has(s);
}

/** Outcomes usable for calibration/scoring (excludes FLAT / NO_TRADE). */
function isDecided(o: RecommendationOutcome): boolean {
  return o === "WIN" || o === "LOSS";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round(n: number, p = 4): number {
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Confidence buckets.

export type CalibrationBucket = {
  readonly key: string; // e.g. "50-60"
  readonly lower: number; // inclusive, 0..1
  readonly upper: number; // exclusive except for last (0..1)
  readonly count: number;
  readonly decidedCount: number; // wins + losses only
  readonly wins: number;
  readonly losses: number;
  readonly flats: number;
  readonly actualAccuracy: number; // 0..1 over decided
  readonly expectedConfidence: number; // 0..1 mean of confidences in bucket
  readonly calibrationError: number; // |expected - actual|
};

const BUCKET_EDGES: readonly [number, number, string][] = [
  [0.5, 0.6, "50-60"],
  [0.6, 0.7, "60-70"],
  [0.7, 0.8, "70-80"],
  [0.8, 0.9, "80-90"],
  [0.9, 1.0001, "90-100"],
];

function bucketFor(conf: number): number {
  const c = clamp01(conf);
  for (let i = 0; i < BUCKET_EDGES.length; i++) {
    const [lo, hi] = BUCKET_EDGES[i];
    if (c >= lo && c < hi) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Confusion matrix.

export type ConfusionMatrix = {
  readonly tp: number;
  readonly fp: number;
  readonly tn: number;
  readonly fn: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
};

function buildConfusionMatrix(
  obs: readonly RecommendationObservation[],
): ConfusionMatrix {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const o of obs) {
    if (!isDecided(o.outcome)) continue;
    const predicted = isPositiveRecommendation(o.status);
    const actual = o.outcome === "WIN";
    if (predicted && actual) tp += 1;
    else if (predicted && !actual) fp += 1;
    else if (!predicted && actual) fn += 1;
    else tn += 1;
  }
  const precision = safeDiv(tp, tp + fp);
  const recall = safeDiv(tp, tp + fn);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = safeDiv(fp, fp + tn);
  const fnr = safeDiv(fn, fn + tp);
  return {
    tp,
    fp,
    tn,
    fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    falsePositiveRate: round(fpr),
    falseNegativeRate: round(fnr),
  };
}

// ---------------------------------------------------------------------------
// Confidence histogram + calibration buckets.

function buildBuckets(
  obs: readonly RecommendationObservation[],
): readonly CalibrationBucket[] {
  const acc = BUCKET_EDGES.map(([lo, hi, key]) => ({
    key,
    lower: lo,
    upper: Math.min(hi, 1),
    count: 0,
    decidedCount: 0,
    wins: 0,
    losses: 0,
    flats: 0,
    confSum: 0,
  }));
  for (const o of obs) {
    // Calibration only tracks positive-signal observations — an AVOID
    // recommendation has no meaningful "was the prediction right?" pairing
    // with a downstream WIN/LOSS.
    if (!isPositiveRecommendation(o.status)) continue;
    const idx = bucketFor(o.confidence);
    if (idx < 0) continue;
    const b = acc[idx];
    b.count += 1;
    b.confSum += clamp01(o.confidence);
    if (o.outcome === "WIN") {
      b.wins += 1;
      b.decidedCount += 1;
    } else if (o.outcome === "LOSS") {
      b.losses += 1;
      b.decidedCount += 1;
    } else if (o.outcome === "FLAT") {
      b.flats += 1;
    }
  }
  return acc.map((b) => {
    const actual = safeDiv(b.wins, b.decidedCount);
    const expected = safeDiv(b.confSum, b.count);
    return {
      key: b.key,
      lower: b.lower,
      upper: b.upper,
      count: b.count,
      decidedCount: b.decidedCount,
      wins: b.wins,
      losses: b.losses,
      flats: b.flats,
      actualAccuracy: round(actual),
      expectedConfidence: round(expected),
      calibrationError: round(Math.abs(expected - actual)),
    };
  });
}

/**
 * Expected Calibration Error weighted by sample size across decided
 * observations in the positive-signal buckets.
 */
function expectedCalibrationError(
  buckets: readonly CalibrationBucket[],
): number {
  let totalDecided = 0;
  for (const b of buckets) totalDecided += b.decidedCount;
  if (totalDecided === 0) return 0;
  let ece = 0;
  for (const b of buckets) {
    if (b.decidedCount === 0) continue;
    ece += (b.decidedCount / totalDecided) * b.calibrationError;
  }
  return ece;
}

// ---------------------------------------------------------------------------
// Brier score.

function brierScore(obs: readonly RecommendationObservation[]): number {
  let sum = 0;
  let n = 0;
  for (const o of obs) {
    if (!isPositiveRecommendation(o.status)) continue;
    if (!isDecided(o.outcome)) continue;
    const p = clamp01(o.confidence);
    const y = o.outcome === "WIN" ? 1 : 0;
    sum += (p - y) * (p - y);
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

// ---------------------------------------------------------------------------
// Drift analysis.

export type DriftBucketReport = {
  readonly key: string;
  readonly count: number;
  readonly decidedCount: number;
  readonly accuracy: number;
  readonly deltaVsOverall: number;
  readonly drift: "STABLE" | "MODERATE" | "SIGNIFICANT";
};

function driftClass(delta: number): DriftBucketReport["drift"] {
  const a = Math.abs(delta);
  if (a >= 0.15) return "SIGNIFICANT";
  if (a >= 0.07) return "MODERATE";
  return "STABLE";
}

function driftBy(
  obs: readonly RecommendationObservation[],
  keyOf: (o: RecommendationObservation) => string | null | undefined,
  overall: number,
): readonly DriftBucketReport[] {
  const map = new Map<
    string,
    { count: number; decided: number; wins: number }
  >();
  for (const o of obs) {
    const k = keyOf(o);
    if (k == null || k === "") continue;
    let row = map.get(k);
    if (!row) {
      row = { count: 0, decided: 0, wins: 0 };
      map.set(k, row);
    }
    row.count += 1;
    if (o.outcome === "WIN") {
      row.decided += 1;
      row.wins += 1;
    } else if (o.outcome === "LOSS") {
      row.decided += 1;
    }
  }
  const out: DriftBucketReport[] = [];
  for (const [k, v] of map) {
    const acc = safeDiv(v.wins, v.decided);
    const delta = acc - overall;
    out.push({
      key: k,
      count: v.count,
      decidedCount: v.decided,
      accuracy: round(acc),
      deltaVsOverall: round(delta),
      drift: driftClass(delta),
    });
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// Reliability rating (transparent thresholds).

function rateReliability(
  accuracy: number,
  ece: number,
  coverage: number,
): ReliabilityRating {
  if (accuracy >= 0.7 && ece <= 0.05 && coverage >= 0.8) return "EXCELLENT";
  if (accuracy >= 0.6 && ece <= 0.1 && coverage >= 0.6) return "GOOD";
  if (accuracy >= 0.5 && ece <= 0.15 && coverage >= 0.4) return "FAIR";
  if (accuracy >= 0.4) return "POOR";
  return "UNRELIABLE";
}

// ---------------------------------------------------------------------------
// Run ID.

export type ValidatorRunIdInput = {
  readonly observations: readonly RecommendationObservation[];
};

export function computeValidatorRunId(input: ValidatorRunIdInput): string {
  const parts = input.observations
    .map((o) =>
      [
        o.recommendationRunId,
        o.instrument,
        o.timeframe,
        o.regime,
        o.window ?? "",
        o.recommendedStrategy ?? "",
        o.status,
        o.confidence.toFixed(6),
        o.outcome,
      ].join(":"),
    )
    .join(";");
  return `${RECOMMENDATION_VALIDATOR_VERSION}:${fnv1a(parts)}`;
}

// ---------------------------------------------------------------------------
// Main report.

export type RecommendationValidationReport = {
  readonly version: typeof RECOMMENDATION_VALIDATOR_VERSION;
  readonly disclaimer: string;
  readonly runId: string;
  readonly generatedAt: string;

  readonly totals: {
    readonly observations: number;
    readonly positiveRecommendations: number;
    readonly negativeRecommendations: number;
    readonly decidedOutcomes: number;
    readonly wins: number;
    readonly losses: number;
    readonly flats: number;
    readonly noTrades: number;
  };

  readonly accuracy: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly brierScore: number;
  readonly expectedCalibrationError: number;
  readonly coverage: number; // decided / totalObs
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly highConfidenceAccuracy: number; // conf >= 0.75
  readonly lowConfidenceAccuracy: number; // conf < 0.75

  readonly confusion: ConfusionMatrix;
  readonly buckets: readonly CalibrationBucket[];
  readonly reliability: ReliabilityRating;

  readonly drift: {
    readonly byInstrument: readonly DriftBucketReport[];
    readonly byTimeframe: readonly DriftBucketReport[];
    readonly byRegime: readonly DriftBucketReport[];
    readonly byWindow: readonly DriftBucketReport[];
  };
};

export type ValidateRecommendationsInput = {
  readonly observations: readonly RecommendationObservation[];
  /** Optional injected clock — makes generatedAt deterministic in tests. */
  readonly now?: () => string;
};

export function validateRecommendations(
  input: ValidateRecommendationsInput,
): RecommendationValidationReport {
  const obs = input.observations;
  const totalObs = obs.length;
  let positive = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let noTrades = 0;
  let hiConfDecided = 0;
  let hiConfWins = 0;
  let loConfDecided = 0;
  let loConfWins = 0;

  for (const o of obs) {
    const pos = isPositiveRecommendation(o.status);
    if (pos) positive += 1;
    if (o.outcome === "WIN") wins += 1;
    else if (o.outcome === "LOSS") losses += 1;
    else if (o.outcome === "FLAT") flats += 1;
    else noTrades += 1;

    if (isDecided(o.outcome)) {
      const win = o.outcome === "WIN" ? 1 : 0;
      if (o.confidence >= 0.75) {
        hiConfDecided += 1;
        hiConfWins += win;
      } else {
        loConfDecided += 1;
        loConfWins += win;
      }
    }
  }

  const confusion = buildConfusionMatrix(obs);
  const decidedTotal = wins + losses;
  const accuracy = safeDiv(wins, decidedTotal);
  const coverage = safeDiv(decidedTotal, totalObs);

  const buckets = buildBuckets(obs);
  const ece = expectedCalibrationError(buckets);
  const brier = brierScore(obs);

  const drift = {
    byInstrument: driftBy(obs, (o) => o.instrument, accuracy),
    byTimeframe: driftBy(obs, (o) => o.timeframe, accuracy),
    byRegime: driftBy(obs, (o) => o.regime, accuracy),
    byWindow: driftBy(
      obs,
      (o) => (o.window == null ? null : String(o.window)),
      accuracy,
    ),
  };

  const reliability = rateReliability(accuracy, ece, coverage);
  const runId = computeValidatorRunId({ observations: obs });
  const generatedAt = input.now ? input.now() : "1970-01-01T00:00:00.000Z";

  return {
    version: RECOMMENDATION_VALIDATOR_VERSION,
    disclaimer: RECOMMENDATION_VALIDATOR_DISCLAIMER,
    runId,
    generatedAt,
    totals: {
      observations: totalObs,
      positiveRecommendations: positive,
      negativeRecommendations: totalObs - positive,
      decidedOutcomes: decidedTotal,
      wins,
      losses,
      flats,
      noTrades,
    },
    accuracy: round(accuracy),
    precision: confusion.precision,
    recall: confusion.recall,
    f1: confusion.f1,
    brierScore: round(brier),
    expectedCalibrationError: round(ece),
    coverage: round(coverage),
    falsePositiveRate: confusion.falsePositiveRate,
    falseNegativeRate: confusion.falseNegativeRate,
    highConfidenceAccuracy: round(safeDiv(hiConfWins, hiConfDecided)),
    lowConfidenceAccuracy: round(safeDiv(loConfWins, loConfDecided)),
    confusion,
    buckets,
    reliability,
    drift,
  };
}

// ---------------------------------------------------------------------------
// Exports.

function csvEscape(s: unknown): string {
  const v = s == null ? "" : String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function exportValidationCsv(rep: RecommendationValidationReport): string {
  const rows: string[] = [];
  rows.push(`# ${rep.disclaimer}`);
  rows.push(`# validatorRunId=${rep.runId}`);
  rows.push(`# reliability=${rep.reliability}`);
  rows.push(
    `# accuracy=${rep.accuracy} precision=${rep.precision} recall=${rep.recall} f1=${rep.f1} brier=${rep.brierScore} ece=${rep.expectedCalibrationError} coverage=${rep.coverage}`,
  );
  rows.push("");
  rows.push("# Confusion Matrix");
  rows.push("tp,fp,tn,fn,fpr,fnr");
  rows.push(
    [
      rep.confusion.tp,
      rep.confusion.fp,
      rep.confusion.tn,
      rep.confusion.fn,
      rep.confusion.falsePositiveRate,
      rep.confusion.falseNegativeRate,
    ].join(","),
  );
  rows.push("");
  rows.push("# Calibration Buckets");
  rows.push(
    "bucket,count,decided,wins,losses,flats,actualAccuracy,expectedConfidence,calibrationError",
  );
  for (const b of rep.buckets) {
    rows.push(
      [
        b.key,
        b.count,
        b.decidedCount,
        b.wins,
        b.losses,
        b.flats,
        b.actualAccuracy,
        b.expectedConfidence,
        b.calibrationError,
      ].join(","),
    );
  }
  rows.push("");
  rows.push("# Drift by Regime");
  rows.push("key,count,decided,accuracy,deltaVsOverall,drift");
  for (const d of rep.drift.byRegime) {
    rows.push(
      [
        csvEscape(d.key),
        d.count,
        d.decidedCount,
        d.accuracy,
        d.deltaVsOverall,
        d.drift,
      ].join(","),
    );
  }
  return rows.join("\n");
}

export function exportValidationJson(rep: RecommendationValidationReport): string {
  return JSON.stringify(rep, null, 2);
}