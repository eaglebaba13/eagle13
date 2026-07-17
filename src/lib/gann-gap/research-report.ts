// Phase 2J — Pure evidence-based research report for Gann Gap Outlook.
//
// Read-only analytics. Consumes already-frozen predictions and evaluated
// outcomes plus optional per-record metadata (confirmations, VIX regime,
// confidence band, versions) and produces a sliced accuracy report with
// evidence-supported recommendations.
//
// Does NOT modify any formula, classifier, confidence rule, or persistence.
// Callers (admin UI / server functions) are responsible for supplying data.

import type { FrozenPredictionRecord, OutcomeRecord } from "./historical";
import {
  computeGannGapAnalytics,
  classifySampleStatus,
  toActualClass,
  toPredictedClass,
  type GannGapAnalytics,
  type GannGapSampleStatus,
} from "./analytics";
import type { GannGapConfidenceBand } from "./types";

export type ConfirmationAlignment =
  | "SUPPORTS_UP"
  | "SUPPORTS_DOWN"
  | "NEUTRAL"
  | "CONFLICT"
  | "UNAVAILABLE";

export type ConfirmationKind =
  | "decision"
  | "pcr"
  | "gti"
  | "breadth"
  | "vix"
  | "astro";

export type VixRegime = "LOW" | "MID" | "HIGH" | "UNKNOWN";

export function classifyVixRegime(vix: number | null | undefined): VixRegime {
  if (vix == null || !Number.isFinite(vix)) return "UNKNOWN";
  if (vix < 15) return "LOW";
  if (vix < 20) return "MID";
  return "HIGH";
}

/** Extended per-record metadata used to slice the report. All optional. */
export interface ResearchRecordMeta {
  readonly predictionId: string;
  readonly confidence?: GannGapConfidenceBand | null;
  readonly vix?: number | null;
  readonly confirmations?: Partial<Record<ConfirmationKind, ConfirmationAlignment>>;
  readonly formulaVersion?: string | null;
  readonly configVersion?: string | null;
  readonly outcomeVersion?: string | null;
}

export interface SliceMetrics {
  readonly n: number;
  readonly correct: number;
  readonly accuracyPct: number | null;
}

function emptySlice(): SliceMetrics {
  return { n: 0, correct: 0, accuracyPct: null };
}

function finalizeSlice(s: { n: number; correct: number }): SliceMetrics {
  return {
    n: s.n,
    correct: s.correct,
    accuracyPct: s.n === 0 ? null : (s.correct / s.n) * 100,
  };
}

export interface RecommendationItem {
  readonly area: string;
  readonly action: "KEEP" | "REMOVE" | "TUNE" | "RESEARCH_FURTHER";
  readonly rationale: string;
  readonly evidence: string;
}

export interface GannGapResearchReport {
  readonly generatedAt: string;
  readonly summary: GannGapAnalytics;
  readonly sampleStatus: GannGapSampleStatus;
  readonly byConfidence: Record<GannGapConfidenceBand | "UNKNOWN", SliceMetrics>;
  readonly byVixRegime: Record<VixRegime, SliceMetrics>;
  readonly byConfirmation: Record<
    ConfirmationKind,
    Record<"ALIGNED" | "CONFLICT" | "UNAVAILABLE" | "NEUTRAL", SliceMetrics>
  >;
  readonly byFormulaVersion: ReadonlyArray<{ readonly version: string; readonly slice: SliceMetrics }>;
  readonly byConfigVersion: ReadonlyArray<{ readonly version: string; readonly slice: SliceMetrics }>;
  readonly byOutcomeVersion: ReadonlyArray<{ readonly version: string; readonly slice: SliceMetrics }>;
  readonly strongSignals: readonly string[];
  readonly weakSignals: readonly string[];
  readonly failurePatterns: readonly string[];
  readonly biases: readonly string[];
  readonly recommendations: readonly RecommendationItem[];
  readonly limitations: readonly string[];
  readonly remainingBlockers: readonly string[];
}

const CONFIRMATION_KINDS: readonly ConfirmationKind[] = [
  "decision", "pcr", "gti", "breadth", "vix", "astro",
];

