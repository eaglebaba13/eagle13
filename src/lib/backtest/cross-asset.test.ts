import { describe, it, expect } from "vitest";
import {
  buildCrossAssetRow,
  buildInstrumentStrategyMatrix,
  buildInstrumentTimeframeMatrix,
  buildRegimeStrategyMatrix,
  buildRegimeTimeframeMatrix,
  buildLeaderboard,
  buildResearchSummary,
  buildHeatmap,
  buildCrossAssetCsv,
  buildCrossAssetJson,
  computeConsistencyScore,
  CROSS_ASSET_ENGINE_VERSION,
  MIN_SAMPLE_FOR_RANKING,
  type CrossAssetInput,
  type CrossAssetRow,
} from "./cross-asset";
import type { HistoricalBacktestResult, HistoricalTrade } from "./result";

function trade(pnl: number, i: number): HistoricalTrade {
  return {
    id: `t${i}`,
    date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
    side: pnl >= 0 ? "BUY" : "SELL",
    entry: 100, stop: 98, target: 102, exit: 100 + pnl,
    outcome: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT",
    pnl, mfe: null, mae: null, holdingTime: null,
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    source: "test", ambiguous: false, reasons: [], metadata: {},
  };
}

function result(pnls: number[], instrument = "NIFTY50"): HistoricalBacktestResult {
  const trades = pnls.map((p, i) => trade(p, i));
  const net = pnls.reduce((a, b) => a + b, 0);
  return {
    formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
    engineVersion: "eng", executionVersion: "exec", cubeVersion: "cube", policyVersion: "pol",
    runId: `run-${instrument}-${trades.length}-${net}`,
    generatedAt: "2024-01-01T00:00:00.000Z",
    instrument, from: "2024-01-01", to: "2024-01-31",
    dataGranularity: "1d", source: "test", dataQuality: null,
    trades, stats: {}, monthly: [], equityCurve: [],
    drawdown: { max: Math.max(0, ...pnls.map((_, i) => -pnls.slice(0, i + 1).reduce((a, b) => a + b, 0))), maxPct: 0 },
    benchmark: null, methodology: "", disclaimers: [], formulaMeta: {},
  };
}

function bulkInput(
  instrument: string,
  strategy: string,
  timeframe: string,
  regime: string,
  pnls: number[],
  extras: Partial<CrossAssetInput> = {},
): CrossAssetInput {
  return {
    instrument, strategy, timeframe, regime,
    formula: `${strategy}_V1`,
    result: result(pnls, instrument),
    ...extras,
  };
}

