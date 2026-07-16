import { describe, it, expect } from "vitest";
import { buildRegimeRecommendation, type StrategyEvidence } from "./regime-recommendation";
import {
  exportRecommendationCsv,
  exportRecommendationJson,
  exportRegimeRankingCsv,
  exportInstrumentTimeframeMatrixCsv,
  exportRejectedStrategiesCsv,
  RECOMMENDATION_EXPORT_DISCLAIMER,
} from "./regime-recommendation-exports";

function ev(over: Partial<StrategyEvidence> = {}): StrategyEvidence {
  return {
    strategy: "SMC_V1",
    formula: "SMC_V1",
    formulaVersion: "SMC_V1",
    runId: "R1",
    dataHash: "h",
    tradeCount: 150,
    coverage: 0.9,
    regimeSampleSize: 60,
    oosExpectancy: 1.5,
    oosConsistency: 0.8,
    profitFactorConsistency: 0.8,
    expectancyConsistency: 0.8,
    crossAssetConsistency: 0.75,
    walkForwardWindows: 4,
    monteCarloAvailable: true,
    monteCarloP5FinalEquity: 950,
    monteCarloMedianFinalEquity: 1200,
    startingCapital: 1000,
    maxDrawdownPct: 0.12,
    sensitivityAvailable: true,
    sensitivityClassification: "STABLE_PLATEAU",
    robustnessStatus: "ROBUST",
    robustnessScore: 0.82,
    dataQuality: "GOOD",
    causalityOk: true,
    ...over,
  };
}

describe("Phase 21.8 Stage 1 · recommendation exports", () => {
  const rec = buildRegimeRecommendation({
    regime: "TRENDING_UP",
    instrument: "NIFTY50",
    timeframe: "5m",
    strategies: [ev(), ev({ strategy: "ASTRO", runId: "R2", oosExpectancy: -1 })],
  });

  it("CSV export contains disclaimer and Run ID header", () => {
    const csv = exportRecommendationCsv(rec);
    expect(csv).toContain(RECOMMENDATION_EXPORT_DISCLAIMER);
    expect(csv).toContain(rec.runId);
    expect(csv).toContain("SMC_V1");
  });

  it("JSON export is valid and preserves provenance", () => {
    const j = JSON.parse(exportRecommendationJson(rec));
    expect(j.runId).toBe(rec.runId);
    expect(j.disclaimer).toBe(RECOMMENDATION_EXPORT_DISCLAIMER);
    expect(j.rankings.length).toBeGreaterThanOrEqual(1);
  });

  it("regime ranking CSV covers all recommendations", () => {
    const csv = exportRegimeRankingCsv([rec]);
    expect(csv).toContain("NIFTY50");
    expect(csv).toContain("TRENDING_UP");
  });

  it("instrument/timeframe matrix CSV includes headers", () => {
    const csv = exportInstrumentTimeframeMatrixCsv([rec]);
    expect(csv.split("\n")[1]).toContain("instrument");
  });

  it("rejected strategies CSV lists blocked candidates", () => {
    const csv = exportRejectedStrategiesCsv(rec);
    expect(csv).toContain("ASTRO");
  });
});
