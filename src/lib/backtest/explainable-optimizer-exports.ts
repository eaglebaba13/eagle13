// Phase 21.9 · Stage 1 — Explainable Optimizer exports (CSV/JSON).
// Provenance-first. Never mutates state; consumes an OptimizerResult.

import type { OptimizerResult } from "./explainable-optimizer";

export type OptimizerExportProvenance = {
  readonly researchRunId: string;
  readonly generatedAt: string;
  readonly provider: string;
  readonly instrument: string;
  readonly from: string;
  readonly to: string;
};

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function joinCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function buildOptimizerSummaryCsv(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  const header: (readonly unknown[])[] = [
    ["# EXPLAINABLE_OPTIMIZER_V1"],
    ["# " + r.disclaimer],
    [`# runId=${r.runId}`],
    [`# researchRunId=${p.researchRunId}`],
    [`# strategy=${r.strategy}`, `formulaVersion=${r.formulaVersion}`],
    [`# provider=${p.provider}`, `instrument=${p.instrument}`, `from=${p.from}`, `to=${p.to}`],
    [`# generatedAt=${p.generatedAt}`],
    [],
    ["field", "value"],
    ["objectiveScore", r.objectiveScore.toFixed(4)],
    ["overfitRisk", r.overfitRisk],
    ["confidence", r.confidence],
    ["acceptedCells", String(r.evidence.acceptedCells ?? "")],
    ["totalCells", String(r.evidence.totalCells ?? "")],
    ["surface", String(r.evidence.surface ?? "")],
    ["robustness", String(r.evidence.robustness ?? "")],
    ["calibration", String(r.evidence.calibration ?? "")],
  ];
  return joinCsv(header) + "\n";
}

export function buildOptimizerRecommendedRegionCsv(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  const rows: (readonly unknown[])[] = [
    ["# EXPLAINABLE_OPTIMIZER_V1"],
    ["# " + r.disclaimer],
    [`# runId=${r.runId}`, `researchRunId=${p.researchRunId}`],
    [],
    ["parameter", "recommended", "safe_min", "safe_max"],
  ];
  if (r.recommendedRegion) {
    for (const [k, v] of Object.entries(r.recommendedRegion.center)) {
      const range = r.recommendedRegion.safeRange[k];
      rows.push([k, v, range?.min ?? v, range?.max ?? v]);
    }
  }
  return joinCsv(rows) + "\n";
}

export function buildOptimizerAlternativesCsv(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  const rows: (readonly unknown[])[] = [
    ["# EXPLAINABLE_OPTIMIZER_V1"],
    ["# " + r.disclaimer],
    [`# runId=${r.runId}`, `researchRunId=${p.researchRunId}`],
    [],
    ["label", "parameters", "objectiveScore", "meanExpectancy", "meanDrawdown", "meanTrades", "monteCarloP5", "overfitRisk", "confidence", "expectedBehavior"],
  ];
  for (const a of r.alternatives) {
    rows.push([
      a.label, JSON.stringify(a.center),
      a.objectiveScore.toFixed(4), a.meanExpectancy.toFixed(4),
      a.meanDrawdown.toFixed(4), a.meanTrades.toFixed(2),
      a.monteCarloP5.toFixed(2), a.overfitRisk, a.confidence, a.expectedBehavior,
    ]);
  }
  return joinCsv(rows) + "\n";
}

export function buildOptimizerRejectedCsv(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  const rows: (readonly unknown[])[] = [
    ["# EXPLAINABLE_OPTIMIZER_V1"],
    ["# " + r.disclaimer],
    [`# runId=${r.runId}`, `researchRunId=${p.researchRunId}`],
    [],
    ["parameters", "objectiveScore", "reasons"],
  ];
  for (const rj of r.rejectedRegions) {
    rows.push([JSON.stringify(rj.center), rj.objectiveScore.toFixed(4), rj.reasons.join(" | ")]);
  }
  return joinCsv(rows) + "\n";
}

export function buildOptimizerJson(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  return JSON.stringify({
    version: r.version,
    disclaimer: r.disclaimer,
    runId: r.runId,
    provenance: p,
    strategy: r.strategy,
    formulaVersion: r.formulaVersion,
    weights: r.weights,
    gates: r.gates,
    recommended: r.recommendedRegion ? {
      parameters: r.recommendedRegion.center,
      safeRange: r.recommendedRegion.safeRange,
      objectiveScore: r.recommendedRegion.objectiveScore,
      meanExpectancy: r.recommendedRegion.meanExpectancy,
      meanProfitFactor: r.recommendedRegion.meanProfitFactor,
      meanDrawdown: r.recommendedRegion.meanDrawdown,
      meanTrades: r.recommendedRegion.meanTrades,
      monteCarloP5: r.recommendedRegion.monteCarloP5,
      neighborCount: r.recommendedRegion.neighborCount,
    } : null,
    objectiveContributions: r.objectiveContributions,
    objectiveScore: r.objectiveScore,
    overfitRisk: r.overfitRisk,
    confidence: r.confidence,
    alternatives: r.alternatives,
    rejectedRegions: r.rejectedRegions,
    rejectionReasons: r.rejectionReasons,
    explanations: r.explanations,
    evidence: r.evidence,
  }, null, 2);
}

export function buildOptimizerResearchPresetJson(
  r: OptimizerResult,
  p: OptimizerExportProvenance,
): string {
  return JSON.stringify({
    kind: "RESEARCH_PRESET",
    disclaimer: r.disclaimer,
    note: "CREATE RESEARCH PRESET — do not apply directly to live/production configuration.",
    optimizerRunId: r.runId,
    strategy: r.strategy,
    formulaVersion: r.formulaVersion,
    parameters: r.recommendedParameters,
    safeRange: r.recommendedRegion?.safeRange ?? null,
    confidence: r.confidence,
    overfitRisk: r.overfitRisk,
    provenance: p,
  }, null, 2);
}
