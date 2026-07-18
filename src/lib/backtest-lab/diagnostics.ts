// Phase 3G — Admin diagnostics for the Backtest Lab.
// No provider secrets, no raw payloads, no PII.

import type { BacktestRunReport, StrategyDefinition } from "./types";

export interface BacktestLabDiagnostics {
  readonly generatedAt: string;
  readonly persistenceAvailable: boolean;
  readonly strategyCount: number;
  readonly runCount: number;
  readonly failedRuns: number;
  readonly lastFailureAt: string | null;
  readonly averageDurationMs: number | null;
  readonly lastSuccessfulRunAt: string | null;
  readonly datasetsInUse: readonly string[];
  readonly timeframes: readonly string[];
  readonly leakageDetections: number;
  readonly invalidBars: number;
  readonly monteCarloRuns: number;
  readonly walkForwardRuns: number;
  readonly warnings: readonly string[];
}

export function buildDiagnostics(input: {
  readonly nowIso: string;
  readonly strategies: readonly StrategyDefinition[];
  readonly runs: readonly BacktestRunReport[];
  readonly persistenceAvailable: boolean;
  readonly failedRuns: number;
  readonly lastFailureAt: string | null;
  readonly averageDurationMs: number | null;
}): BacktestLabDiagnostics {
  const datasets = new Set<string>();
  const timeframes = new Set<string>();
  let leakage = 0;
  let invalidBars = 0;
  let monteCarlo = 0;
  let walkForward = 0;
  let lastOk: string | null = null;
  for (const r of input.runs) {
    datasets.add(r.manifest.datasetId);
    timeframes.add(r.manifest.timeframe);
    if (r.walkForward?.leakageDetected) leakage++;
    invalidBars += r.dataQuality.invalidBars;
    if (r.monteCarlo) monteCarlo++;
    if (r.walkForward) walkForward++;
    lastOk = r.generatedAt;
  }
  return {
    generatedAt: input.nowIso,
    persistenceAvailable: input.persistenceAvailable,
    strategyCount: input.strategies.length,
    runCount: input.runs.length,
    failedRuns: input.failedRuns,
    lastFailureAt: input.lastFailureAt,
    averageDurationMs: input.averageDurationMs,
    lastSuccessfulRunAt: lastOk,
    datasetsInUse: [...datasets],
    timeframes: [...timeframes],
    leakageDetections: leakage,
    invalidBars,
    monteCarloRuns: monteCarlo,
    walkForwardRuns: walkForward,
    warnings: input.persistenceAvailable ? [] : ["PERSISTENCE_UNAVAILABLE"],
  };
}

export function classifyBacktestLabReadiness(input: {
  readonly persistenceAvailable: boolean;
  readonly datasetsInUse: number;
  readonly leakageDetections: number;
}): { available: boolean; demo: boolean; reason: string; warnings: string[]; blockers: string[]; leakageDetected: boolean } {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!input.persistenceAvailable) warnings.push("Persistence in memory-only mode");
  if (input.leakageDetections > 0) blockers.push("LEAKAGE_DETECTED");
  const available = input.persistenceAvailable;
  return {
    available,
    demo: input.datasetsInUse === 0,
    reason: input.datasetsInUse === 0
      ? "Backtest Lab idle — no datasets loaded"
      : "Backtest Lab consuming canonical historical datasets",
    warnings,
    blockers,
    leakageDetected: input.leakageDetections > 0,
  };
}