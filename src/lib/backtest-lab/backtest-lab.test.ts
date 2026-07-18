import { describe, it, expect, beforeEach } from "vitest";
import { computeMetrics, buildEquityCurve } from "./performance";
import { runMonteCarlo } from "./monte-carlo";
import { runPortfolio } from "./portfolio";
import { buildBacktestRunReport, exportRunCsv, exportRunJson, compareRuns } from "./report";
import { buildDiagnostics, classifyBacktestLabReadiness } from "./diagnostics";
import { _resetForTests, listRuns, listStrategies, saveRun, saveStrategy } from "./persistence";
import type { HistoricalCandle, SimulatedTrade, StrategyDefinition } from "./types";
import { BACKTEST_LAB_SCHEMA_VERSION } from "./types";

function trade(over: Partial<SimulatedTrade> = {}): SimulatedTrade {
  return {
    tradeId: "T1", strategyId: "S", symbol: "NIFTY", direction: "LONG",
    entryTs: "2024-01-01T09:15:00Z", exitTs: "2024-01-01T15:00:00Z",
    entryPrice: 100, exitPrice: 105, quantity: 1,
    stop: 95, target: 110,
    grossPnl: 5, netPnl: 5, returnPct: 5,
    fees: 0, slippage: 0, mfe: 5, mae: 0, holdingBars: 1,
    entryReason: "SIG", exitReason: "TARGET", ambiguous: false, warnings: [],
    ...over,
  };
}

