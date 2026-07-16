// Phase 22 · Stage 3 — Deterministic tests: auto-registration, frontier,
// risk-budget, portfolio recommendation, scenario comparison, exports.

import { describe, it, expect, beforeEach } from "vitest";
import { runPortfolioResearch } from "./portfolio-engine";
import {
  candidateFromResult,
  CandidateRegistry,
  globalCandidateRegistry,
} from "./candidate-discovery";
import {
  autoRegisterCandidate,
  autoRegisterMany,
  evaluateRegistrationSafety,
} from "./auto-registration";
import { computeEfficientFrontier } from "./efficient-frontier";
import { computeRiskBudget } from "./risk-budget";
import {
  computePortfolioRecommendation,
  computePortfolioRecommendationRunId,
} from "./portfolio-recommendation";
import { compareScenarios } from "./scenario-comparison";
import {
  buildAllocationTreemapCsv,
  buildFrontierCsv,
  buildInstitutionalBundleJson,
  buildRecommendationCsv,
  buildRiskBudgetCsv,
  buildScenarioComparisonCsv,
} from "./stage3-exports";
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
    pnl, mfe: null, mae: null, holdingTime: null,
    formulaVersion: "SMC_V1" as HistoricalTrade["formulaVersion"],
    source: "test", ambiguous: false, reasons: [], metadata: {},
  };
}

function makeResult(id: string, pnls: readonly [string, number][], formula = "SMC_V1"): HistoricalBacktestResult {
  const trades = pnls.map(([d, p]) => tr(d, p, id));
  let eq = 0, peak = 0, mx = 0;
  const curve = trades.map((t) => { eq += t.pnl; peak = Math.max(peak, eq); mx = Math.max(mx, peak - eq); return { date: t.date, equity: eq }; });
  return {
    formulaVersion: formula as HistoricalBacktestResult["formulaVersion"],
    engineVersion: "e", executionVersion: "x", cubeVersion: "n/a", policyVersion: "p",
    runId: `RUN_${id}`, generatedAt: "2024-06-04T00:00:00Z",
    instrument: "NIFTY50", from: pnls[0][0], to: pnls[pnls.length - 1][0],
    dataGranularity: "5m", source: "test", dataQuality: null,
    trades, stats: {}, monthly: [], equityCurve: curve,
    drawdown: { max: mx, maxPct: 0 },
    benchmark: null, methodology: "", disclaimers: [], formulaMeta: {},
  };
}

function asset(id: string, pnls: readonly [string, number][], extra: Partial<PortfolioAsset> = {}): PortfolioAsset {
  return { ...candidateFromResult(makeResult(id, pnls)), ...extra, id };
}

const A = asset("A", [["2024-01-01", 10], ["2024-01-02", -5], ["2024-01-03", 8], ["2024-01-04", -3], ["2024-01-05", 6]]);
const B = asset("B", [["2024-01-01", -2], ["2024-01-02", 4], ["2024-01-03", -1], ["2024-01-04", 3], ["2024-01-05", -1]]);
const C = asset("C", [["2024-01-01", 3], ["2024-01-02", 2], ["2024-01-03", -4], ["2024-01-04", 5], ["2024-01-05", 1]]);

const cfg: PortfolioConfig = {
  method: "EQUAL_WEIGHT",
  startingCapital: 100000,
  sizingPolicy: defaultSizingPolicy(),
  rebalancePolicy: "NEVER",
  constraints: { minDiversificationCount: 1, minTradeCount: 0, maxLeverage: 1 },
  costs: defaultCostModel(),
};