function alignedBucket(a: ConfirmationAlignment, predicted: "GAP_UP" | "GAP_DOWN" | "FLAT"):
  "ALIGNED" | "CONFLICT" | "UNAVAILABLE" | "NEUTRAL" {
  if (a === "UNAVAILABLE") return "UNAVAILABLE";
  if (a === "NEUTRAL") return "NEUTRAL";
  if (a === "CONFLICT") return "CONFLICT";
  if (predicted === "GAP_UP" && a === "SUPPORTS_UP") return "ALIGNED";
  if (predicted === "GAP_DOWN" && a === "SUPPORTS_DOWN") return "ALIGNED";
  if (predicted === "FLAT") return "NEUTRAL";
  return "CONFLICT";
}

export interface BuildReportInput {
  readonly predictions: readonly FrozenPredictionRecord[];
  readonly outcomes: readonly OutcomeRecord[];
  readonly meta?: readonly ResearchRecordMeta[];
  readonly now?: Date;
}

export function buildGannGapResearchReport(input: BuildReportInput): GannGapResearchReport {
  const summary = computeGannGapAnalytics(input.predictions, input.outcomes);
  const metaById = new Map<string, ResearchRecordMeta>();
  for (const m of input.meta ?? []) metaById.set(m.predictionId, m);
  const outcomeById = new Map<string, OutcomeRecord>();
  for (const o of input.outcomes) outcomeById.set(o.predictionId, o);

  const byConfidence: Record<GannGapConfidenceBand | "UNKNOWN", { n: number; correct: number }> = {
    EXPERIMENTAL_LOW: { n: 0, correct: 0 },
    EXPERIMENTAL_MEDIUM: { n: 0, correct: 0 },
    EXPERIMENTAL_HIGH: { n: 0, correct: 0 },
    UNKNOWN: { n: 0, correct: 0 },
  };
  const byVix: Record<VixRegime, { n: number; correct: number }> = {
    LOW: { n: 0, correct: 0 },
    MID: { n: 0, correct: 0 },
    HIGH: { n: 0, correct: 0 },
    UNKNOWN: { n: 0, correct: 0 },
  };
  const byConfirmation: Record<
    ConfirmationKind,
    Record<"ALIGNED" | "CONFLICT" | "UNAVAILABLE" | "NEUTRAL", { n: number; correct: number }>
  > = Object.fromEntries(
    CONFIRMATION_KINDS.map((k) => [k, {
      ALIGNED: { n: 0, correct: 0 },
      CONFLICT: { n: 0, correct: 0 },
      UNAVAILABLE: { n: 0, correct: 0 },
      NEUTRAL: { n: 0, correct: 0 },
    }]),
  ) as never;
  const versionAgg = {
    formula: new Map<string, { n: number; correct: number }>(),
    config: new Map<string, { n: number; correct: number }>(),
    outcome: new Map<string, { n: number; correct: number }>(),
  };

  for (const p of input.predictions) {
    const o = outcomeById.get(p.predictionId);
    if (!o) continue;
    if (Date.parse(o.evaluatedAt) <= Date.parse(p.frozenAt)) continue;
    const pc = toPredictedClass(p.label);
    const ac = toActualClass(o.outcome);
    if (!pc || !ac) continue;
    const correct = pc === ac ? 1 : 0;
    const meta = metaById.get(p.predictionId);

    const band = meta?.confidence ?? "UNKNOWN";
    byConfidence[band].n++;
    byConfidence[band].correct += correct;

    const regime = classifyVixRegime(meta?.vix ?? null);
    byVix[regime].n++;
    byVix[regime].correct += correct;

    for (const kind of CONFIRMATION_KINDS) {
      const a = meta?.confirmations?.[kind] ?? "UNAVAILABLE";
      const bucket = alignedBucket(a, pc);
      byConfirmation[kind][bucket].n++;
      byConfirmation[kind][bucket].correct += correct;
    }

    const bump = (map: Map<string, { n: number; correct: number }>, v: string | null | undefined) => {
      const key = v ?? p.formulaVersion ?? "unknown";
      const cur = map.get(key) ?? { n: 0, correct: 0 };
      cur.n++; cur.correct += correct;
      map.set(key, cur);
    };
    bump(versionAgg.formula, meta?.formulaVersion ?? p.formulaVersion);
    bump(versionAgg.config, meta?.configVersion ?? null);
    bump(versionAgg.outcome, meta?.outcomeVersion ?? null);
  }

  const finalize = <K extends string>(rec: Record<K, { n: number; correct: number }>): Record<K, SliceMetrics> => {
    const out = {} as Record<K, SliceMetrics>;
    for (const k of Object.keys(rec) as K[]) out[k] = finalizeSlice(rec[k]);
    return out;
  };

  const confidenceFinal = finalize(byConfidence);
  const vixFinal = finalize(byVix);
  const confirmationFinal = {} as GannGapResearchReport["byConfirmation"];
  for (const kind of CONFIRMATION_KINDS) {
    confirmationFinal[kind] = finalize(byConfirmation[kind]);
  }

  const versionList = (m: Map<string, { n: number; correct: number }>) =>
    Array.from(m.entries())
      .map(([version, v]) => ({ version, slice: finalizeSlice(v) }))
      .sort((a, b) => (a.version < b.version ? -1 : 1));

  // ── Insights ─────────────────────────────────────────────────────
  const strong: string[] = [];
  const weak: string[] = [];
  const failures: string[] = [];
  const biases: string[] = [];
  const recs: RecommendationItem[] = [];

  const baseline = summary.accuracyPct ?? 0;
  const hi = confidenceFinal.EXPERIMENTAL_HIGH;
  const lo = confidenceFinal.EXPERIMENTAL_LOW;
  if (hi.n >= 10 && (hi.accuracyPct ?? 0) - baseline >= 5) {
    strong.push(`HIGH-confidence predictions beat baseline (${(hi.accuracyPct ?? 0).toFixed(1)}% vs ${baseline.toFixed(1)}%).`);
  }
  if (lo.n >= 10 && baseline - (lo.accuracyPct ?? 0) >= 5) {
    strong.push(`LOW-confidence predictions underperform baseline as expected (${(lo.accuracyPct ?? 0).toFixed(1)}%).`);
  }
  if (hi.n >= 10 && (hi.accuracyPct ?? 0) <= baseline) {
    weak.push("HIGH-confidence band does not outperform baseline — confidence signal may be miscalibrated.");
    recs.push({
      area: "confidence-bands",
      action: "RESEARCH_FURTHER",
      rationale: "HIGH-confidence accuracy ≤ overall baseline.",
      evidence: `HIGH n=${hi.n} acc=${(hi.accuracyPct ?? 0).toFixed(1)}%, baseline=${baseline.toFixed(1)}%.`,
    });
  }

  const perClass = summary.perClass;
  if (perClass.GAP_UP.n >= 5 && perClass.GAP_DOWN.n >= 5) {
    const upP = perClass.GAP_UP.precisionPct ?? 0;
    const dnP = perClass.GAP_DOWN.precisionPct ?? 0;
    if (Math.abs(upP - dnP) >= 10) {
      biases.push(`Directional bias: GAP_UP precision ${upP.toFixed(1)}% vs GAP_DOWN ${dnP.toFixed(1)}%.`);
    }
  }
  if (perClass.FLAT.n >= 5 && (perClass.FLAT.precisionPct ?? 0) < 40) {
    failures.push(`FLAT predictions rarely realise (precision ${(perClass.FLAT.precisionPct ?? 0).toFixed(1)}%).`);
  }

  for (const kind of CONFIRMATION_KINDS) {
    const aligned = confirmationFinal[kind].ALIGNED;
    const conflict = confirmationFinal[kind].CONFLICT;
    if (aligned.n >= 10 && conflict.n >= 5) {
      const delta = (aligned.accuracyPct ?? 0) - (conflict.accuracyPct ?? 0);
      if (delta >= 10) {
        strong.push(`${kind} confirmation is informative (aligned=${(aligned.accuracyPct ?? 0).toFixed(1)}% vs conflict=${(conflict.accuracyPct ?? 0).toFixed(1)}%).`);
        recs.push({
          area: `confirmation:${kind}`,
          action: "KEEP",
          rationale: "Aligned outcomes materially beat conflicting outcomes.",
          evidence: `Δ=${delta.toFixed(1)}% (n aligned=${aligned.n}, n conflict=${conflict.n}).`,
        });
      } else if (delta <= 2) {
        weak.push(`${kind} confirmation shows negligible signal (Δ=${delta.toFixed(1)}%).`);
        recs.push({
          area: `confirmation:${kind}`,
          action: "RESEARCH_FURTHER",
          rationale: "Aligned vs conflict accuracy is indistinguishable.",
          evidence: `aligned=${(aligned.accuracyPct ?? 0).toFixed(1)}%, conflict=${(conflict.accuracyPct ?? 0).toFixed(1)}% (n=${aligned.n + conflict.n}).`,
        });
      }
    }
  }

  const vixHigh = vixFinal.HIGH;
  const vixLow = vixFinal.LOW;
  if (vixHigh.n >= 5 && vixLow.n >= 5) {
    const delta = (vixLow.accuracyPct ?? 0) - (vixHigh.accuracyPct ?? 0);
    if (delta >= 10) {
      failures.push(`High-VIX regime underperforms (LOW=${(vixLow.accuracyPct ?? 0).toFixed(1)}% vs HIGH=${(vixHigh.accuracyPct ?? 0).toFixed(1)}%).`);
      recs.push({
        area: "vix-regime",
        action: "TUNE",
        rationale: "Accuracy collapses in high-VIX regime.",
        evidence: `Δ=${delta.toFixed(1)}% between LOW and HIGH regimes (n=${vixLow.n}/${vixHigh.n}).`,
      });
    }
  }

  const limitations: string[] = [];
  if (summary.evaluated < 30) limitations.push(`Evaluated sample (${summary.evaluated}) below INSUFFICIENT_SAMPLE threshold (30).`);
  else if (summary.evaluated < 100) limitations.push(`Evaluated sample (${summary.evaluated}) is PRELIMINARY (<100).`);
  if (summary.leakageDetected > 0) limitations.push(`${summary.leakageDetected} record(s) rejected for evaluation leakage.`);
  if (summary.pending > 0) limitations.push(`${summary.pending} prediction(s) awaiting outcome evaluation.`);
  if ((input.meta?.length ?? 0) === 0) limitations.push("No per-record metadata supplied — slice metrics default to UNKNOWN.");

  const blockers: string[] = [];
  if (summary.evaluated < 30) blockers.push("Insufficient evaluated sample for Release Candidate certification.");
  if (summary.leakageDetected > 0) blockers.push("Leakage detected — investigate outcome timestamps before RC.");
  if ((summary.accuracyPct ?? 0) < 40 && summary.evaluated >= 30) blockers.push("Overall accuracy below 40% on ≥30 samples.");

  // Baseline KEEP if everything looks OK.
  if (recs.length === 0 && summary.evaluated >= 30 && (summary.accuracyPct ?? 0) >= 50) {
    recs.push({
      area: "gann-gap-engine",
      action: "KEEP",
      rationale: "Baseline accuracy holds on evaluated sample.",
      evidence: `n=${summary.evaluated}, accuracy=${(summary.accuracyPct ?? 0).toFixed(1)}%.`,
    });
  }

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    summary,
    sampleStatus: classifySampleStatus(summary.evaluated),
    byConfidence: confidenceFinal,
    byVixRegime: vixFinal,
    byConfirmation: confirmationFinal,
    byFormulaVersion: versionList(versionAgg.formula),
    byConfigVersion: versionList(versionAgg.config),
    byOutcomeVersion: versionList(versionAgg.outcome),
    strongSignals: strong,
    weakSignals: weak,
    failurePatterns: failures,
    biases,
    recommendations: recs,
    limitations,
    remainingBlockers: blockers,
  };
}

export { emptySlice };