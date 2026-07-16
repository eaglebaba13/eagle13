import { describe, it, expect } from "vitest";
import {
  buildOptimizerSummaryCsv,
  buildOptimizerRecommendedRegionCsv,
  buildOptimizerAlternativesCsv,
  buildOptimizerRejectedCsv,
  buildOptimizerJson,
  buildOptimizerResearchPresetJson,
} from "./explainable-optimizer-exports";
import { runExplainableOptimization } from "./explainable-optimizer";
import type { OptimizerRunInput } from "./explainable-optimizer";
import type { SensitivityMetrics } from "./parameter-sensitivity";

function m(over: Partial<SensitivityMetrics> = {}): SensitivityMetrics {
  return {
    trades: 60, winRate: 0.55, profitFactor: 1.8, expectancy: 2.5, netPnl: 150,
    maxDrawdown: 40, recoveryFactor: 4, stabilityScore: 0.7, oosScore: 0.7,
    monteCarloMedian: 1100, monteCarloP5: 970, ...over,
  };
}

const input: OptimizerRunInput = {
  strategy: "SMC_V1", formulaVersion: "SMC_V1", baseRunId: "BASE",
  researchRunIds: { sens: "S1" },
  parameterSpace: [{ name: "minScore", min: 60, max: 75, step: 5 }],
  sensitivityCells: [
    { params: { minScore: 60 }, metrics: m({ expectancy: 2.0 }) },
    { params: { minScore: 65 }, metrics: m({ expectancy: 2.6 }) },
    { params: { minScore: 70 }, metrics: m({ expectancy: 2.5 }) },
    { params: { minScore: 75 }, metrics: m({ expectancy: 2.2 }) },
  ],
  aggregate: {
    walkForwardStability: 0.8, oosConsistency: 0.7, walkForwardWindows: 6,
    monteCarloP5FinalEquity: 950, monteCarloMedianFinalEquity: 1100, monteCarloSimulations: 500,
    startingCapital: 1000, robustnessStatus: "ROBUST", robustnessScore: 0.8,
    sensitivityClassification: "STABLE_PLATEAU", profitFactorConsistency: 0.7,
    calibrationRating: "GOOD", crossAssetConsistency: 0.7, dataQuality: "GOOD",
  },
  provider: "P", from: "2024-01-01", to: "2024-06-30", dataHash: "H",
};

const prov = {
  researchRunId: "RES_1", generatedAt: "2024-07-01T00:00:00Z",
  provider: "TEST", instrument: "NIFTY", from: "2024-01-01", to: "2024-06-30",
};

describe("Phase 21.9 Stage 1 · optimizer exports", () => {
  const r = runExplainableOptimization(input);

  it("summary CSV carries version + runId provenance", () => {
    const csv = buildOptimizerSummaryCsv(r, prov);
    expect(csv).toContain("EXPLAINABLE_OPTIMIZER_V1");
    expect(csv).toContain(r.runId);
    expect(csv).toContain("RESEARCH OPTIMIZATION ONLY");
  });
  it("recommended region CSV lists all parameters with safe range", () => {
    const csv = buildOptimizerRecommendedRegionCsv(r, prov);
    expect(csv).toContain("minScore");
    expect(csv).toContain("safe_min");
  });
  it("alternatives CSV lists conservative/balanced/aggressive labels", () => {
    const csv = buildOptimizerAlternativesCsv(r, prov);
    expect(csv).toMatch(/CONSERVATIVE|BALANCED|AGGRESSIVE/);
  });
  it("rejected CSV includes header even when empty", () => {
    const csv = buildOptimizerRejectedCsv(r, prov);
    expect(csv).toContain("reasons");
  });
  it("JSON has full provenance and evidence", () => {
    const j = JSON.parse(buildOptimizerJson(r, prov));
    expect(j.version).toBe("EXPLAINABLE_OPTIMIZER_V1");
    expect(j.provenance.researchRunId).toBe("RES_1");
    expect(j.recommended).not.toBeNull();
    expect(j.weights).toBeDefined();
    expect(j.gates).toBeDefined();
  });
  it("research preset JSON is explicitly labeled research-only", () => {
    const j = JSON.parse(buildOptimizerResearchPresetJson(r, prov));
    expect(j.kind).toBe("RESEARCH_PRESET");
    expect(j.note).toMatch(/do not apply directly to live/i);
    expect(j.parameters).toBeDefined();
  });
});
