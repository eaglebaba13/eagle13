import { describe, it, expect } from "vitest";
import {
  classifySampleStatus,
  computeGannGapAnalytics,
  toActualClass,
  toPredictedClass,
} from "./analytics";
import type { FrozenPredictionRecord, OutcomeRecord } from "./historical";

function fp(id: string, label: FrozenPredictionRecord["label"], frozenAt = "2024-01-01T10:00:00Z"): FrozenPredictionRecord {
  return {
    predictionId: id, tradingDate: "2024-01-01", nextTradingDate: "2024-01-02",
    label, reference: 100, formulaVersion: "v", frozenAt,
  };
}
function oc(id: string, outcome: OutcomeRecord["outcome"], evaluatedAt = "2024-01-02T04:00:00Z"): OutcomeRecord {
  return { predictionId: id, outcome, ruleVersion: "v", evaluatedAt };
}

describe("gann-gap analytics", () => {
  it("classifies sample status by evaluated count", () => {
    expect(classifySampleStatus(0)).toBe("INSUFFICIENT_SAMPLE");
    expect(classifySampleStatus(29)).toBe("INSUFFICIENT_SAMPLE");
    expect(classifySampleStatus(30)).toBe("PRELIMINARY");
    expect(classifySampleStatus(99)).toBe("PRELIMINARY");
    expect(classifySampleStatus(100)).toBe("RESEARCH_VALIDATED");
    expect(classifySampleStatus(500)).toBe("RESEARCH_VALIDATED");
  });

  it("maps labels and outcomes to canonical classes", () => {
    expect(toPredictedClass("GAP_UP_RESEARCH")).toBe("GAP_UP");
    expect(toPredictedClass("GAP_DOWN_RESEARCH")).toBe("GAP_DOWN");
    expect(toPredictedClass("INDECISION")).toBe("FLAT");
    expect(toPredictedClass("NO_VALID_SETUP")).toBe("FLAT");
    expect(toPredictedClass("PENDING")).toBeNull();
    expect(toActualClass("ACTUAL_GAP_UP")).toBe("GAP_UP");
    expect(toActualClass("OUTCOME_UNAVAILABLE")).toBeNull();
  });

  it("computes confusion matrix, precision, and pending/leakage counts", () => {
    const preds = [
      fp("a", "GAP_UP_RESEARCH"),
      fp("b", "GAP_UP_RESEARCH"),
      fp("c", "GAP_DOWN_RESEARCH"),
      fp("d", "INDECISION"),
      fp("e", "GAP_UP_RESEARCH"),   // pending — no outcome
      fp("f", "GAP_DOWN_RESEARCH", "2024-01-02T05:00:00Z"), // leakage below
    ];
    const outs = [
      oc("a", "ACTUAL_GAP_UP"),
      oc("b", "ACTUAL_GAP_DOWN"),
      oc("c", "ACTUAL_GAP_DOWN"),
      oc("d", "ACTUAL_FLAT"),
      // outcome evaluated BEFORE freeze -> leakage
      oc("f", "ACTUAL_GAP_DOWN", "2024-01-02T04:00:00Z"),
    ];
    const a = computeGannGapAnalytics(preds, outs);
    expect(a.total).toBe(6);
    expect(a.evaluated).toBe(4);
    expect(a.leakageDetected).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.correct).toBe(3);
    expect(a.incorrect).toBe(1);
    expect(a.accuracyPct).toBeCloseTo(75, 5);
    expect(a.matrix.counts.GAP_UP.GAP_UP).toBe(1);
    expect(a.matrix.counts.GAP_UP.GAP_DOWN).toBe(1);
    expect(a.matrix.counts.GAP_DOWN.GAP_DOWN).toBe(1);
    expect(a.matrix.counts.FLAT.FLAT).toBe(1);
    expect(a.gapUpPrecisionPct).toBeCloseTo(50, 5);
    expect(a.gapDownPrecisionPct).toBeCloseTo(100, 5);
    expect(a.flatPrecisionPct).toBeCloseTo(100, 5);
    expect(a.sampleStatus).toBe("INSUFFICIENT_SAMPLE");
  });

  it("returns null accuracy when no evaluated pairs", () => {
    const a = computeGannGapAnalytics([], []);
    expect(a.accuracyPct).toBeNull();
    expect(a.gapUpPrecisionPct).toBeNull();
    expect(a.sampleStatus).toBe("INSUFFICIENT_SAMPLE");
  });
});
