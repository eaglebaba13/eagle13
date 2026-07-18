// Phase 3E — Redacted admin diagnostics for the research lab.

import type {
  DataQualityReport,
  HistoricalDataset,
  ResearchRunReport,
} from "./types";

export interface ResearchLabDiagnostics {
  readonly datasetAvailable: boolean;
  readonly datasetHash: string;
  readonly symbol: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly sampleCount: number;
  readonly missingSessions: number;
  readonly duplicates: number;
  readonly invalidOhlc: number;
  readonly leakageDetections: number;
  readonly formulaVersionMismatches: number;
  readonly signalFamilyCoverage: Readonly<Record<string, number>>;
  readonly runCount: number;
  readonly failedRuns: number;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly averageDurationMs: number | null;
  readonly persistenceAvailable: boolean;
  readonly overallQuality: DataQualityReport["overall"];
  readonly warnings: readonly string[];
}

export function buildDiagnostics(input: {
  readonly dataset: HistoricalDataset | null;
  readonly quality: DataQualityReport | null;
  readonly reports: readonly ResearchRunReport[];
  readonly persistenceAvailable: boolean;
  readonly failedRuns: number;
  readonly lastFailureAt: string | null;
  readonly averageDurationMs: number | null;
  readonly signalCoverage: Readonly<Record<string, number>>;
}): ResearchLabDiagnostics {
  const dataset = input.dataset;
  const quality = input.quality;
  const lastSuccess = input.reports.length > 0 ? input.reports[input.reports.length - 1].generatedAt : null;
  return {
    datasetAvailable: !!dataset && dataset.rows.length > 0,
    datasetHash: dataset?.hash ?? "",
    symbol: dataset?.symbol ?? "",
    startDate: dataset?.startDate ?? "",
    endDate: dataset?.endDate ?? "",
    sampleCount: dataset?.rows.length ?? 0,
    missingSessions: quality?.missingSessions ?? 0,
    duplicates: quality?.duplicates ?? 0,
    invalidOhlc: quality?.invalidOhlc ?? 0,
    leakageDetections: quality?.leakageDetections ?? 0,
    formulaVersionMismatches: quality?.formulaVersionMismatches ?? 0,
    signalFamilyCoverage: input.signalCoverage,
    runCount: input.reports.length,
    failedRuns: input.failedRuns,
    lastSuccessAt: lastSuccess,
    lastFailureAt: input.lastFailureAt,
    averageDurationMs: input.averageDurationMs,
    persistenceAvailable: input.persistenceAvailable,
    overallQuality: quality?.overall ?? "OK",
    warnings: quality?.warnings ?? [],
  };
}