describe("Phase 22 Stage 3 · auto-registration", () => {
  beforeEach(() => globalCandidateRegistry.clear());

  it("registers a valid result and deduplicates by Run ID", () => {
    const r = makeResult("X", [["2024-01-01", 1]]);
    const reg = new CandidateRegistry();
    const first = autoRegisterCandidate({ result: r, source: "SMC", registry: reg });
    expect(first.ok).toBe(true);
    const dup = autoRegisterCandidate({ result: r, source: "SMC", registry: reg });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reason).toBe("DUPLICATE_RUN_ID");
  });

  it("rejects overfit / unreliable / negative-edge candidates", () => {
    const r = makeResult("Y", [["2024-01-01", 1]]);
    expect(evaluateRegistrationSafety(r, { overfitStatus: "OVERFIT" }, 1)).toBe("OPTIMIZER_OVERFIT");
    expect(evaluateRegistrationSafety(r, { reliability: "POOR" }, 1)).toBe("UNRELIABLE_RECOMMENDATION");
    expect(evaluateRegistrationSafety(r, { oosExpectancy: -0.1 }, 1)).toBe("NEGATIVE_OOS_EXPECTANCY");
  });

  it("rejects incomplete metadata", () => {
    const r = makeResult("Z", [["2024-01-01", 1]]);
    expect(evaluateRegistrationSafety({ ...r, runId: "" }, undefined, 1)).toBe("MISSING_RUN_ID");
    expect(evaluateRegistrationSafety(r, { dataHash: "" }, 1)).toBe("MISSING_DATA_HASH");
    expect(evaluateRegistrationSafety({ ...r, trades: [] }, undefined, 5)).toBe("INSUFFICIENT_TRADES");
  });

  it("bulk register returns per-item outcomes preserving order", () => {
    const reg = new CandidateRegistry();
    const items = [
      { result: makeResult("R1", [["2024-01-01", 1]]), source: "SMC" as const, registry: reg },
      { result: makeResult("R2", [["2024-01-01", 1]]), source: "HYBRID" as const, registry: reg },
    ];
    const outs = autoRegisterMany(items);
    expect(outs.length).toBe(2);
    expect(outs.every((o) => o.ok)).toBe(true);
  });
});

describe("Phase 22 Stage 3 · efficient frontier", () => {
  it("returns feasible + frontier points with min-variance / max-Sharpe / max-diversification", () => {
    const f = computeEfficientFrontier({
      candidates: [A, B, C],
      startingCapital: 100000,
      weightStep: 0.25,
    });
    expect(f.feasible.length).toBeGreaterThan(0);
    expect(f.frontier.length).toBeGreaterThan(0);
    expect(f.minVariance).not.toBeNull();
    expect(f.maxSharpe).not.toBeNull();
    expect(f.maxDiversification).not.toBeNull();
    // frontier is sorted by volatility ascending
    const vols = f.frontier.map((p) => p.volatility);
    expect([...vols].sort((a, b) => a - b)).toEqual(vols);
  });

  it("dominated portfolios are flagged and never efficient", () => {
    const f = computeEfficientFrontier({ candidates: [A, B, C], startingCapital: 100000, weightStep: 0.25 });
    for (const p of f.feasible) expect(p.efficient).toBe(!p.dominated);
  });

  it("rejects portfolios violating maxWeightPerStrategy", () => {
    const f = computeEfficientFrontier({
      candidates: [A, B, C],
      startingCapital: 100000,
      weightStep: 0.25,
      constraints: { maxWeightPerStrategy: 0.4 },
    });
    expect(f.rejected).toBeGreaterThan(0);
    for (const p of f.feasible) {
      const byStrat = new Map<string, number>();
      const assets = [A, B, C];
      for (let i = 0; i < p.weights.length; i++)
        byStrat.set(assets[i].strategy, (byStrat.get(assets[i].strategy) ?? 0) + p.weights[i]);
      for (const w of byStrat.values()) expect(w).toBeLessThanOrEqual(0.4 + 1e-9);
    }
  });

  it("target return / vol portfolios respect their constraint", () => {
    const f = computeEfficientFrontier({
      candidates: [A, B, C],
      startingCapital: 100000,
      weightStep: 0.25,
      targetReturn: 0,
      targetVol: 999,
    });
    if (f.targetReturnPortfolio) expect(f.targetReturnPortfolio.expectedReturn).toBeGreaterThanOrEqual(0);
    if (f.targetVolPortfolio) expect(f.targetVolPortfolio.volatility).toBeLessThanOrEqual(999);
  });

  it("returns empty when only one candidate", () => {
    const f = computeEfficientFrontier({ candidates: [A], startingCapital: 100000 });
    expect(f.feasible.length).toBe(0);
    expect(f.frontier.length).toBe(0);
  });
});

describe("Phase 22 Stage 3 · risk budget", () => {
  it("produces per-asset gap and compliance", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const rb = computeRiskBudget({ assets: [A, B], contributions: r.riskContributions });
    expect(rb.rows.length).toBe(2);
    expect(rb.rows.every((row) => row.target > 0)).toBe(true);
    expect(rb.compliance).toBeGreaterThanOrEqual(0);
  });

  it("flags OVER breach when target < actual by more than tolerance", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const rb = computeRiskBudget({
      assets: [A, B],
      contributions: r.riskContributions,
      targets: { A: 0, B: 0 },
      tolerance: 0.01,
    });
    expect(rb.rows.some((row) => row.breach === "OVER")).toBe(true);
  });
});

