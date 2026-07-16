import { describe, it, expect } from "vitest";
import {
  buildContextRows,
  buildHeatmapMatrix,
  checkDataHashMismatch,
  hasUnsafeDrift,
  OPTIMIZER_UI_MARKER,
} from "./optimizer-ui-helpers";
import { runOptimizerPipeline } from "./optimizer-pipeline";
import { buildHeatmapOverlay } from "./optimizer-heatmap";
import { computeParameterDrift } from "./optimizer-drift";
import type { ResolvedResearchContext } from "./research-context";
import type { ParameterSpec, SensitivityCell, SensitivityMetrics, SensitivityClassification } from "./parameter-sensitivity";
import type { OptimizerAggregateInputs } from "./explainable-optimizer";
import type { RobustnessStatus } from "./robustness";
import type { ReliabilityRating } from "./recommendation-validator";

function m(o: Partial<SensitivityMetrics> = {}): SensitivityMetrics {
  return {
    trades: 60, winRate: 0.55, profitFactor: 1.8, expectancy: 2.5, netPnl: 150,
    maxDrawdown: 40, recoveryFactor: 4, stabilityScore: 0.7, oosScore: 0.7,
    monteCarloMedian: 1100, monteCarloP5: 970, ...o,
  };
}
function agg(o: Partial<OptimizerAggregateInputs> = {}): OptimizerAggregateInputs {
  return {
    walkForwardStability: 0.8, oosConsistency: 0.75, walkForwardWindows: 6,
    monteCarloP5FinalEquity: 950, monteCarloMedianFinalEquity: 1100, monteCarloSimulations: 500,
    startingCapital: 1000, robustnessStatus: "ROBUST" as RobustnessStatus, robustnessScore: 0.8,
    sensitivityClassification: "STABLE_PLATEAU" as SensitivityClassification,
    profitFactorConsistency: 0.7, calibrationRating: "GOOD" as ReliabilityRating,
    crossAssetConsistency: 0.7, dataQuality: "GOOD", ...o,
  };
}
const space: ParameterSpec[] = [{ name: "minScore", min: 60, max: 75, step: 5 }];
const cells: SensitivityCell[] = [
  { params: { minScore: 60 }, metrics: m({ expectancy: 2.0 }) },
  { params: { minScore: 65 }, metrics: m({ expectancy: 2.6 }) },
  { params: { minScore: 70 }, metrics: m({ expectancy: 2.5 }) },
  { params: { minScore: 75 }, metrics: m({ expectancy: 2.2 }) },
];
function ctx(o: Partial<ResolvedResearchContext> = {}): ResolvedResearchContext {
  return {
    strategy: "SMC_V1", formulaVersion: "SMC_V1", baseRunId: "BASE",
    researchRunIds: { sens: "S", wf: "W", mc: "M", rob: "R" },
    provider: "P", instrument: "NIFTY50", from: "2024-01-01", to: "2024-06-30",
    dataHash: "H", parameterSpace: space, sensitivityCells: cells,
    aggregate: agg(), currentParameters: { minScore: 60 }, ...o,
  };
}

describe("Phase 21.9 Stage 2A · optimizer UI helpers", () => {
  it("exports a stable marker", () => {
    expect(OPTIMIZER_UI_MARKER).toBe("OPTIMIZER_UI_V1");
  });
  it("reports incomplete context when null and never throws", () => {
    const r = buildContextRows(null);
    expect(r.ready).toBe(false);
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.rows.every((row) => row.status === "MISSING")).toBe(true);
  });
  it("reports READY rows for a full context", () => {
    const r = buildContextRows(ctx());
    expect(r.ready).toBe(true);
    const keys = r.rows.filter((row) => row.status === "READY").map((row) => row.key);
    expect(keys).toEqual(expect.arrayContaining(["strategy", "baseRunId", "parameterSpace", "sensitivity", "walkForward"]));
  });
  it("builds a heatmap matrix from cells", () => {
    const result = runOptimizerPipeline(ctx(), undefined, () => "t").result;
    const overlay = buildHeatmapOverlay(cells, result);
    const matrix = buildHeatmapMatrix(overlay);
    expect(matrix).not.toBeNull();
    expect(matrix!.xValues).toEqual([60, 65, 70, 75]);
    expect(matrix!.cells.length).toBeGreaterThan(0);
  });
  it("flags unsafe drift", () => {
    const drift = computeParameterDrift(
      { minScore: 90 }, { minScore: 65 }, space, { minScore: { min: 60, max: 70 } },
    );
    expect(hasUnsafeDrift(drift)).toBe(true);
  });
  it("detects data-hash / range mismatch for run comparison", () => {
    expect(checkDataHashMismatch({ dataHash: "A", from: "x", to: "y" }, { dataHash: "B", from: "x", to: "y" }).mismatch).toBe(true);
    expect(checkDataHashMismatch({ dataHash: "A", from: "x", to: "y" }, { dataHash: "A", from: "x", to: "y" }).mismatch).toBe(false);
    expect(checkDataHashMismatch({ dataHash: "A", from: "x", to: "y" }, { dataHash: "A", from: "x", to: "z" }).mismatch).toBe(true);
  });
});