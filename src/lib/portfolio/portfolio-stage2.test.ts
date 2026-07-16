// Phase 22 · Stage 2 — Deterministic tests for candidate discovery, registry,
// rolling metrics, history, comparison, and bundle exports.

import { describe, it, expect } from "vitest";
import {
  CandidateRegistry,
  buildCandidateRows,
  candidateFromResult,
  globalCandidateRegistry,
} from "./candidate-discovery";
import { buildMonthlyHeatmap, buildRollingSeries } from "./rolling-metrics";
import { PortfolioHistory } from "./portfolio-history";
import { compareResults } from "./preset-comparison";
import {
  buildCandidatesCsv,
  buildComparisonCsv,
  buildHistoryCsv,
  buildResearchBundleJson,
} from "./bundle-exports";
import { runPortfolioResearch } from "./portfolio-engine";
import {
  defaultCostModel,
  defaultSizingPolicy,
  type PortfolioAsset,
  type PortfolioConfig,
} from "./portfolio-types";
import type {
  HistoricalBacktestResult,
  HistoricalTrade,
} from "@/lib/backtest/result";

function tr(date: string, pnl: number, id = "t"): HistoricalTrade {
  return {
    id: `${id}-${date}`,
    date,
    side: pnl >= 0 ? "BUY" : "SELL",
    entry: 100, stop: 99, target: 101, exit: 100,
    outcome: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT",
    pnl,
    mfe: null, mae: null, holdingTime: null,
    formulaVersion: "SMC_V1" as HistoricalTrade["formulaVersion"],
    source: "test", ambiguous: false, reasons: [], metadata: {},
  };
}

function makeResult(id: string, pnls: readonly [string, number][], formula = "SMC_V1"): HistoricalBacktestResult {
  const trades = pnls.map(([d, p]) => tr(d, p, id));
  let eq = 0, peak = 0, mx = 0;
  const curve = trades.map((t) => {
    eq += t.pnl; peak = Math.max(peak, eq); mx = Math.max(mx, peak - eq);
    return { date: t.date, equity: eq };
  });
  return {
    formulaVersion: formula as HistoricalBacktestResult["formulaVersion"],
    engineVersion: "e", executionVersion: "x", cubeVersion: "n/a", policyVersion: "p",
    runId: `RUN_${id}`,
    generatedAt: "2024-06-04T00:00:00Z",
    instrument: "NIFTY50",
    from: pnls[0][0], to: pnls[pnls.length - 1][0],
    dataGranularity: "5m",
    source: "test", dataQuality: null,
    trades, stats: {}, monthly: [], equityCurve: curve,
    drawdown: { max: mx, maxPct: 0 },
    benchmark: null, methodology: "", disclaimers: [],
    formulaMeta: {},
  };
}

function mkAsset(id: string, pnls: readonly [string, number][], extra: Partial<PortfolioAsset> = {}): PortfolioAsset {
  const r = makeResult(id, pnls);
  return { ...candidateFromResult(r), ...extra, id };
}

const A = mkAsset("A", [["2024-01-01", 10], ["2024-01-02", -5], ["2024-01-03", 8], ["2024-01-04", -3], ["2024-01-05", 6]]);
const B = mkAsset("B", [["2024-01-01", -2], ["2024-01-02", 4], ["2024-01-03", -1], ["2024-01-04", 3], ["2024-01-05", -1]]);

const cfg: PortfolioConfig = {
  method: "EQUAL_WEIGHT",
  startingCapital: 100000,
  sizingPolicy: defaultSizingPolicy(),
  rebalancePolicy: "NEVER",
  constraints: { minDiversificationCount: 1, minTradeCount: 0, maxLeverage: 1 },
  costs: defaultCostModel(),
};

describe("Phase 22 Stage 2 · candidate discovery", () => {
  it("candidateFromResult maps formula version → strategy", () => {
    const r = makeResult("X", [["2024-01-01", 1]], "ASTRO_SMC_HYBRID_V1");
    const a = candidateFromResult(r);
    expect(a.strategy).toBe("Hybrid");
    expect(a.runId).toBe("RUN_X");
  });
  it("does not mutate source trades", () => {
    const r = makeResult("Y", [["2024-01-01", 5], ["2024-01-02", 6]]);
    const before = JSON.stringify(r.trades);
    candidateFromResult(r);
    expect(JSON.stringify(r.trades)).toBe(before);
  });
  it("buildCandidateRows computes deterministic win-rate / PF / expectancy", () => {
    const [row] = buildCandidateRows([A]);
    expect(row.trades).toBe(5);
    expect(row.winRate).toBeCloseTo(3 / 5, 6);
    expect(row.profitFactor).toBeCloseTo(24 / 8, 6);
    expect(row.expectancy).toBeCloseTo(16 / 5, 6);
    expect(row.selectable).toBe(true);
  });
  it("blocks OVERFIT/UNRELIABLE candidates in row selectability", () => {
    const bad = { ...A, overfitStatus: "OVERFIT" as const };
    const [row] = buildCandidateRows([bad]);
    expect(row.selectable).toBe(false);
    expect(row.blockReason).toBe("OVERFIT");
  });
});

