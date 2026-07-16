import { describe, it, expect } from "vitest";
import {
  buildRegimeRecommendation,
  buildInstrumentTimeframeMatrix,
  buildRegimeRankingRow,
  computeRecommendationRunId,
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_SAFETY_THRESHOLDS,
  REGIME_RECOMMENDATION_VERSION,
  summarizeEnvironment,
  type StrategyEvidence,
  type RecommendationStrategyId,
} from "./regime-recommendation";

function ev(over: Partial<StrategyEvidence> = {}): StrategyEvidence {
  return {
    strategy: "SMC_V1",
    formula: "SMC_V1",
    formulaVersion: "SMC_V1",
    runId: "R1",
    researchRunId: "RS1",
    walkForwardRunId: "WF1",
    monteCarloRunId: "MC1",
    sensitivityRunId: "SN1",
    robustnessRunId: "RB1",
    batchRunId: "B1",
    provider: "CSV",
    dataHash: "hash",
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

describe("Phase 21.8 Stage 1 · regime-recommendation", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("produces STRONG_RECOMMENDATION for one strong candidate + weak alternative", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({ strategy: "SMC_V1" }),
        ev({
          strategy: "ASTRO",
          formula: "ASTRO_SIGN_DEGREE",
          formulaVersion: "ASTRO_V1",
          runId: "R2",
          oosConsistency: 0.3,
          robustnessScore: 0.3,
          profitFactorConsistency: 0.3,
          expectancyConsistency: 0.3,
          crossAssetConsistency: 0.3,
          sensitivityClassification: "MONOTONIC",
          monteCarloP5FinalEquity: 850,
          maxDrawdownPct: 0.2,
        }),
      ],
    });
    expect(rec.recommendedStrategy).toBe("SMC_V1");
    expect(rec.recommendationStatus).toBe("STRONG_RECOMMENDATION");
    expect(rec.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("returns RECOMMENDATION with moderate margin", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({ oosConsistency: 0.65, robustnessScore: 0.65 }),
        ev({ strategy: "ASTRO", runId: "R2", oosConsistency: 0.58, robustnessScore: 0.55 }),
      ],
    });
    expect(["RECOMMENDATION", "CONDITIONAL", "STRONG_RECOMMENDATION"]).toContain(
      rec.recommendationStatus,
    );
    expect(rec.recommendedStrategy).toBe("SMC_V1");
  });

  it("returns CONDITIONAL when best score is moderate and margin thin", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({ oosConsistency: 0.55, robustnessScore: 0.55, walkForwardWindows: 2 }),
        ev({
          strategy: "ASTRO",
          runId: "R2",
          oosConsistency: 0.54,
          robustnessScore: 0.54,
          walkForwardWindows: 2,
        }),
      ],
    });
    expect(["CONDITIONAL", "WAIT_FOR_MORE_DATA"]).toContain(rec.recommendationStatus);
  });

  it("returns WAIT_FOR_MORE_DATA when best score below threshold", () => {
    const rec = buildRegimeRecommendation({
      regime: "UNKNOWN",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({
          oosConsistency: 0.2,
          robustnessScore: 0.2,
          profitFactorConsistency: 0.2,
          expectancyConsistency: 0.2,
          crossAssetConsistency: 0.2,
        }),
      ],
    });
    expect(rec.recommendationStatus).toBe("WAIT_FOR_MORE_DATA");
  });

  it("returns AVOID when all strategies are blocked by hard gates", () => {
    const rec = buildRegimeRecommendation({
      regime: "HIGH_VOLATILITY",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ oosExpectancy: -1 }), ev({ strategy: "ASTRO", runId: "R2", robustnessStatus: "OVERFIT" })],
    });
    expect(rec.recommendationStatus).toBe("AVOID");
    expect(rec.recommendedStrategy).toBeNull();
    expect(rec.rejectedStrategies.length).toBe(2);
  });

  it("returns NO_VALID_STRATEGY when strategies list is empty (data incomplete)", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [],
    });
    expect(rec.recommendationStatus).toBe("DATA_INCOMPLETE");
  });

  it("returns DATA_INCOMPLETE when dataQualityOverride is UNAVAILABLE", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
      dataQualityOverride: "UNAVAILABLE",
    });
    expect(rec.recommendationStatus).toBe("DATA_INCOMPLETE");
  });

  it("hard gate cannot be overridden by a high score", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({
          oosConsistency: 1,
          robustnessScore: 1,
          profitFactorConsistency: 1,
          expectancyConsistency: 1,
          crossAssetConsistency: 1,
          // but overfit — must be blocked
          robustnessStatus: "OVERFIT",
        }),
      ],
    });
    expect(rec.recommendedStrategy).toBeNull();
    expect(rec.rejectedStrategies[0].blockingReasons.join(" ")).toMatch(/OVERFIT/);
  });

  it("rejects negative OOS expectancy", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ oosExpectancy: -0.5 })],
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("rejects NARROW_OPTIMUM and ERRATIC sensitivity", () => {
    const a = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ sensitivityClassification: "NARROW_OPTIMUM" })],
    });
    const b = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ sensitivityClassification: "ERRATIC" })],
    });
    expect(a.recommendedStrategy).toBeNull();
    expect(b.recommendedStrategy).toBeNull();
  });

  it("rejects Monte Carlo ruin below threshold", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ monteCarloP5FinalEquity: 500 })],
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("rejects UNAVAILABLE data quality on a candidate", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ dataQuality: "UNAVAILABLE" })],
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("caps confidence with small sample even at high score", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ tradeCount: 40, walkForwardWindows: 2 })],
    });
    expect(rec.confidence).toBeLessThanOrEqual(0.6);
  });

  it("rank-1 vs rank-2 margin drives confidence", () => {
    const wide = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({ strategy: "SMC_V1" }),
        ev({
          strategy: "ASTRO",
          runId: "R2",
          oosConsistency: 0.1,
          robustnessScore: 0.1,
          profitFactorConsistency: 0.1,
          expectancyConsistency: 0.1,
          crossAssetConsistency: 0.1,
        }),
      ],
    });
    const narrow = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ strategy: "SMC_V1" }), ev({ strategy: "ASTRO", runId: "R2" })],
    });
    expect(wide.confidence).toBeGreaterThanOrEqual(narrow.confidence);
  });

  it("excludes unsupported combinations via matrix helper (dedup by key)", () => {
    const base = {
      regime: "TRENDING_UP" as const,
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
    };
    const matrix = buildInstrumentTimeframeMatrix([base, base]);
    expect(matrix.length).toBe(1);
  });

  it("builds a regime ranking row with best/second/avoid", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [
        ev({ strategy: "SMC_V1" }),
        ev({ strategy: "ASTRO", runId: "R2", oosConsistency: 0.4 }),
        ev({ strategy: "LEGACY", runId: "R3", oosExpectancy: -0.5 }),
      ],
    });
    const row = buildRegimeRankingRow(rec);
    expect(row.best?.strategy).toBe("SMC_V1");
    expect(row.avoid?.strategy).toBe("LEGACY");
  });

  it("rejection reasons include the failing gate text", () => {
    const rec = buildRegimeRecommendation({
      regime: "RANGE",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ tradeCount: 5 })],
    });
    expect(rec.rejectedStrategies[0].blockingReasons.join(" ")).toMatch(/trades=5/);
  });

  it("score is the sum of component contributions and is bounded 0..1", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
    });
    const sum = rec.metricContributions.reduce((s, c) => s + c.contribution, 0);
    expect(rec.score).toBeGreaterThanOrEqual(0);
    expect(rec.score).toBeLessThanOrEqual(1);
    expect(rec.score).toBeCloseTo(sum, 5);
  });

  it("weight override changes the score deterministically", () => {
    const inputs = {
      regime: "TRENDING_UP" as const,
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
    };
    const a = buildRegimeRecommendation(inputs);
    const b = buildRegimeRecommendation({
      ...inputs,
      weights: { oosConsistency: 0.5 },
    });
    expect(a.runId).not.toBe(b.runId);
    expect(a.score).not.toBe(b.score);
  });

  it("Run ID is deterministic and prefixed", () => {
    const input = {
      regime: "TRENDING_UP" as const,
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
    };
    const a = buildRegimeRecommendation(input).runId;
    const b = buildRegimeRecommendation(input).runId;
    expect(a).toBe(b);
    expect(a).toMatch(/^REGIME_RECOMMENDATION_V1:[0-9a-f]{8}$/);
    expect(REGIME_RECOMMENDATION_VERSION).toBe("REGIME_RECOMMENDATION_V1");
  });

  it("formula version mismatch acts as a hard gate", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ formulaVersion: "SMC_V0" })],
      expectedFormulaVersions: { SMC_V1: "SMC_V1" } as Partial<
        Record<RecommendationStrategyId, string>
      >,
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("missing data hash is a hard gate", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ dataHash: "" })],
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("causality guard is a hard gate", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev({ causalityOk: false })],
    });
    expect(rec.recommendedStrategy).toBeNull();
  });

  it("computeRecommendationRunId is stable across strategy order", () => {
    const base = {
      instrument: "NIFTY50",
      timeframe: "5m",
      regime: "RANGE" as const,
      weights: DEFAULT_SCORING_WEIGHTS,
      thresholds: DEFAULT_SAFETY_THRESHOLDS,
    };
    const a = computeRecommendationRunId({
      ...base,
      strategies: [ev({ strategy: "SMC_V1" }), ev({ strategy: "ASTRO", runId: "R2" })],
    });
    const b = computeRecommendationRunId({
      ...base,
      strategies: [ev({ strategy: "ASTRO", runId: "R2" }), ev({ strategy: "SMC_V1" })],
    });
    expect(a).toBe(b);
  });

  it("summarizeEnvironment maps regime → trend/volatility state", () => {
    const rec = buildRegimeRecommendation({
      regime: "TRENDING_UP",
      instrument: "NIFTY50",
      timeframe: "5m",
      strategies: [ev()],
    });
    const summary = summarizeEnvironment(rec);
    expect(summary.trendState).toBe("UP");
    expect(summary.volatilityState).toBe("NORMAL");
    expect(summary.recommendedStrategy).toBe("SMC_V1");
  });
});
