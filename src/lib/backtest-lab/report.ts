// Phase 3G — Report builder + safe exports.

import type { BacktestRunReport, HistoricalCandle, MonteCarloSummary, SimulatedTrade, StrategyDefinition, WalkForwardSummary } from "./types";
import { BACKTEST_LAB_DISCLAIMER, BACKTEST_LAB_SCHEMA_VERSION } from "./types";
import { simulate } from "./trade-engine";
import { buildEquityCurve, computeMetrics } from "./performance";

export interface BuildReportInput {
  readonly runId: string;
  readonly strategy: StrategyDefinition;
  readonly candles: readonly HistoricalCandle[];
  readonly generatedAt: string;
  readonly monteCarlo?: MonteCarloSummary | null;
  readonly walkForward?: WalkForwardSummary | null;
}

export function buildBacktestRunReport(input: BuildReportInput): BacktestRunReport {
  const s = simulate(input.strategy, input.candles);
  const trades: readonly SimulatedTrade[] = s.trades;
  const equity = buildEquityCurve(trades, input.strategy.capital);
  const metrics = computeMetrics(trades, input.strategy.capital, input.strategy.from, input.strategy.to);
  const warnings = [...s.warnings];
  if (metrics.sampleWarning !== "OK") warnings.push(`SAMPLE:${metrics.sampleWarning}`);
  const blockingReasons: string[] = [];
  if (input.walkForward?.leakageDetected) blockingReasons.push("LEAKAGE_DETECTED");

  return {
    schemaVersion: BACKTEST_LAB_SCHEMA_VERSION,
    runId: input.runId,
    strategyId: input.strategy.strategyId,
    generatedAt: input.generatedAt,
    manifest: {
      datasetId: input.strategy.datasetId,
      datasetHash: input.strategy.datasetHash,
      symbol: input.strategy.universe[0] ?? "",
      timeframe: input.strategy.timeframe,
      from: input.strategy.from,
      to: input.strategy.to,
      capital: input.strategy.capital,
      costModelVersion: input.strategy.costs.version,
      slippageModelVersion: input.strategy.slippage.version,
      formulaVersions: input.strategy.formulaVersions,
      researchOnly: true,
    },
    trades,
    equityCurve: equity,
    metrics,
    dataQuality: {
      totalBars: input.candles.length,
      droppedBars: s.droppedBars,
      invalidBars: input.candles.filter((c) => c.valid === false).length,
      gaps: 0,
      warnings: [],
    },
    monteCarlo: input.monteCarlo ?? null,
    walkForward: input.walkForward ?? null,
    warnings,
    blockingReasons,
    disclaimer: BACKTEST_LAB_DISCLAIMER,
  };
}

// ── Safe exports (redact any surprise fields) ────────────────────────
const ALLOWLIST_TRADE_FIELDS: readonly (keyof SimulatedTrade)[] = [
  "tradeId", "strategyId", "symbol", "direction",
  "entryTs", "exitTs", "entryPrice", "exitPrice", "quantity",
  "stop", "target", "grossPnl", "netPnl", "returnPct",
  "fees", "slippage", "mfe", "mae", "holdingBars",
  "entryReason", "exitReason", "ambiguous",
];

export function exportRunJson(report: BacktestRunReport): string {
  const redactedTrades = report.trades.map((t) => {
    const o: Record<string, unknown> = {};
    for (const k of ALLOWLIST_TRADE_FIELDS) o[k as string] = t[k];
    return o;
  });
  return JSON.stringify({ ...report, trades: redactedTrades });
}

export function exportRunCsv(report: BacktestRunReport): string {
  const headers = ALLOWLIST_TRADE_FIELDS.join(",");
  const lines = report.trades.map((t) =>
    ALLOWLIST_TRADE_FIELDS.map((k) => {
      const v = t[k] as unknown;
      if (v == null) return "";
      if (typeof v === "string") return JSON.stringify(v);
      return String(v);
    }).join(","),
  );
  return [headers, ...lines].join("\n");
}

export function compareRuns(a: BacktestRunReport, b: BacktestRunReport) {
  return {
    runs: [a.runId, b.runId],
    datasetHashSame: a.manifest.datasetHash === b.manifest.datasetHash,
    tradeCount: [a.metrics.trades, b.metrics.trades],
    winRate: [a.metrics.winRate, b.metrics.winRate],
    netProfit: [a.metrics.netProfit, b.metrics.netProfit],
    maxDrawdown: [a.metrics.maxDrawdown, b.metrics.maxDrawdown],
    profitFactor: [a.metrics.profitFactor, b.metrics.profitFactor],
    sharpe: [a.metrics.sharpe, b.metrics.sharpe],
    cagr: [a.metrics.cagr, b.metrics.cagr],
  };
}