describe("Phase 22 Stage 2 · candidate registry", () => {
  it("register / unregister / filter is deterministic", () => {
    const reg = new CandidateRegistry();
    reg.register(A); reg.register(B);
    expect(reg.size()).toBe(2);
    expect(reg.list().map((x) => x.id)).toEqual(["A", "B"]);
    expect(reg.filter({ instrument: "NIFTY50" }).length).toBe(2);
    expect(reg.filter({ minTrades: 10 }).length).toBe(0);
    reg.unregister("A");
    expect(reg.size()).toBe(1);
  });
  it("globalCandidateRegistry is a singleton instance", () => {
    globalCandidateRegistry.clear();
    globalCandidateRegistry.register(A);
    expect(globalCandidateRegistry.get("A")).toBeDefined();
    globalCandidateRegistry.clear();
  });
});

describe("Phase 22 Stage 2 · rolling metrics", () => {
  const result = runPortfolioResearch({ candidates: [A, B], config: cfg });

  it("rolling series has equal-length arrays aligned with equity curve", () => {
    const rs = buildRollingSeries(result.equityCurve, result.trades, cfg.startingCapital, 3);
    expect(rs.dates.length).toBe(result.equityCurve.length);
    expect(rs.equity.length).toBe(rs.dates.length);
    expect(rs.rollingReturn.length).toBe(rs.dates.length);
    expect(rs.rollingVol.length).toBe(rs.dates.length);
    expect(rs.rollingSharpe.length).toBe(rs.dates.length);
  });
  it("monthly heatmap aggregates by YYYY-MM", () => {
    const cells = buildMonthlyHeatmap(result.trades);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].year).toBe(2024);
    expect(cells[0].month).toBe(1);
  });
});

describe("Phase 22 Stage 2 · history + comparison", () => {
  it("history records deterministically and supports latest()", () => {
    const hist = new PortfolioHistory();
    const r = runPortfolioResearch({ candidates: [A, B], config: cfg });
    hist.record(r, "run 1", "2024-06-04T00:00:00Z");
    hist.record(r, "run 2", "2024-06-04T00:00:01Z");
    expect(hist.size()).toBe(2);
    expect(hist.latest()!.note).toBe("run 2");
  });
  it("compareResults produces metric deltas and allocation diffs", () => {
    const a = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const b = runPortfolioResearch({
      candidates: [A, B],
      config: { ...cfg, method: "VOL_INVERSE" },
    });
    const cmp = compareResults(a, b);
    expect(cmp.aRunId).toBe(a.runId);
    expect(cmp.bRunId).toBe(b.runId);
    expect(cmp.metrics.find((m) => m.metric === "sharpe")).toBeDefined();
    expect(cmp.allocations.length).toBeGreaterThan(0);
    expect(cmp.warnings.some((w) => w.startsWith("ALLOCATION_METHOD_DIFF"))).toBe(true);
  });
  it("flags identical Run IDs", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfg });
    expect(compareResults(r, r).warnings).toContain("IDENTICAL_RUN_ID");
  });
});

describe("Phase 22 Stage 2 · bundle exports carry provenance", () => {
  const result = runPortfolioResearch({ candidates: [A, B], config: cfg });
  const rows = buildCandidateRows([A, B]);

  it("Candidates CSV carries disclaimer and portfolio Run ID", () => {
    const csv = buildCandidatesCsv(rows, result.runId);
    expect(csv).toContain("PORTFOLIO RESEARCH ONLY");
    expect(csv).toContain(result.runId);
    for (const r of rows) expect(csv).toContain(r.runId);
  });
  it("Bundle JSON is parseable and includes portfolio + candidates", () => {
    const j = JSON.parse(
      buildResearchBundleJson({ portfolio: result, candidates: rows }),
    );
    expect(j.disclaimer).toContain("PORTFOLIO RESEARCH ONLY");
    expect(j.bundle.portfolio.runId).toBe(result.runId);
    expect(j.bundle.candidates.length).toBe(2);
  });
  it("Comparison CSV includes both Run IDs", () => {
    const b = runPortfolioResearch({
      candidates: [A, B],
      config: { ...cfg, method: "VOL_INVERSE" },
    });
    const csv = buildComparisonCsv(compareResults(result, b));
    expect(csv).toContain(result.runId);
    expect(csv).toContain(b.runId);
  });
  it("History CSV lists every entry", () => {
    const hist = new PortfolioHistory();
    hist.record(result, "r1", "2024-06-04T00:00:00Z");
    const csv = buildHistoryCsv(hist.list());
    expect(csv).toContain(result.runId);
    expect(csv).toContain("r1");
  });
});

describe("Phase 22 Stage 2 · no production mutation", () => {
  it("candidate discovery never re-runs strategies (source runId preserved)", () => {
    const r = makeResult("Z", [["2024-01-01", 1]]);
    const a = candidateFromResult(r);
    expect(a.runId).toBe(r.runId);
  });
  it("portfolio engine does not mutate source result equity curves", () => {
    const before = JSON.stringify(A.equityCurve);
    runPortfolioResearch({ candidates: [A, B], config: cfg });
    expect(JSON.stringify(A.equityCurve)).toBe(before);
  });
});