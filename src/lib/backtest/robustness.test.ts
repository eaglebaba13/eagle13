import { describe, it, expect } from "vitest";
import {
  computeRobustnessRunId,
  computeRobustnessScore,
  ROBUSTNESS_WEIGHTS,
  type RobustnessInputs,
} from "./robustness";

function inputs(over: Partial<RobustnessInputs> = {}): RobustnessInputs {
  return {
    walkForwardStability: 0.8,
    oosConsistency: 0.75,
    monteCarloP5FinalEquity: 1100,
    monteCarloMedianFinalEquity: 1200,
    startingCapital: 1000,
    maxDrawdownPct: 0.1,
    sensitivityClassification: "STABLE_PLATEAU",
    tradeCount: 100,
    profitFactorConsistency: 0.8,
    ...over,
  };
}

describe("Phase 21.6 Stage 1 · robustness score", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(ROBUSTNESS_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
  it("classifies a strong strategy as ROBUST", () => {
    const r = computeRobustnessScore(inputs());
    expect(r.status).toBe("ROBUST");
    expect(r.total).toBeGreaterThanOrEqual(0.75);
  });
  it("classifies weak Monte Carlo P5 and high drawdown as FRAGILE", () => {
    const r = computeRobustnessScore(inputs({
      monteCarloP5FinalEquity: 700,
      maxDrawdownPct: 0.45,
      profitFactorConsistency: 0.3,
      sensitivityClassification: "ERRATIC",
      walkForwardStability: 0.35,
      oosConsistency: 0.35,
    }));
    expect(r.status).toBe("FRAGILE");
  });
  it("detects OVERFIT (strong WF, weak OOS, narrow optimum)", () => {
    const r = computeRobustnessScore(inputs({
      walkForwardStability: 0.85,
      oosConsistency: 0.3,
      sensitivityClassification: "NARROW_OPTIMUM",
    }));
    expect(r.status).toBe("OVERFIT");
  });
  it("returns INSUFFICIENT_DATA when tradeCount < 20", () => {
    const r = computeRobustnessScore(inputs({ tradeCount: 10 }));
    expect(r.status).toBe("INSUFFICIENT_DATA");
    expect(r.factors.length).toBe(0);
  });
  it("exposes per-factor formulas transparently", () => {
    const r = computeRobustnessScore(inputs());
    for (const f of r.factors) expect(typeof f.formula).toBe("string");
  });
});

describe("Phase 21.6 Stage 1 · robustness Run ID", () => {
  it("is deterministic and prefixed ROBUSTNESS_V1", () => {
    const a = computeRobustnessRunId({ researchRunId: "R", monteCarloRunId: "M", sensitivityRunId: "S" });
    const b = computeRobustnessRunId({ researchRunId: "R", monteCarloRunId: "M", sensitivityRunId: "S" });
    expect(a).toBe(b);
    expect(a).toMatch(/^ROBUSTNESS_V1:[0-9a-f]{8}$/);
  });
});
