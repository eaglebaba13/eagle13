// Phase 21.9 · Stage 2 — Deterministic exports for history / presets /
// comparison / optimizer bundle. All exports carry mandatory disclaimers
// and never claim production applicability.

import type {
  OptimizerHistory,
  OptimizerHistoryComparison,
  OptimizerHistoryEntry,
} from "./optimizer-history";
import type { OptimizerPresetLibrary } from "./optimizer-presets";
import type { ComparisonReport } from "./optimizer-comparison";
import type { ParameterDriftReport } from "./optimizer-drift";
import type { OptimizerResult } from "./explainable-optimizer";

const DISCLAIMER =
  "RESEARCH OPTIMIZATION ONLY — NO PRODUCTION PARAMETER CHANGES";

function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildOptimizerHistoryCsv(history: OptimizerHistory): string {
  const head = [
    "id",
    "runId",
    "strategy",
    "instrument",
    "provider",
    "from",
    "to",
    "recordedAt",
    "objectiveScore",
    "overfitRisk",
    "confidence",
    "recommendedParameters",
  ].join(",");
  const rows = history.entries.map((e) =>
    [
      csvEscape(e.id),
      csvEscape(e.runId),
      csvEscape(e.strategy),
      csvEscape(e.instrument),
      csvEscape(e.provider),
      csvEscape(e.from),
      csvEscape(e.to),
      csvEscape(e.recordedAt),
      e.result.objectiveScore.toFixed(4),
      csvEscape(e.result.overfitRisk),
      csvEscape(e.result.confidence),
      csvEscape(JSON.stringify(e.result.recommendedParameters ?? {})),
    ].join(","),
  );
  return [`# disclaimer=${DISCLAIMER}`, head, ...rows].join("\n");
}

export function buildOptimizerComparisonCsv(input: {
  readonly a: OptimizerHistoryEntry;
  readonly b: OptimizerHistoryEntry;
  readonly comparison: OptimizerHistoryComparison;
}): string {
  const head = ["field", "runA", "runB"].join(",");
  const rows: string[] = [
    ["runId", input.a.runId, input.b.runId],
    ["strategy", input.a.strategy, input.b.strategy],
    ["objectiveScore", input.a.result.objectiveScore.toFixed(4), input.b.result.objectiveScore.toFixed(4)],
    ["overfitRisk", input.a.result.overfitRisk, input.b.result.overfitRisk],
    ["confidence", input.a.result.confidence, input.b.result.confidence],
    ["parameters", JSON.stringify(input.a.result.recommendedParameters ?? {}), JSON.stringify(input.b.result.recommendedParameters ?? {})],
  ].map((r) => r.map(csvEscape).join(","));
  return [
    `# disclaimer=${DISCLAIMER}`,
    `# scoreDelta=${input.comparison.scoreDelta.toFixed(4)}`,
    `# summary=${csvEscape(input.comparison.summary)}`,
    head,
    ...rows,
  ].join("\n");
}

export function buildOptimizerBeforeAfterCsv(report: ComparisonReport): string {
  const head = ["metric", "current", "recommended", "delta", "pct", "favorsRecommended"].join(",");
  const rows = report.deltas.map((d) =>
    [
      d.key,
      d.current.toFixed(4),
      d.recommended.toFixed(4),
      d.delta.toFixed(4),
      d.pct == null ? "" : (d.pct * 100).toFixed(2),
      d.favorsRecommended ? "true" : "false",
    ].join(","),
  );
  return [`# disclaimer=${DISCLAIMER}`, head, ...rows].join("\n");
}

export function buildOptimizerBundleJson(input: {
  readonly result: OptimizerResult;
  readonly history: OptimizerHistory;
  readonly presets: OptimizerPresetLibrary;
  readonly comparison: ComparisonReport | null;
  readonly drift: ParameterDriftReport | null;
  readonly generatedAt: string;
}): string {
  return JSON.stringify(
    {
      disclaimer: DISCLAIMER,
      generatedAt: input.generatedAt,
      result: input.result,
      history: input.history,
      presets: input.presets,
      comparison: input.comparison,
      drift: input.drift,
    },
    null,
    2,
  );
}

export function buildPresetLibraryJson(lib: OptimizerPresetLibrary): string {
  return JSON.stringify({ disclaimer: DISCLAIMER, ...lib }, null, 2);
}