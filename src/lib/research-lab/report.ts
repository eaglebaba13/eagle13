// Phase 3E — Aggregate research-run report builder (pure).

import { assessDataQuality } from "./data-quality";
import { runGannGapStudy } from "./gap-study";
import { runSmartAlertStudy } from "./alert-study";
import { runInstitutionalFlowStudy } from "./institutional-flow-study";
import { eventsByFamily } from "./signal-events";
import { checkSignalLeakage } from "./alignment";
import { computeOutcome } from "./outcomes";
import { computeMetrics, type Pair } from "./metrics";
import { walkForward } from "./walk-forward";
import type {
  HistoricalDataset,
  OutcomeThresholds,
  ResearchRunManifest,
  ResearchRunReport,
  SignalFamily,
  StudyMetrics,
  WalkForwardConfig,
} from "./types";
import {
  DEFAULT_OUTCOME_THRESHOLDS,
  OUTCOME_DEFINITION_VERSION,
  RESEARCH_LAB_DISCLAIMER,
} from "./types";

export interface BuildReportInput {
  readonly runId: string;
  readonly dataset: HistoricalDataset;
  readonly nowIso: string;
  readonly thresholds?: OutcomeThresholds;
  readonly includedFamilies?: readonly SignalFamily[];
  readonly walkForward?: WalkForwardConfig | null;
  readonly buildVersion?: string | null;
}

interface HistoricalRowIndex {
  readonly row: HistoricalDataset["rows"][number];
  readonly index: number;
}

function metricsForFamily(
  family: SignalFamily,
  dataset: HistoricalDataset,
  thresholds: OutcomeThresholds,
): StudyMetrics {
  const grouped = eventsByFamily(dataset.rows)[family] ?? [];
  const rows = dataset.rows;
  const bySession = new Map<string, HistoricalRowIndex>();
  for (let i = 0; i < rows.length; i++) bySession.set(rows[i].sessionDate, { row: rows[i], index: i });
  const pairs: Pair[] = [];
  for (const ev of grouped) {
    const hit = bySession.get(ev.sessionDate);
    if (!hit) continue;
    const leakage = checkSignalLeakage(ev, hit.row);
    if (!leakage.ok) continue;
    const outcome = computeOutcome(hit.index, rows, thresholds);
    pairs.push({
      predicted: ev.predictedDirection ?? null,
      actual: outcome.gapDirection,
      gapPoints: outcome.nextGapPoints,
      mfe: outcome.mfe,
      mae: outcome.mae,
    });
  }
  return computeMetrics(pairs, thresholds);
}

export function buildResearchRunReport(input: BuildReportInput): ResearchRunReport {
  const thresholds = input.thresholds ?? DEFAULT_OUTCOME_THRESHOLDS;
  const ds = input.dataset;
  const allFamilies: SignalFamily[] = [
    "DECISION", "GTI", "COMBINED_PCR", "BREADTH",
    "GANN_GAP", "SMART_ALERT", "INSTITUTIONAL_FLOW", "OPTION_STRATEGY",
  ];
  const included = input.includedFamilies ?? allFamilies;
  const signals: Partial<Record<SignalFamily, StudyMetrics>> = {};
  for (const f of included) signals[f] = metricsForFamily(f, ds, thresholds);
  const eventsAll = eventsByFamily(ds.rows);
  const quality = assessDataQuality({
    rows: ds.rows,
    signals: allFamilies.flatMap((f) => eventsAll[f] ?? []),
    nowIso: input.nowIso,
  });
  const manifest: ResearchRunManifest = {
    runId: input.runId,
    createdAt: input.nowIso,
    datasetId: ds.datasetId,
    datasetHash: ds.hash,
    symbol: ds.symbol,
    startDate: ds.startDate,
    endDate: ds.endDate,
    timezone: ds.timezone,
    formulaVersions: ds.rows[0]?.formulaVersions ?? {},
    outcomeDefinitionVersion: OUTCOME_DEFINITION_VERSION,
    flatGapTolerancePct: thresholds.flatGapTolerancePct,
    minSampleSize: thresholds.minSampleSize,
    includedFamilies: included,
    exclusionRules: ["LEAKAGE", "INVALID_OHLC", "NEGATIVE_PRICES"],
    walkForward: input.walkForward ?? null,
    buildVersion: input.buildVersion ?? null,
  };
  return {
    manifest,
    dataQuality: quality,
    signals,
    gannGap: runGannGapStudy(ds.rows, thresholds),
    smartAlerts: runSmartAlertStudy(ds.rows, thresholds),
    institutionalFlow: runInstitutionalFlowStudy(ds.rows, thresholds),
    walkForward: input.walkForward ? walkForward(ds.rows, input.walkForward) : null,
    diagnostics: [],
    warnings: [...ds.warnings, ...quality.warnings],
    disclaimer: RESEARCH_LAB_DISCLAIMER,
    generatedAt: input.nowIso,
  };
}

