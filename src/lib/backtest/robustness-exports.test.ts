import { describe, it, expect } from "vitest";
import {
  buildMonteCarloCsv,
  buildMonteCarloJson,
  buildRobustnessCsv,
  buildSensitivityCsv,
  type ExportProvenance,
} from "./robustness-exports";
import { runMonteCarlo } from "./monte-carlo";
import { classifySensitivitySurface } from "./parameter-sensitivity";
import { computeRobustnessScore } from "./robustness";

const prov: ExportProvenance = {
  researchRunId: "RESEARCH_V1:aaaaaaaa",
  monteCarloRunId: "MONTE_CARLO_V1:bbbbbbbb",
  sensitivityRunId: "SENSITIVITY_V1:cccccccc",
  robustnessRunId: "ROBUSTNESS_V1:dddddddd",
  instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-31", generatedAt: "2024-02-01T00:00:00Z",
};

describe("Phase 21.6 Stage 1 · export provenance", () => {
  it("Monte Carlo CSV embeds researchRunId + monteCarloRunId + ruin formula", () => {
    const mc = runMonteCarlo([{ pnl: 1 }, { pnl: -1 }, { pnl: 2 }], { seed: 1, simulations: 10, startingCapital: 100, samplingMode: "BOOTSTRAP" });
    const csv = buildMonteCarloCsv(mc, prov);
    expect(csv).toContain("RESEARCH ANALYSIS — NOT A LIVE TRADE RECOMMENDATION");
    expect(csv).toContain(prov.researchRunId);
    expect(csv).toContain(prov.monteCarloRunId!);
    expect(csv).toContain("ruinFormula=");
  });
  it("Monte Carlo JSON is valid and carries provenance + version", () => {
    const mc = runMonteCarlo([{ pnl: 1 }, { pnl: -1 }, { pnl: 2 }], { seed: 1, simulations: 10, startingCapital: 100, samplingMode: "BOOTSTRAP" });
    const parsed = JSON.parse(buildMonteCarloJson(mc, prov));
    expect(parsed.version).toBe("MONTE_CARLO_V1");
    expect(parsed.provenance.researchRunId).toBe(prov.researchRunId);
  });
  it("Sensitivity CSV lists param keys and reasons for insufficient cells", () => {
    const cells = [
      { params: { a: 1 }, metrics: null, reason: "INSUFFICIENT_DATA" },
      { params: { a: 2 }, metrics: null, reason: "INSUFFICIENT_DATA" },
      { params: { a: 3 }, metrics: null, reason: "INSUFFICIENT_DATA" },
    ];
    const surface = classifySensitivitySurface(cells);
    const csv = buildSensitivityCsv(cells, surface, prov);
    expect(csv).toContain("classification=INSUFFICIENT_DATA");
    expect(csv.split("\n").length).toBeGreaterThan(5);
  });
  it("Robustness CSV lists all factors with weight/score/formula", () => {
    const r = computeRobustnessScore({
      walkForwardStability: 0.8, oosConsistency: 0.75, monteCarloP5FinalEquity: 1100,
      monteCarloMedianFinalEquity: 1200, startingCapital: 1000, maxDrawdownPct: 0.1,
      sensitivityClassification: "STABLE_PLATEAU", tradeCount: 100, profitFactorConsistency: 0.8,
    });
    const csv = buildRobustnessCsv(r, prov);
    expect(csv).toContain("factor,weight,value,score,formula");
    expect(csv).toContain("walkForwardStability");
    expect(csv).toContain("monteCarloP5");
  });
});
