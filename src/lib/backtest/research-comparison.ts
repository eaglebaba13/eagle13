// Phase 21.5 · Stage 1 — Cross-strategy comparison matrix + summary.
// Pure. Consumes walk-forward results only; does not merge trades.

import type { StrategyId } from "./strategy";
import type { StabilityReport, ResearchStatus } from "./research-stability";
import type { DegradationReport, WindowMetrics, WalkForwardResult } from "./walk-forward";
import { aggregateStability } from "./research-stability";

export type StrategyResearchRow = {
  strategy: StrategyId;
  formula: string;
  training: WindowMetrics;
  validation: WindowMetrics;
  degradation: DegradationReport;
  stability: StabilityReport;
  status: ResearchStatus;
};

export type ResearchComparison = {
  rows: readonly StrategyResearchRow[];
};

function averageMetrics(source: readonly WindowMetrics[]): WindowMetrics {
  const n = source.length;
  const empty: WindowMetrics = {
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    profitFactor: 0,
    netPnl: 0,
    expectancy: 0,
    drawdown: 0,
    drawdownPct: 0,
    avgTrade: 0,
    returnPct: 0,
    recovery: 0,
    longCount: 0,
    shortCount: 0,
  };
  if (n === 0) return empty;
  const sum = source.reduce((acc, m) => {
    (Object.keys(m) as (keyof WindowMetrics)[]).forEach((k) => {
      const v = m[k];
      if (Number.isFinite(v as number)) {
        (acc[k] as number) += v as number;
      }
    });
    return acc;
  }, { ...empty });
  return Object.fromEntries(
    (Object.keys(sum) as (keyof WindowMetrics)[]).map((k) => [
      k,
      Math.round(((sum[k] as number) / n) * 100) / 100,
    ]),
  ) as WindowMetrics;
}

function averageDegradation(source: readonly DegradationReport[]): DegradationReport {
  const empty: DegradationReport = {
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    netPnl: 0,
    drawdown: 0,
    recovery: 0,
    avgTrade: 0,
    tradeCount: 0,
  };
  const n = source.length;
  if (n === 0) return empty;
  const sum = source.reduce((acc, m) => {
    (Object.keys(m) as (keyof DegradationReport)[]).forEach((k) => {
      const v = m[k];
      if (Number.isFinite(v as number)) {
        acc[k] += v as number;
      }
    });
    return acc;
  }, { ...empty });
  return Object.fromEntries(
    (Object.keys(sum) as (keyof DegradationReport)[]).map((k) => [
      k,
      Math.round((sum[k] / n) * 100) / 100,
    ]),
  ) as DegradationReport;
}

export function buildStrategyRow(
  strategy: StrategyId,
  formula: string,
  walk: WalkForwardResult,
): StrategyResearchRow {
  const training = averageMetrics(walk.windows.map((w) => w.trainingMetrics));
  const validation = averageMetrics(walk.windows.map((w) => w.validationMetrics));
  const degradation = averageDegradation(walk.windows.map((w) => w.degradation));
  const stability = aggregateStability(walk);
  return {
    strategy,
    formula,
    training,
    validation,
    degradation,
    stability,
    status: stability.status,
  };
}

export function buildResearchComparison(
  rows: readonly StrategyResearchRow[],
): ResearchComparison {
  return { rows };
}

// ---------------------------------------------------------------------------
// Automatic research summary.

export type ResearchSummary = {
  bestExpectancy: StrategyId | null;
  worstDrawdown: StrategyId | null;
  mostStable: StrategyId | null;
  leastStable: StrategyId | null;
  largestDegradation: StrategyId | null;
  highestConsistency: StrategyId | null;
  strengths: readonly string[];
  weaknesses: readonly string[];
};

export function generateResearchSummary(
  comparison: ResearchComparison,
): ResearchSummary {
  const rows = comparison.rows;
  if (rows.length === 0) {
    return {
      bestExpectancy: null,
      worstDrawdown: null,
      mostStable: null,
      leastStable: null,
      largestDegradation: null,
      highestConsistency: null,
      strengths: [],
      weaknesses: [],
    };
  }
  const byExpectancy = [...rows].sort(
    (a, b) => b.validation.expectancy - a.validation.expectancy,
  );
  const byDrawdown = [...rows].sort(
    (a, b) => b.validation.drawdown - a.validation.drawdown,
  );
  const byStability = [...rows].sort((a, b) => b.stability.score - a.stability.score);
  const byDegradation = [...rows].sort(
    (a, b) => Math.abs(b.degradation.netPnl) - Math.abs(a.degradation.netPnl),
  );
  const consistency = rows.find(
    (r) => r.stability.status === "EXCELLENT" || r.stability.status === "GOOD",
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const r of rows) {
    if (r.stability.status === "EXCELLENT" || r.stability.status === "GOOD") {
      strengths.push(`${r.strategy}: ${r.stability.status} stability (score ${r.stability.score}).`);
    }
    if (r.stability.status === "UNSTABLE" || r.stability.status === "WEAK") {
      weaknesses.push(`${r.strategy}: ${r.stability.status} — score ${r.stability.score}, degradation ${r.degradation.netPnl}%.`);
    }
    if (r.status === "INSUFFICIENT_DATA") {
      weaknesses.push(`${r.strategy}: insufficient validation trades (${r.validation.tradeCount}).`);
    }
  }

  return {
    bestExpectancy: byExpectancy[0]?.strategy ?? null,
    worstDrawdown: byDrawdown[0]?.strategy ?? null,
    mostStable: byStability[0]?.strategy ?? null,
    leastStable: byStability[byStability.length - 1]?.strategy ?? null,
    largestDegradation: byDegradation[0]?.strategy ?? null,
    highestConsistency: consistency?.strategy ?? byStability[0]?.strategy ?? null,
    strengths,
    weaknesses,
  };
}