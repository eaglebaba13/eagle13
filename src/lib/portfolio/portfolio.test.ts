// Phase 22 · Stage 1 — Portfolio research determinism tests.

import { describe, it, expect } from "vitest";
import { computeKelly } from "./kelly-sizing";
import { computeVolTargetScale } from "./vol-targeting";
import { computeCorrelations } from "./correlation";
import { computeAllocation, applyConstraints } from "./allocation-methods";
import { runPortfolioResearch } from "./portfolio-engine";
import { runPortfolioMonteCarlo } from "./portfolio-monte-carlo";
import { computePortfolioRunId } from "./portfolio-run-id";
import { PortfolioPresetLibrary } from "./portfolio-presets";
import {
  buildAllocationCsv,
  buildPortfolioJson,
  buildPortfolioSummaryCsv,
  buildStressTestCsv,
} from "./portfolio-exports";
import {
  defaultConstraints,
  defaultCostModel,
  defaultSizingPolicy,
  type PortfolioAsset,
  type PortfolioConfig,
} from "./portfolio-types";
import type { HistoricalTrade } from "@/lib/backtest/result";

function tr(date: string, pnl: number, id = "t"): HistoricalTrade {
  return {
    id: `${id}-${date}`,
    date,
    side: pnl >= 0 ? "BUY" : "SELL",
    entry: 100,
    stop: 99,
    target: 101,
    exit: 100,
    outcome: pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "FLAT",
    pnl,
    mfe: null,
    mae: null,
    holdingTime: null,
    formulaVersion: "SMC_V1" as HistoricalTrade["formulaVersion"],
    source: "test",
    ambiguous: false,
    reasons: [],
    metadata: {},
  };
}

function asset(id: string, pnls: readonly [string, number][], overrides: Partial<PortfolioAsset> = {}): PortfolioAsset {
  const trades = pnls.map(([d, p]) => tr(d, p, id));
  return {
    id,
    label: id,
    strategy: "SMC",
    formulaVersion: "SMC_V1",
    instrument: "NIFTY50",
    timeframe: "5m",
    runId: `RUN_${id}`,
    from: pnls[0]?.[0] ?? "2024-01-01",
    to: pnls[pnls.length - 1]?.[0] ?? "2024-01-31",
    startingCapital: 100000,
    trades,
    equityCurve: [],
    maxDrawdown: 0,
    netPnl: trades.reduce((s, t) => s + t.pnl, 0),
    ...overrides,
  };
}

const cfgBase: PortfolioConfig = {
  method: "EQUAL_WEIGHT",
  startingCapital: 100000,
  sizingPolicy: defaultSizingPolicy(),
  rebalancePolicy: "NEVER",
  constraints: {
    minDiversificationCount: 1,
    minTradeCount: 0,
    maxLeverage: 1,
  },
  costs: defaultCostModel(),
};

const A = asset("A", [["2024-01-01", 10], ["2024-01-02", -5], ["2024-01-03", 8], ["2024-01-04", -2], ["2024-01-05", 6]]);
const B = asset("B", [["2024-01-01", -3], ["2024-01-02", 6], ["2024-01-03", -1], ["2024-01-04", 4], ["2024-01-05", -2]]);
const C = asset("C", [["2024-01-01", 5], ["2024-01-02", 4], ["2024-01-03", 5], ["2024-01-04", 4], ["2024-01-05", 5]]);

