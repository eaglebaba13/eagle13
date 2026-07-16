import { describe, it, expect } from "vitest";
import {
  runExplainableOptimization,
  computeOptimizerRunId,
  DEFAULT_OBJECTIVE_WEIGHTS,
  DEFAULT_SAFETY_GATES,
  EXPLAINABLE_OPTIMIZER_VERSION,
  type OptimizerAggregateInputs,
  type OptimizerRunInput,
} from "./explainable-optimizer";
import type { ParameterSpec, SensitivityCell, SensitivityMetrics, SensitivityClassification } from "./parameter-sensitivity";
import type { RobustnessStatus } from "./robustness";
import type { ReliabilityRating } from "./recommendation-validator";

function metrics(over: Partial<SensitivityMetrics> = {}): SensitivityMetrics {
  return {
    trades: 60, winRate: 0.55, profitFactor: 1.8, expectancy: 2.5, netPnl: 150,
    maxDrawdown: 40, recoveryFactor: 4, stabilityScore: 0.7, oosScore: 0.7,
    monteCarloMedian: 1100, monteCarloP5: 970,
    ...over,
  };
}

function makeSpace(): ParameterSpec[] {
  return [{ name: "minScore", min: 60, max: 75, step: 5 }];
}

function makeCells(vals: Array<{ minScore: number; m: SensitivityMetrics | null; reason?: string }>): SensitivityCell[] {
  return vals.map((v) => ({ params: { minScore: v.minScore }, metrics: v.m, reason: v.reason }));
}

function makeAggregate(over: Partial<OptimizerAggregateInputs> = {}): OptimizerAggregateInputs {
  return {
    walkForwardStability: 0.8, oosConsistency: 0.75, walkForwardWindows: 6,
    monteCarloP5FinalEquity: 950, monteCarloMedianFinalEquity: 1100, monteCarloSimulations: 500,
    startingCapital: 1000, robustnessStatus: "ROBUST" as RobustnessStatus, robustnessScore: 0.8,
    sensitivityClassification: "STABLE_PLATEAU" as SensitivityClassification,
    profitFactorConsistency: 0.7, calibrationRating: "GOOD" as ReliabilityRating,
    crossAssetConsistency: 0.7, dataQuality: "GOOD",
    ...over,
  };
}

function makeInput(over: Partial<OptimizerRunInput> = {}): OptimizerRunInput {
  return {
    strategy: "SMC_V1", formulaVersion: "SMC_V1", baseRunId: "BASE",
    researchRunIds: { sens: "S1", wf: "W1", mc: "M1", rob: "R1" },
    parameterSpace: makeSpace(),
    sensitivityCells: makeCells([
      { minScore: 60, m: metrics({ expectancy: 2.0 }) },
      { minScore: 65, m: metrics({ expectancy: 2.6 }) },
      { minScore: 70, m: metrics({ expectancy: 2.5 }) },
      { minScore: 75, m: metrics({ expectancy: 2.2, maxDrawdown: 25 }) },
    ]),
    aggregate: makeAggregate(),
    provider: "P", from: "2024-01-01", to: "2024-06-30", dataHash: "H",
    ...over,
  };
}