export function exportJson(report: ResearchRunReport): string {
  return JSON.stringify(report, null, 2);
}

export function exportCsv(report: ResearchRunReport): string {
  const lines: string[] = [];
  lines.push("study,key,samples,eligible,accuracy,balancedAccuracy,precisionGapUp,precisionGapDown,avgGapPoints");
  const m = (label: string, key: string, x: StudyMetrics) => {
    lines.push([
      label, key, x.samples, x.eligible,
      x.accuracy?.toFixed(4) ?? "",
      x.balancedAccuracy?.toFixed(4) ?? "",
      x.precisionGapUp?.toFixed(4) ?? "",
      x.precisionGapDown?.toFixed(4) ?? "",
      x.avgGapPoints?.toFixed(4) ?? "",
    ].join(","));
  };
  for (const [k, v] of Object.entries(report.signals)) if (v) m("signal", k, v);
  if (report.gannGap) {
    m("gannGap", "overall", report.gannGap.metrics);
    for (const b of report.gannGap.byVixRegime) m("gannGap.vix", b.key, b.metrics);
    for (const b of report.gannGap.byMonth) m("gannGap.month", b.key, b.metrics);
  }
  return lines.join("\n");
}

export interface RunComparison {
  readonly a: ResearchRunReport;
  readonly b: ResearchRunReport;
  readonly sameDataset: boolean;
  readonly sameFormulas: boolean;
  readonly deltas: Readonly<Record<string, number | null>>;
}

function delta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

export function compareRuns(a: ResearchRunReport, b: ResearchRunReport): RunComparison {
  const deltas: Record<string, number | null> = {
    accuracy: delta(a.gannGap?.metrics.accuracy, b.gannGap?.metrics.accuracy),
    balancedAccuracy: delta(a.gannGap?.metrics.balancedAccuracy, b.gannGap?.metrics.balancedAccuracy),
    precisionGapUp: delta(a.gannGap?.metrics.precisionGapUp, b.gannGap?.metrics.precisionGapUp),
    precisionGapDown: delta(a.gannGap?.metrics.precisionGapDown, b.gannGap?.metrics.precisionGapDown),
    recallGapUp: delta(a.gannGap?.metrics.recallGapUp, b.gannGap?.metrics.recallGapUp),
    recallGapDown: delta(a.gannGap?.metrics.recallGapDown, b.gannGap?.metrics.recallGapDown),
    mfeAvg: delta(a.gannGap?.metrics.mfeAvg, b.gannGap?.metrics.mfeAvg),
    maeAvg: delta(a.gannGap?.metrics.maeAvg, b.gannGap?.metrics.maeAvg),
    sampleSize: delta(a.gannGap?.metrics.samples, b.gannGap?.metrics.samples),
  };
  return {
    a, b,
    sameDataset: a.manifest.datasetHash === b.manifest.datasetHash,
    sameFormulas:
      JSON.stringify(a.manifest.formulaVersions) === JSON.stringify(b.manifest.formulaVersions),
    deltas,
  };
}