describe("Phase 22 Stage 1 · Kelly", () => {
  it("Full Kelly = raw fraction, Half=0.5x, Quarter=0.25x", () => {
    const base = { winProbability: 0.6, averageWin: 10, averageLoss: 5, tradeCount: 100 };
    const full = computeKelly({ ...base, fraction: "FULL", maxAllocation: 1 });
    const half = computeKelly({ ...base, fraction: "HALF", maxAllocation: 1 });
    const qtr = computeKelly({ ...base, fraction: "QUARTER", maxAllocation: 1 });
    expect(full.fraction).toBeCloseTo(full.raw, 6);
    expect(half.fraction).toBeCloseTo(full.raw * 0.5, 6);
    expect(qtr.fraction).toBeCloseTo(full.raw * 0.25, 6);
  });
  it("respects hard cap", () => {
    const r = computeKelly({ winProbability: 0.9, averageWin: 100, averageLoss: 1, tradeCount: 100, fraction: "FULL", maxAllocation: 0.2 });
    expect(r.fraction).toBeLessThanOrEqual(0.2);
  });
  it("blocks insufficient sample", () => {
    const r = computeKelly({ winProbability: 0.6, averageWin: 10, averageLoss: 5, tradeCount: 5, fraction: "FULL" });
    expect(r.blocked).toBe(true);
    expect(r.reason).toContain("INSUFFICIENT_SAMPLE");
  });
  it("blocks negative edge", () => {
    const r = computeKelly({ winProbability: 0.2, averageWin: 5, averageLoss: 10, tradeCount: 100, fraction: "FULL" });
    expect(r.blocked).toBe(true);
  });
});

describe("Phase 22 Stage 1 · Vol targeting", () => {
  it("returns scale within bounds", () => {
    const r = computeVolTargetScale({ returns: [0.01, -0.02, 0.005, -0.01, 0.015], targetAnnualVol: 0.1 });
    expect(r.scale).toBeGreaterThanOrEqual(0.25);
    expect(r.scale).toBeLessThanOrEqual(2);
  });
  it("handles zero volatility (floor)", () => {
    const r = computeVolTargetScale({ returns: [0, 0, 0, 0], targetAnnualVol: 0.1 });
    expect(r.scale).toBeGreaterThan(0);
  });
});

describe("Phase 22 Stage 1 · Correlation", () => {
  it("aligns only on shared dates", () => {
    const m = computeCorrelations([A, B]);
    expect(m.alignedObservations).toBe(5);
    expect(m.assetIds).toEqual(["A", "B"]);
  });
  it("diagonal = 1", () => {
    const m = computeCorrelations([A, B, C]);
    for (let i = 0; i < 3; i++) expect(m.returns[i][i]).toBe(1);
  });
  it("simultaneous-loss rate is bounded", () => {
    const m = computeCorrelations([A, B]);
    expect(m.simultaneousLossRate).toBeGreaterThanOrEqual(0);
    expect(m.simultaneousLossRate).toBeLessThanOrEqual(1);
  });
  it("missing dates are not fabricated", () => {
    const D = asset("D", [["2024-02-01", 1]]); // no overlap with A
    const m = computeCorrelations([A, D]);
    expect(m.alignedObservations).toBe(0);
  });
});

