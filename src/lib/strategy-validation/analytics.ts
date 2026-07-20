// Phase 29 · Top-level analytics orchestrator.

import { replaySeries } from "./replay";
import {
  buildJournal,
  confidenceCalibration,
  computePerformance,
  decisionBreakdown,
  engineContribution,
  failureAnalysis,
  regimeBreakdown,
  strikeBreakdown,
  vixBreakdown,
} from "./metrics";
import { MIN_SAMPLE_SIZE, type AnalyticsReport, type HistoricalSnapshot } from "./types";

export function analyseHistory(
  snapshots: readonly HistoricalSnapshot[],
  holdingBars = 1,
): AnalyticsReport {
  const generatedAt = new Date(0).toISOString(); // deterministic; UI supplies real time via wrapper
  if (snapshots.length === 0) {
    return emptyReport(generatedAt);
  }
  const results = replaySeries(snapshots, holdingBars);
  return {
    generatedAt,
    sampleSize: snapshots.length,
    available: snapshots.length >= MIN_SAMPLE_SIZE,
    note:
      snapshots.length < MIN_SAMPLE_SIZE
        ? `LOW SAMPLE SIZE — need ≥${MIN_SAMPLE_SIZE} snapshots, got ${snapshots.length}`
        : "OK",
    overall: computePerformance(results),
    decisionBreakdown: decisionBreakdown(results),
    regimeBreakdown: regimeBreakdown(results),
    vixBreakdown: vixBreakdown(results),
    strikeBreakdown: strikeBreakdown(results),
    calibration: confidenceCalibration(results),
    contribution: engineContribution(results),
    failures: failureAnalysis(results),
    journal: buildJournal(results),
  };
}

function emptyReport(generatedAt: string): AnalyticsReport {
  return {
    generatedAt,
    sampleSize: 0,
    available: false,
    note: "UNAVAILABLE — no historical snapshots supplied",
    overall: {
      totalTrades: 0,
      winning: 0,
      losing: 0,
      skipped: 0,
      winRate: 0,
      avgWinner: 0,
      avgLoser: 0,
      profitFactor: null,
      expectancy: 0,
      maxDrawdown: 0,
      recoveryFactor: null,
      sharpe: null,
      sampleSize: 0,
      lowSample: true,
    },
    decisionBreakdown: [],
    regimeBreakdown: [],
    vixBreakdown: [],
    strikeBreakdown: [],
    calibration: [],
    contribution: [],
    failures: [],
    journal: [],
  };
}