describe("Phase 22 Stage 3 · portfolio recommendation", () => {
  it("produces recommended/conservative/balanced/aggressive & deterministic Run ID", () => {
    const rA = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const rB = runPortfolioResearch({ candidates: [A, B], config: { ...cfg, method: "VOL_INVERSE" } });
    const rec1 = computePortfolioRecommendation({
      scenarios: [
        { id: "eq", label: "Equal Weight", result: rA, assets: [A, B] },
        { id: "vi", label: "Vol Inverse", result: rB, assets: [A, B] },
      ],
    });
    expect(rec1.scored.length).toBe(2);
    expect(rec1.recommended).not.toBeNull();
    const rec2 = computePortfolioRecommendation({
      scenarios: [
        { id: "eq", label: "Equal Weight", result: rA, assets: [A, B] },
        { id: "vi", label: "Vol Inverse", result: rB, assets: [A, B] },
      ],
    });
    expect(rec2.runId).toBe(rec1.runId);
  });

  it("cannot recommend a scenario that breaches hard gates", () => {
    const bad = { ...A, overfitStatus: "OVERFIT" as const };
    const r = runPortfolioResearch({ candidates: [bad, B], config: { ...cfg, constraints: { ...cfg.constraints } } });
    const rec = computePortfolioRecommendation({
      scenarios: [{ id: "eq", label: "Equal Weight", result: r, assets: [bad, B] }],
    });
    expect(rec.recommended).toBeNull();
    expect(rec.rejected.length).toBe(1);
    expect(rec.rejected[0].hardGateFailures.some((g) => g.startsWith("OVERFIT"))).toBe(true);
  });

  it("recommendation Run-ID is stable across identical inputs", () => {
    const rA = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const id1 = computePortfolioRecommendationRunId({ scenarios: [] }, [
      { scenarioId: "x", runId: rA.runId, score: 0.5, confidence: 0.5, components: {}, hardGateFailures: [], reasons: [], evidence: {}, recommendable: true },
    ]);
    const id2 = computePortfolioRecommendationRunId({ scenarios: [] }, [
      { scenarioId: "x", runId: rA.runId, score: 0.5, confidence: 0.5, components: {}, hardGateFailures: [], reasons: [], evidence: {}, recommendable: true },
    ]);
    expect(id1).toBe(id2);
  });
});

describe("Phase 22 Stage 3 · scenario comparison", () => {
  it("warns on different candidate sets", () => {
    const rA = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const rB = runPortfolioResearch({ candidates: [A, C], config: cfg });
    const cmp = compareScenarios({
      scenarios: [
        { id: "a", label: "AB", result: rA },
        { id: "b", label: "AC", result: rB },
      ],
    });
    expect(cmp.warnings).toContain("DIFFERENT_CANDIDATE_SETS");
    expect(cmp.rows.length).toBe(2);
  });
});

describe("Phase 22 Stage 3 · exports carry provenance", () => {
  it("Frontier / Risk Budget / Recommendation / Comparison / Treemap CSVs contain disclaimer", () => {
    const r = runPortfolioResearch({ candidates: [A, B], config: cfg });
    const f = computeEfficientFrontier({ candidates: [A, B], startingCapital: 100000, weightStep: 0.25 });
    const rb = computeRiskBudget({ assets: [A, B], contributions: r.riskContributions });
    const rec = computePortfolioRecommendation({
      scenarios: [{ id: "eq", label: "Equal Weight", result: r, assets: [A, B] }],
    });
    const cmp = compareScenarios({ scenarios: [{ id: "eq", label: "Equal Weight", result: r }] });
    const tree = buildAllocationTreemapCsv(r, [A, B]);
    for (const csv of [buildFrontierCsv(f), buildRiskBudgetCsv(rb), buildRecommendationCsv(rec), buildScenarioComparisonCsv(cmp), tree]) {
      expect(csv).toContain("PORTFOLIO RESEARCH ONLY");
    }
    const bundle = JSON.parse(buildInstitutionalBundleJson({ portfolio: r, frontier: f, riskBudget: rb, recommendation: rec, comparison: cmp }));
    expect(bundle.disclaimer).toContain("PORTFOLIO RESEARCH ONLY");
    expect(bundle.bundle.portfolio.runId).toBe(r.runId);
    expect(bundle.bundle.frontier.assetIds.length).toBe(2);
  });
});

describe("Phase 22 Stage 3 · no production mutation", () => {
  it("frontier engine does not mutate source trades or equity curves", () => {
    const before = JSON.stringify({ a: A.trades, b: B.trades });
    computeEfficientFrontier({ candidates: [A, B, C], startingCapital: 100000, weightStep: 0.25 });
    expect(JSON.stringify({ a: A.trades, b: B.trades })).toBe(before);
  });
});