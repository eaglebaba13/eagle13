import { describe, it, expect } from "vitest";
import { evaluateHistoricalAccuracy } from "./historical";

const base = { formulaVersion: "v1", reference: 100 };

describe("evaluateHistoricalAccuracy", () => {
  it("computes win-rate and counts", () => {
    const preds = [
      { predictionId: "p1", tradingDate: "2025-01-01", nextTradingDate: "2025-01-02", label: "GAP_UP_RESEARCH" as const, frozenAt: "2025-01-01T09:56:00Z", ...base },
      { predictionId: "p2", tradingDate: "2025-01-02", nextTradingDate: "2025-01-03", label: "GAP_DOWN_RESEARCH" as const, frozenAt: "2025-01-02T09:56:00Z", ...base },
      { predictionId: "p3", tradingDate: "2025-01-03", nextTradingDate: "2025-01-06", label: "INDECISION" as const, frozenAt: "2025-01-03T09:56:00Z", ...base },
    ];
    const outs = [
      { predictionId: "p1", outcome: "ACTUAL_GAP_UP" as const, ruleVersion: "v1", evaluatedAt: "2025-01-02T04:00:00Z" },
      { predictionId: "p2", outcome: "ACTUAL_GAP_UP" as const, ruleVersion: "v1", evaluatedAt: "2025-01-03T04:00:00Z" },
      { predictionId: "p3", outcome: "ACTUAL_FLAT" as const, ruleVersion: "v1", evaluatedAt: "2025-01-06T04:00:00Z" },
    ];
    const m = evaluateHistoricalAccuracy(preds, outs, { minSampleSize: 2 });
    expect(m.evaluated).toBe(3);
    expect(m.correct).toBe(2);
    expect(m.incorrect).toBe(1);
    expect(m.winRatePct).toBeCloseTo((2 / 3) * 100);
    expect(m.meetsMinSample).toBe(true);
  });
  it("rejects leakage when outcome ≤ frozenAt", () => {
    const preds = [{ predictionId: "p1", tradingDate: "2025-01-01", nextTradingDate: "2025-01-02", label: "GAP_UP_RESEARCH" as const, frozenAt: "2025-01-01T09:56:00Z", ...base }];
    const outs = [{ predictionId: "p1", outcome: "ACTUAL_GAP_UP" as const, ruleVersion: "v1", evaluatedAt: "2025-01-01T09:56:00Z" }];
    const m = evaluateHistoricalAccuracy(preds, outs);
    expect(m.leakageDetected).toBe(1);
    expect(m.evaluated).toBe(0);
  });
  it("returns null win-rate on empty samples", () => {
    const m = evaluateHistoricalAccuracy([], []);
    expect(m.winRatePct).toBeNull();
    expect(m.meetsMinSample).toBe(false);
  });
});