describe("Phase 21.9 Stage 1 · explainable optimizer · region selection", () => {
  it("selects a stable plateau center with neighbors and returns 3 alternatives", () => {
    const r = runExplainableOptimization(makeInput());
    expect(r.recommendedRegion).not.toBeNull();
    expect(r.recommendedRegion!.neighborCount).toBeGreaterThanOrEqual(2);
    expect(r.alternatives.length).toBeGreaterThan(0);
    expect(r.overfitRisk === "LOW" || r.overfitRisk === "MODERATE").toBe(true);
    expect(r.explanations.some((e) => e.kind === "ACCEPT")).toBe(true);
  });

  it("rejects everything when robustness is OVERFIT", () => {
    const r = runExplainableOptimization(makeInput({
      aggregate: makeAggregate({ robustnessStatus: "OVERFIT" }),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectionReasons).toContain("ROBUSTNESS_OVERFIT");
    expect(r.overfitRisk).toBe("REJECTED");
  });

  it("rejects when sensitivity is NARROW_OPTIMUM", () => {
    const r = runExplainableOptimization(makeInput({
      aggregate: makeAggregate({ sensitivityClassification: "NARROW_OPTIMUM" }),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectionReasons).toContain("SENSITIVITY_NARROW_OPTIMUM");
  });

  it("rejects when sensitivity is ERRATIC", () => {
    const r = runExplainableOptimization(makeInput({
      aggregate: makeAggregate({ sensitivityClassification: "ERRATIC" }),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectionReasons).toContain("SENSITIVITY_ERRATIC");
  });

  it("rejects a cell with non-positive OOS expectancy", () => {
    const r = runExplainableOptimization(makeInput({
      sensitivityCells: makeCells([
        { minScore: 60, m: metrics({ expectancy: -1 }) },
        { minScore: 65, m: metrics({ expectancy: -0.5 }) },
        { minScore: 70, m: metrics({ expectancy: -2 }) },
      ]),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectedRegions.length).toBeGreaterThan(0);
    expect(r.rejectedRegions[0].reasons.some((x) => x.includes("NON_POSITIVE"))).toBe(true);
  });

  it("rejects a cell with Monte Carlo ruin risk", () => {
    const r = runExplainableOptimization(makeInput({
      sensitivityCells: makeCells([
        { minScore: 60, m: metrics({ monteCarloP5: 500 }) },
        { minScore: 65, m: metrics({ monteCarloP5: 550 }) },
        { minScore: 70, m: metrics({ monteCarloP5: 600 }) },
      ]),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectedRegions[0].reasons.some((x) => x.includes("MONTE_CARLO_RUIN_RISK"))).toBe(true);
  });

  it("rejects when calibration is POOR", () => {
    const r = runExplainableOptimization(makeInput({
      aggregate: makeAggregate({ calibrationRating: "POOR" }),
    }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectionReasons.some((x) => x.startsWith("CALIBRATION_BELOW_"))).toBe(true);
  });

  it("rejects an isolated optimum with no neighbors", () => {
    const r = runExplainableOptimization(makeInput({
      parameterSpace: [{ name: "minScore", min: 60, max: 80, step: 1 }],
      sensitivityCells: makeCells([
        { minScore: 60, m: metrics({ expectancy: 0.1, trades: 25 }) },
        { minScore: 70, m: metrics({ expectancy: 10, trades: 25 }) },
        { minScore: 80, m: metrics({ expectancy: 0.1, trades: 25 }) },
      ]),
    }));
    // With step=1 and values 60/70/80, they aren't neighbors → no accepted regions.
    expect(r.recommendedRegion).toBeNull();
    expect(r.rejectedRegions.every((rr) => rr.reasons.some((x) => x.includes("INSUFFICIENT_NEIGHBORS")))).toBe(true);
  });

  it("caps confidence when trade count is low", () => {
    const r = runExplainableOptimization(makeInput({
      sensitivityCells: makeCells([
        { minScore: 60, m: metrics({ trades: 22 }) },
        { minScore: 65, m: metrics({ trades: 24 }) },
        { minScore: 70, m: metrics({ trades: 23 }) },
      ]),
    }));
    expect(["MEDIUM", "LOW", "INSUFFICIENT"]).toContain(r.confidence);
  });

  it("provides evidence-backed explanations only", () => {
    const r = runExplainableOptimization(makeInput());
    for (const e of r.explanations) {
      expect(typeof e.evidence).toBe("object");
      expect(Object.keys(e.evidence).length).toBeGreaterThan(0);
    }
  });

  it("safe range spans neighbors", () => {
    const r = runExplainableOptimization(makeInput());
    const range = r.recommendedRegion!.safeRange.minScore;
    expect(range.max).toBeGreaterThan(range.min);
  });

  it("weight overrides propagate to contributions", () => {
    const r = runExplainableOptimization(makeInput({
      config: { weights: { oosExpectancy: 0.4 } },
    }));
    expect(r.weights.oosExpectancy).toBe(0.4);
    const oos = r.objectiveContributions.find((c) => c.key === "oosExpectancy");
    expect(oos?.weight).toBe(0.4);
  });

  it("run ID is deterministic and prefixed", () => {
    const input = makeInput();
    const r1 = runExplainableOptimization(input);
    const r2 = runExplainableOptimization(input);
    expect(r1.runId).toBe(r2.runId);
    expect(r1.runId).toMatch(/^EXPLAINABLE_OPTIMIZER_V1:[0-9a-f]{8}$/);
  });

  it("run ID changes with parameter space", () => {
    const a = computeOptimizerRunId({
      strategy: "SMC_V1", formulaVersion: "SMC_V1", baseRunId: "B",
      researchRunIds: {}, parameterSpace: [{ name: "x", min: 0, max: 1, step: 0.1 }],
      weights: DEFAULT_OBJECTIVE_WEIGHTS, gates: DEFAULT_SAFETY_GATES,
      provider: "P", from: "f", to: "t", dataHash: "h",
    });
    const b = computeOptimizerRunId({
      strategy: "SMC_V1", formulaVersion: "SMC_V1", baseRunId: "B",
      researchRunIds: {}, parameterSpace: [{ name: "x", min: 0, max: 1, step: 0.2 }],
      weights: DEFAULT_OBJECTIVE_WEIGHTS, gates: DEFAULT_SAFETY_GATES,
      provider: "P", from: "f", to: "t", dataHash: "h",
    });
    expect(a).not.toBe(b);
  });

  it("returns disclaimer and version", () => {
    const r = runExplainableOptimization(makeInput());
    expect(r.version).toBe(EXPLAINABLE_OPTIMIZER_VERSION);
    expect(r.disclaimer).toMatch(/RESEARCH OPTIMIZATION ONLY/);
  });

  it("does not mutate input arrays", () => {
    const input = makeInput();
    const beforeCells = JSON.stringify(input.sensitivityCells);
    const beforeSpace = JSON.stringify(input.parameterSpace);
    runExplainableOptimization(input);
    expect(JSON.stringify(input.sensitivityCells)).toBe(beforeCells);
    expect(JSON.stringify(input.parameterSpace)).toBe(beforeSpace);
  });

  it("returns INSUFFICIENT_DATA on empty sensitivity", () => {
    const r = runExplainableOptimization(makeInput({ sensitivityCells: [] }));
    expect(r.recommendedRegion).toBeNull();
    expect(r.confidence).toBe("INSUFFICIENT");
  });
});