describe("Phase 21.7 · cross-asset engine", () => {
  it("exports engine version marker", () => {
    expect(CROSS_ASSET_ENGINE_VERSION).toBe("CROSS_ASSET_V1");
  });

  it("aggregates a HistoricalBacktestResult into a CrossAssetRow", () => {
    const pnls = [10, -5, 8, -3, 12, -4, 6, -2, 9, -1, ...Array(30).fill(1)];
    const row = buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", pnls));
    expect(row.trades).toBe(pnls.length);
    expect(row.wins).toBeGreaterThan(0);
    expect(row.losses).toBeGreaterThan(0);
    expect(row.winRate).toBeGreaterThan(0);
    expect(row.profitFactor).toBeGreaterThan(0);
    expect(row.sufficient).toBe(true);
  });

  it("marks small samples as insufficient for ranking", () => {
    const row = buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "RANGE", [1, -1, 1]));
    expect(row.sufficient).toBe(false);
    expect(row.trades).toBeLessThan(MIN_SAMPLE_FOR_RANKING);
  });

  it("builds instrument×strategy matrix with deterministic ordering", () => {
    const pnls = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 2 : -1));
    const rows: CrossAssetRow[] = [
      buildCrossAssetRow(bulkInput("BTC", "ASTRO", "1d", "TRENDING_UP", pnls)),
      buildCrossAssetRow(bulkInput("NIFTY50", "SMC", "1d", "RANGE", pnls)),
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", pnls)),
    ];
    const m = buildInstrumentStrategyMatrix(rows);
    expect(m.rowKeys).toEqual(["BTC", "NIFTY50"]);
    expect(m.colKeys).toEqual(["ASTRO", "SMC"]);
    expect(m.cells["NIFTY50"]["ASTRO"]).toBeTruthy();
    expect(m.cells["BTC"]["SMC"]).toBeNull();
  });

  it("builds all four matrix flavors without cross-contamination", () => {
    const pnls = Array.from({ length: 40 }, () => 1);
    const rows = [
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "5m", "TRENDING_UP", pnls)),
      buildCrossAssetRow(bulkInput("BTC", "SMC", "1d", "RANGE", pnls)),
    ];
    expect(buildInstrumentTimeframeMatrix(rows).colKeys).toEqual(["1d", "5m"]);
    expect(buildRegimeStrategyMatrix(rows).rowKeys).toEqual(["RANGE", "TRENDING_UP"]);
    expect(buildRegimeTimeframeMatrix(rows).colKeys).toEqual(["1d", "5m"]);
  });

  it("builds a leaderboard that skips insufficient rows for rank-based categories", () => {
    const big = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 3 : -1));
    const small = [1, -1];
    const rows = [
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", big, { stabilityScore: 80, robustnessScore: 75 })),
      buildCrossAssetRow(bulkInput("BTC", "SMC", "1d", "RANGE", small)),
    ];
    const board = buildLeaderboard(rows);
    const bestStrategy = board.find((b) => b.category === "BEST_STRATEGY")!;
    expect(bestStrategy.winner).toBe("ASTRO"); // SMC's row is insufficient
    const largestSample = board.find((b) => b.category === "LARGEST_SAMPLE")!;
    expect(largestSample.value).toBeGreaterThan(0);
  });

  it("consistency score uses transparent weights that sum to 1.00", () => {
    const pnls = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 2 : -1));
    const rows = [
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", pnls)),
      buildCrossAssetRow(bulkInput("BTC", "ASTRO", "1d", "RANGE", pnls)),
    ];
    const s = computeConsistencyScore({
      strategy: "ASTRO",
      rows,
      walkForwardOos: 65,
      monteCarloP5: 40,
      sensitivityStability: 70,
      robustness: 72,
    });
    const weightSum = Object.values(s.weights).reduce((a, b) => a + b, 0);
    expect(weightSum).toBeCloseTo(1.0, 6);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.formula).toContain("Σ weight_k × factor_k");
  });

  it("summary reports best/worst instrument, timeframe, regime with reasons", () => {
    const good = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 3 : -1));
    const bad = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : -2));
    const rows = [
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", good)),
      buildCrossAssetRow(bulkInput("BTC", "ASTRO", "5m", "RANGE", bad)),
    ];
    const s = buildResearchSummary(rows);
    expect(s.bestInstrument).toBe("NIFTY50");
    expect(s.weakInstrument).toBe("BTC");
    expect(s.reasons.bestInstrument).toContain("mean expectancy");
  });

  it("builds a heatmap with correct min/max for selected metric", () => {
    const pnls = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 2 : -1));
    const rows = [
      buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", pnls)),
      buildCrossAssetRow(bulkInput("BTC", "SMC", "1d", "RANGE", pnls)),
    ];
    const m = buildInstrumentStrategyMatrix(rows);
    const h = buildHeatmap(m, "profitFactor");
    expect(h.rowKeys).toEqual(m.rowKeys);
    expect(h.colKeys).toEqual(m.colKeys);
    expect(h.min).toBeLessThanOrEqual(h.max);
    // Empty cells are surfaced as null, not fabricated.
    const empty = h.cells.find((c) => c.row === "NIFTY50" && c.col === "SMC")!;
    expect(empty.value).toBeNull();
  });

  it("exports are deterministic and embed run id + engine version", () => {
    const pnls = Array.from({ length: 40 }, () => 1);
    const rows = [buildCrossAssetRow(bulkInput("NIFTY50", "ASTRO", "1d", "TRENDING_UP", pnls))];
    const prov = { researchRunId: "R1", generatedAt: "2024-01-01T00:00:00.000Z", engineVersion: CROSS_ASSET_ENGINE_VERSION };
    const csv1 = buildCrossAssetCsv(rows, prov);
    const csv2 = buildCrossAssetCsv(rows, prov);
    expect(csv1).toBe(csv2);
    expect(csv1).toContain("R1");
    expect(csv1).toContain(CROSS_ASSET_ENGINE_VERSION);
    const j = JSON.parse(buildCrossAssetJson(rows, prov, { leaderboard: buildLeaderboard(rows) }));
    expect(j.provenance.researchRunId).toBe("R1");
    expect(Array.isArray(j.leaderboard)).toBe(true);
  });
});