describe("Phase 22 Stage 1 · Allocation methods", () => {
  it("Equal weight = 1/N summing to 1", () => {
    const a = computeAllocation([A, B, C], "EQUAL_WEIGHT", cfgBase);
    const sum = a.allocations.reduce((s, x) => s + x.weight, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
  it("Custom weights honored", () => {
    const a = computeAllocation([A, B], "FIXED_CUSTOM", { ...cfgBase, customWeights: { A: 0.7, B: 0.3 } });
    expect(a.allocations[0].weight).toBeCloseTo(0.7, 6);
    expect(a.allocations[1].weight).toBeCloseTo(0.3, 6);
  });
  it("Vol-inverse gives lower-vol asset higher weight", () => {
    const a = computeAllocation([A, C], "VOL_INVERSE", cfgBase);
    const w = Object.fromEntries(a.allocations.map((x) => [x.assetId, x.weight]));
    expect(w.C).toBeGreaterThan(w.A);
  });
  it("Robustness weighting uses provided scores", () => {
    const A1 = { ...A, robustnessScore: 0.9 };
    const B1 = { ...B, robustnessScore: 0.1 };
    const a = computeAllocation([A1, B1], "ROBUSTNESS_WEIGHTED", cfgBase);
    expect(a.allocations[0].weight).toBeGreaterThan(a.allocations[1].weight);
  });
  it("Recommendation weighting uses confidence", () => {
    const A1 = { ...A, recommendationConfidence: 0.8 };
    const B1 = { ...B, recommendationConfidence: 0.2 };
    const a = computeAllocation([A1, B1], "RECOMMENDATION_WEIGHTED", cfgBase);
    expect(a.allocations[0].weight).toBeGreaterThan(a.allocations[1].weight);
  });
  it("applyConstraints caps per-strategy weight", () => {
    const { weights } = applyConstraints([0.9, 0.1], [A, B], { maxWeightPerStrategy: 0.5, maxLeverage: 1 });
    expect(weights[0]).toBeLessThanOrEqual(0.5);
  });
  it("Constraint rejects insufficient-trade candidates", () => {
    const short = asset("SHORT", [["2024-01-01", 1]]);
    const alloc = computeAllocation([A, short], "EQUAL_WEIGHT", {
      ...cfgBase,
      constraints: { ...cfgBase.constraints, minTradeCount: 3 },
    });
    const wShort = alloc.allocations.find((x) => x.assetId === "SHORT")!;
    expect(wShort.weight).toBe(0);
    expect(alloc.rejected.some((r) => r.assetId === "SHORT")).toBe(true);
  });
});

describe("Phase 22 Stage 1 · Portfolio engine end-to-end", () => {
  it("produces deterministic Run ID", () => {
    const r1 = runPortfolioResearch({ candidates: [A, B], config: cfgBase, now: () => "2024-06-04T00:00:00Z" });
    const r2 = runPortfolioResearch({ candidates: [A, B], config: cfgBase, now: () => "2024-06-04T00:00:00Z" });
    expect(r1.runId).toBe(r2.runId);
    expect(r1.runId).toMatch(/^PORTFOLIO_RESEARCH_V1:[0-9a-f]{8}$/);
  });
  it("Different candidates ⇒ different Run ID", () => {
    const r1 = computePortfolioRunId([A, B], cfgBase);
    const r2 = computePortfolioRunId([A, C], cfgBase);
    expect(r1).not.toBe(r2);
  });
  it("Different data hashes ⇒ different Run ID", () => {
    const r1 = computePortfolioRunId([{ ...A, dataHash: "h1" }, B], cfgBase);
    const r2 = computePortfolioRunId([{ ...A, dataHash: "h2" }, B], cfgBase);
    expect(r1).not.toBe(r2);
  });
  it("Aggregates equity curve, drawdown, metrics", () => {
    const r = runPortfolioResearch({ candidates: [A, B, C], config: cfgBase });
    expect(r.equityCurve.length).toBeGreaterThan(0);
    expect(r.drawdownCurve.length).toBe(r.equityCurve.length);
    expect(r.metrics.netPnl).toBeCloseTo(r.trades.reduce((s, t) => s + t.scaledPnl, 0), 6);
  });
  it("Does not mutate source trades", () => {
    const before = JSON.stringify(A.trades);
    runPortfolioResearch({ candidates: [A, B], config: cfgBase });
    expect(JSON.stringify(A.trades)).toBe(before);
  });
  it("Risk contributions reconcile capital % to 1 for included assets", () => {
    const r = runPortfolioResearch({ candidates: [A, B, C], config: cfgBase });
    const total = r.riskContributions.reduce((s, x) => s + x.capitalPct, 0);
    expect(total).toBeCloseTo(1, 4);
  });
  it("Blocks OVERFIT candidates", () => {
    const bad = { ...A, overfitStatus: "OVERFIT" as const };
    const r = runPortfolioResearch({ candidates: [bad, B], config: cfgBase });
    expect(r.blockingReasons.some((x) => x.includes("OPTIMIZER_OVERFIT"))).toBe(true);
  });
  it("Blocks UNRELIABLE recommendations", () => {
    const bad = { ...A, reliability: "POOR" as const };
    const r = runPortfolioResearch({ candidates: [bad, B], config: cfgBase });
    expect(r.blockingReasons.some((x) => x.includes("RECOMMENDATION_UNRELIABLE"))).toBe(true);
  });
});

describe("Phase 22 Stage 1 · Portfolio Monte Carlo", () => {
  it("same seed ⇒ identical result", () => {
    const r = runPortfolioResearch({ candidates: [A, B, C], config: cfgBase });
    const a = runPortfolioMonteCarlo({ result: r, startingCapital: cfgBase.startingCapital, simulations: 100, seed: 42, mode: "BLOCK_BOOTSTRAP", blockSize: 3 });
    const b = runPortfolioMonteCarlo({ result: r, startingCapital: cfgBase.startingCapital, simulations: 100, seed: 42, mode: "BLOCK_BOOTSTRAP", blockSize: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("Vol shock increases drawdown vs shuffle", () => {
    const r = runPortfolioResearch({ candidates: [A, B, C], config: cfgBase });
    const shuf = runPortfolioMonteCarlo({ result: r, startingCapital: cfgBase.startingCapital, simulations: 200, seed: 7, mode: "SHUFFLE" });
    const shock = runPortfolioMonteCarlo({ result: r, startingCapital: cfgBase.startingCapital, simulations: 200, seed: 7, mode: "VOL_SHOCK", volShockMultiplier: 3 });
    expect(shock.maxDrawdown.p95).toBeGreaterThanOrEqual(shuf.maxDrawdown.p95);
  });
});

describe("Phase 22 Stage 1 · Exports carry provenance", () => {
  it("Summary CSV includes portfolio Run ID and disclaimer", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfgBase });
    const csv = buildPortfolioSummaryCsv(r);
    expect(csv).toContain(r.runId);
    expect(csv).toContain("PORTFOLIO RESEARCH ONLY");
  });
  it("Allocation CSV lists every asset", () => {
    const r = runPortfolioResearch({ candidates: [A, B, C], config: cfgBase });
    const csv = buildAllocationCsv(r);
    for (const id of ["A", "B", "C"]) expect(csv).toContain(id);
  });
  it("Stress-test CSV emits mode and simulation count", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfgBase });
    const mc = runPortfolioMonteCarlo({ result: r, startingCapital: cfgBase.startingCapital, simulations: 25, seed: 1, mode: "SHUFFLE" });
    const csv = buildStressTestCsv(r, mc);
    expect(csv).toContain("SHUFFLE");
    expect(csv).toContain("25");
  });
  it("Portfolio JSON is parseable and carries disclaimer", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfgBase });
    const j = JSON.parse(buildPortfolioJson(r));
    expect(j.disclaimer).toContain("PORTFOLIO RESEARCH ONLY");
    expect(j.result.runId).toBe(r.runId);
  });
});

describe("Phase 22 Stage 1 · Preset library", () => {
  it("saves, renames, duplicates, deletes without production mutation", () => {
    const lib = new PortfolioPresetLibrary();
    const p = lib.save({ id: "p1", name: "P1", createdAt: "2024-01-01", config: cfgBase, candidateRunIds: ["A", "B"], portfolioRunId: "PORTFOLIO_RESEARCH_V1:aaaaaaaa" });
    expect(lib.list().length).toBe(1);
    lib.rename("p1", "P1v2");
    expect(lib.get("p1")!.name).toBe("P1v2");
    lib.duplicate("p1", "p2", "P2", "2024-01-02");
    expect(lib.list().length).toBe(2);
    lib.delete("p1");
    expect(lib.list().length).toBe(1);
    expect(p.id).toBe("p1"); // original object not mutated
  });
  it("rejects duplicate IDs", () => {
    const lib = new PortfolioPresetLibrary();
    lib.save({ id: "x", name: "X", createdAt: "t", config: cfgBase, candidateRunIds: [], portfolioRunId: "r" });
    expect(() => lib.save({ id: "x", name: "Y", createdAt: "t", config: cfgBase, candidateRunIds: [], portfolioRunId: "r" })).toThrow();
  });
});