function strategy(): StrategyDefinition {
  return {
    schemaVersion: BACKTEST_LAB_SCHEMA_VERSION,
    strategyId: "S1", name: "s", description: "",
    universe: ["NIFTY"], assetClass: "EQUITY_INDEX",
    timeframe: "1d", datasetId: "d", datasetHash: "h",
    from: "2024-01-01", to: "2024-06-30",
    conditions: { kind: "GROUP", operator: "AND", children: [] },
    direction: "LONG",
    entry: { type: "NEXT_BAR_OPEN" },
    exit: {
      stopType: "NONE", targetType: "NONE",
      sameBarPolicy: "CONSERVATIVE_STOP_FIRST",
    },
    sizing: { method: "FIXED_QTY", fixedQty: 1 },
    capital: 100_000,
    risk: {},
    costs: { kind: "ZERO", version: "v1" },
    slippage: { kind: "ZERO", version: "v1" },
    formulaVersions: {},
    researchOnly: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

describe("performance metrics", () => {
  const trades: SimulatedTrade[] = [
    trade({ tradeId: "T1", netPnl: 100, grossPnl: 100, returnPct: 1 }),
    trade({ tradeId: "T2", netPnl: -50, grossPnl: -50, returnPct: -0.5 }),
    trade({ tradeId: "T3", netPnl: 200, grossPnl: 200, returnPct: 2 }),
  ];
  const m = computeMetrics(trades, 100_000);
  it("computes core metrics", () => {
    expect(m.trades).toBe(3);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(1);
    expect(m.netProfit).toBe(250);
    expect(m.profitFactor).toBeCloseTo(6);
  });
  it("flags small sample", () => {
    expect(m.sampleWarning).toBe("INSUFFICIENT_SAMPLE");
  });
  it("builds monotone equity curve", () => {
    const eq = buildEquityCurve(trades, 100_000);
    expect(eq).toHaveLength(3);
    expect(eq[eq.length - 1].equity).toBe(100_250);
  });
});

describe("monte carlo — deterministic with seed", () => {
  const trades: SimulatedTrade[] = Array.from({ length: 30 }, (_, i) =>
    trade({ tradeId: `T${i}`, netPnl: i % 2 === 0 ? 100 : -50, grossPnl: i % 2 === 0 ? 100 : -50 }),
  );
  it("gives identical results for identical seeds", () => {
    const a = runMonteCarlo(trades, 100_000, { iterations: 200, seed: 42 });
    const b = runMonteCarlo(trades, 100_000, { iterations: 200, seed: 42 });
    expect(a).toEqual(b);
  });
  it("differs with different seeds", () => {
    const a = runMonteCarlo(trades, 100_000, { iterations: 200, seed: 1 });
    const b = runMonteCarlo(trades, 100_000, { iterations: 200, seed: 99 });
    expect(a.finalEquityP05).not.toBe(b.finalEquityP05);
  });
  it("reports probExceedsDrawdown when threshold provided", () => {
    const a = runMonteCarlo(trades, 100_000, { iterations: 200, seed: 1, drawdownThreshold: 100 });
    expect(a.probExceedsDrawdown).not.toBeNull();
  });
});

describe("report builder + exports", () => {
  beforeEach(() => _resetForTests());
  const candles: HistoricalCandle[] = Array.from({ length: 5 }, (_, i) => ({
    ts: `2024-01-0${i + 1}T09:15:00Z`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i,
    valid: true,
  }));

  it("produces a schema-versioned report with disclaimer", () => {
    const report = buildBacktestRunReport({
      runId: "R1", strategy: strategy(), candles, generatedAt: "2024-01-05T00:00:00Z",
    });
    expect(report.schemaVersion).toBe(BACKTEST_LAB_SCHEMA_VERSION);
    expect(report.disclaimer).toMatch(/RESEARCH ONLY/i);
    expect(report.manifest.researchOnly).toBe(true);
  });

  it("CSV export contains headers", () => {
    const report = buildBacktestRunReport({
      runId: "R1", strategy: strategy(), candles, generatedAt: "2024-01-05T00:00:00Z",
    });
    const csv = exportRunCsv(report);
    expect(csv.split("\n")[0]).toContain("tradeId");
  });

  it("JSON export is parseable", () => {
    const report = buildBacktestRunReport({
      runId: "R1", strategy: strategy(), candles, generatedAt: "2024-01-05T00:00:00Z",
    });
    expect(() => JSON.parse(exportRunJson(report))).not.toThrow();
  });

  it("compareRuns returns paired arrays", () => {
    const a = buildBacktestRunReport({ runId: "R1", strategy: strategy(), candles, generatedAt: "t" });
    const b = buildBacktestRunReport({ runId: "R2", strategy: strategy(), candles, generatedAt: "t" });
    const cmp = compareRuns(a, b);
    expect(cmp.runs).toEqual(["R1", "R2"]);
    expect(cmp.datasetHashSame).toBe(true);
  });
});

describe("portfolio aggregator", () => {
  it("equal-weights runs deterministically", () => {
    const r1 = buildBacktestRunReport({
      runId: "R1", strategy: strategy(), candles: [], generatedAt: "t",
    });
    const r2 = buildBacktestRunReport({
      runId: "R2", strategy: { ...strategy(), strategyId: "S2" }, candles: [], generatedAt: "t",
    });
    const p = runPortfolio({
      weighting: "EQUAL", runs: [r1, r2], startingCapital: 100_000,
    });
    expect(p.weights.R1).toBeCloseTo(0.5);
    expect(p.weights.R2).toBeCloseTo(0.5);
    expect(p.correlation).toHaveLength(2);
  });
});

describe("persistence + diagnostics", () => {
  beforeEach(() => _resetForTests());
  it("stores strategies and runs; diagnostics summarise them", () => {
    saveStrategy(strategy());
    const report = buildBacktestRunReport({
      runId: "R1", strategy: strategy(), candles: [], generatedAt: "2024-06-01T00:00:00Z",
    });
    saveRun(report, 12);
    const d = buildDiagnostics({
      nowIso: "2024-06-02T00:00:00Z",
      strategies: listStrategies(),
      runs: listRuns(),
      persistenceAvailable: true,
      failedRuns: 0,
      lastFailureAt: null,
      averageDurationMs: 12,
    });
    expect(d.strategyCount).toBe(1);
    expect(d.runCount).toBe(1);
  });
  it("classifyBacktestLabReadiness reports blockers on leakage", () => {
    const r = classifyBacktestLabReadiness({
      persistenceAvailable: true,
      datasetsInUse: 1,
      leakageDetections: 2,
    });
    expect(r.blockers).toContain("LEAKAGE_DETECTED");
    expect(r.leakageDetected).toBe(true);
  });
});