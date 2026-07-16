import { describe, it, expect } from "vitest";
import {
  RECOMMENDATION_VALIDATOR_VERSION,
  computeValidatorRunId,
  exportValidationCsv,
  exportValidationJson,
  validateRecommendations,
  type RecommendationObservation,
} from "./recommendation-validator";

function obs(over: Partial<RecommendationObservation> = {}): RecommendationObservation {
  return {
    recommendationRunId: "REC_V1:aaaa",
    instrument: "NIFTY50",
    timeframe: "5m",
    regime: "TRENDING_UP",
    window: null,
    recommendedStrategy: "SMC_V1",
    status: "RECOMMENDATION",
    confidence: 0.75,
    outcome: "WIN",
    ...over,
  };
}

describe("Phase 21.8 · Stage 2 — recommendation validator", () => {
  it("computes accuracy, precision, recall, F1 for a classic 2×2 case", () => {
    // 3 positive+WIN, 2 positive+LOSS, 1 negative+WIN, 4 negative+LOSS
    const observations: RecommendationObservation[] = [
      ...Array.from({ length: 3 }, () => obs({ status: "RECOMMENDATION", outcome: "WIN", confidence: 0.8 })),
      ...Array.from({ length: 2 }, () => obs({ status: "RECOMMENDATION", outcome: "LOSS", confidence: 0.6 })),
      ...Array.from({ length: 1 }, () => obs({ status: "AVOID", outcome: "WIN", confidence: 0.4 })),
      ...Array.from({ length: 4 }, () => obs({ status: "AVOID", outcome: "LOSS", confidence: 0.3 })),
    ];
    const r = validateRecommendations({ observations });
    expect(r.confusion.tp).toBe(3);
    expect(r.confusion.fp).toBe(2);
    expect(r.confusion.fn).toBe(1);
    expect(r.confusion.tn).toBe(4);
    // precision = 3/5, recall = 3/4, f1 = 2·(0.6·0.75)/(1.35) = 0.6667
    expect(r.precision).toBeCloseTo(0.6, 4);
    expect(r.recall).toBeCloseTo(0.75, 4);
    expect(r.f1).toBeCloseTo(0.6667, 3);
    // overall accuracy = wins / decided = 4/10
    expect(r.accuracy).toBeCloseTo(0.4, 4);
  });

  it("Brier score equals mean squared error over positive decided observations", () => {
    const observations: RecommendationObservation[] = [
      obs({ confidence: 1.0, outcome: "WIN" }), // (1-1)^2 = 0
      obs({ confidence: 0.0, outcome: "LOSS" }), // (0-0)^2 = 0
      obs({ confidence: 0.5, outcome: "WIN" }), // 0.25
      obs({ confidence: 0.5, outcome: "LOSS" }), // 0.25
    ];
    const r = validateRecommendations({ observations });
    expect(r.brierScore).toBeCloseTo(0.125, 4);
  });

  it("populates the 5 named calibration buckets and computes ECE", () => {
    const observations: RecommendationObservation[] = [
      obs({ confidence: 0.55, outcome: "WIN" }),
      obs({ confidence: 0.55, outcome: "LOSS" }),
      obs({ confidence: 0.65, outcome: "WIN" }),
      obs({ confidence: 0.75, outcome: "WIN" }),
      obs({ confidence: 0.85, outcome: "WIN" }),
      obs({ confidence: 0.95, outcome: "WIN" }),
    ];
    const r = validateRecommendations({ observations });
    const keys = r.buckets.map((b) => b.key);
    expect(keys).toEqual(["50-60", "60-70", "70-80", "80-90", "90-100"]);
    const b5060 = r.buckets[0];
    expect(b5060.count).toBe(2);
    expect(b5060.wins).toBe(1);
    expect(b5060.actualAccuracy).toBeCloseTo(0.5, 4);
    expect(r.expectedCalibrationError).toBeGreaterThanOrEqual(0);
  });

  it("high vs low confidence accuracy split at 0.75", () => {
    const observations: RecommendationObservation[] = [
      obs({ confidence: 0.9, outcome: "WIN" }),
      obs({ confidence: 0.9, outcome: "WIN" }),
      obs({ confidence: 0.9, outcome: "LOSS" }),
      obs({ confidence: 0.6, outcome: "LOSS" }),
      obs({ confidence: 0.6, outcome: "LOSS" }),
    ];
    const r = validateRecommendations({ observations });
    expect(r.highConfidenceAccuracy).toBeCloseTo(2 / 3, 3);
    expect(r.lowConfidenceAccuracy).toBeCloseTo(0, 4);
  });

  it("drift analysis flags SIGNIFICANT deviation across regimes", () => {
    const observations: RecommendationObservation[] = [
      ...Array.from({ length: 5 }, () => obs({ regime: "TRENDING_UP", outcome: "WIN" })),
      ...Array.from({ length: 5 }, () => obs({ regime: "RANGE", outcome: "LOSS" })),
    ];
    const r = validateRecommendations({ observations });
    const trend = r.drift.byRegime.find((d) => d.key === "TRENDING_UP")!;
    const range = r.drift.byRegime.find((d) => d.key === "RANGE")!;
    expect(trend.accuracy).toBe(1);
    expect(range.accuracy).toBe(0);
    expect(trend.drift).toBe("SIGNIFICANT");
    expect(range.drift).toBe("SIGNIFICANT");
  });

  it("computeValidatorRunId is deterministic and prefixed", () => {
    const observations = [obs(), obs({ confidence: 0.9, outcome: "LOSS" })];
    const a = computeValidatorRunId({ observations });
    const b = computeValidatorRunId({ observations });
    expect(a).toBe(b);
    expect(a.startsWith(`${RECOMMENDATION_VALIDATOR_VERSION}:`)).toBe(true);
    const c = computeValidatorRunId({ observations: [obs()] });
    expect(c).not.toBe(a);
  });

  it("reliability rating uses transparent thresholds", () => {
    const strong: RecommendationObservation[] = Array.from({ length: 20 }, (_, i) =>
      obs({ confidence: 0.85, outcome: i < 15 ? "WIN" : "LOSS" }),
    );
    const r = validateRecommendations({ observations: strong });
    expect(["EXCELLENT", "GOOD", "FAIR"]).toContain(r.reliability);

    const weak: RecommendationObservation[] = Array.from({ length: 20 }, (_, i) =>
      obs({ confidence: 0.9, outcome: i < 2 ? "WIN" : "LOSS" }),
    );
    const r2 = validateRecommendations({ observations: weak });
    expect(["POOR", "UNRELIABLE"]).toContain(r2.reliability);
  });

  it("CSV and JSON exports include the disclaimer and Run ID", () => {
    const observations = [obs(), obs({ outcome: "LOSS", confidence: 0.6 })];
    const r = validateRecommendations({ observations });
    const csv = exportValidationCsv(r);
    expect(csv).toContain("RESEARCH VALIDATION");
    expect(csv).toContain(r.runId);
    expect(csv).toContain("# Confusion Matrix");
    expect(csv).toContain("# Calibration Buckets");
    const json = JSON.parse(exportValidationJson(r));
    expect(json.runId).toBe(r.runId);
    expect(json.disclaimer).toContain("RESEARCH VALIDATION");
    expect(json.buckets.length).toBe(5);
  });

  it("empty input returns a safe zeroed report", () => {
    const r = validateRecommendations({ observations: [] });
    expect(r.totals.observations).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.reliability).toBe("UNRELIABLE");
    expect(r.buckets.length).toBe(5);
  });
});