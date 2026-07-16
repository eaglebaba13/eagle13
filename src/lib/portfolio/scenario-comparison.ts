// Phase 22 · Stage 3 — Scenario comparison. Aggregates any number of
// PortfolioResearchResult scenarios into a normalised comparison table.
// Research-only. Never re-runs strategies.

import type { PortfolioResearchResult } from "./portfolio-types";
import type { PortfolioMcResult } from "./portfolio-monte-carlo";

export type ScenarioMetricRow = {
  readonly scenarioId: string;
  readonly label: string;
  readonly runId: string;
  readonly totalReturnPct: number;
  readonly annualizedVol: number;
  readonly sharpe: number;
  readonly sortino: number;
  readonly calmar: number;
  readonly maxDrawdownPct: number;
  readonly cvar95: number;
  readonly diversificationRatio: number;
  readonly concentrationHhi: number;
  readonly ruinProbability: number | null;
  readonly reliability: string;
};

export type ScenarioComparisonInput = {
  readonly scenarios: readonly {
    readonly id: string;
    readonly label: string;
    readonly result: PortfolioResearchResult;
    readonly monteCarlo?: PortfolioMcResult | null;
    readonly reliability?: string;
  }[];
};

export type ScenarioComparisonResult = {
  readonly rows: readonly ScenarioMetricRow[];
  readonly warnings: readonly string[];
  readonly disclaimer: string;
};

export function compareScenarios(input: ScenarioComparisonInput): ScenarioComparisonResult {
  const warnings: string[] = [];
  const hashes = new Set<string>();
  const dateRanges = new Set<string>();
  for (const s of input.scenarios) {
    hashes.add(s.result.candidateRunIds.slice().sort().join("|"));
    dateRanges.add(
      `${s.result.equityCurve[0]?.date ?? ""}→${s.result.equityCurve[s.result.equityCurve.length - 1]?.date ?? ""}`,
    );
  }
  if (hashes.size > 1) warnings.push("DIFFERENT_CANDIDATE_SETS");
  if (dateRanges.size > 1) warnings.push("DIFFERENT_DATE_RANGES");

  const rows: ScenarioMetricRow[] = input.scenarios.map((s) => ({
    scenarioId: s.id,
    label: s.label,
    runId: s.result.runId,
    totalReturnPct: s.result.metrics.totalReturnPct,
    annualizedVol: s.result.metrics.annualizedVol,
    sharpe: s.result.metrics.sharpe,
    sortino: s.result.metrics.sortino,
    calmar: s.result.metrics.calmar,
    maxDrawdownPct: s.result.metrics.maxDrawdownPct,
    cvar95: s.result.metrics.cvar95,
    diversificationRatio: s.result.metrics.diversificationRatio,
    concentrationHhi: s.result.metrics.strategyConcentration,
    ruinProbability: s.monteCarlo ? s.monteCarlo.probabilityOfRuin : null,
    reliability: s.reliability ?? "—",
  }));

  return {
    rows,
    warnings,
    disclaimer:
      "PORTFOLIO RESEARCH ONLY — scenario comparison is descriptive; it does not authorise any live allocation change.",
  };
}