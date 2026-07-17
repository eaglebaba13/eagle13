// Phase 2J — Report-generation tests. No formula modifications.

import { describe, it, expect } from "vitest";
import {
  buildGannGapResearchReport,
  classifyVixRegime,
  type ResearchRecordMeta,
} from "./research-report";
import type { FrozenPredictionRecord, OutcomeRecord } from "./historical";

function fp(id: string, label: FrozenPredictionRecord["label"]): FrozenPredictionRecord {
  return {
    predictionId: id,
    tradingDate: "2026-07-14",
    nextTradingDate: "2026-07-15",
    label,
    reference: 25000,
    formulaVersion: "gann-gap-v1",
    frozenAt: "2026-07-14T09:56:00Z",
  };
}
function oc(id: string, outcome: OutcomeRecord["outcome"]): OutcomeRecord {
  return {
    predictionId: id,
    outcome,
    ruleVersion: "outcome-v1",
    evaluatedAt: "2026-07-15T03:46:00Z",
  };
}

describe("classifyVixRegime", () => {
  it("bands vix into LOW/MID/HIGH/UNKNOWN", () => {
    expect(classifyVixRegime(12)).toBe("LOW");
    expect(classifyVixRegime(17)).toBe("MID");
    expect(classifyVixRegime(25)).toBe("HIGH");
    expect(classifyVixRegime(null)).toBe("UNKNOWN");
  });
});

describe("buildGannGapResearchReport", () => {
  it("returns a limitations note and no recommendations on empty input", () => {
    const r = buildGannGapResearchReport({ predictions: [], outcomes: [] });
    expect(r.summary.evaluated).toBe(0);
    expect(r.sampleStatus).toBe("INSUFFICIENT_SAMPLE");
    expect(r.limitations.length).toBeGreaterThan(0);
    expect(r.remainingBlockers.length).toBeGreaterThan(0);
    expect(r.recommendations).toEqual([]);
  });

  it("slices by confidence, vix regime, and confirmations", () => {
    const preds: FrozenPredictionRecord[] = [];
    const outs: OutcomeRecord[] = [];
    const meta: ResearchRecordMeta[] = [];
    for (let i = 0; i < 12; i++) {
      preds.push(fp(`p${i}`, "GAP_UP_RESEARCH"));
      outs.push(oc(`p${i}`, "ACTUAL_GAP_UP"));
      meta.push({
        predictionId: `p${i}`,
        confidence: "EXPERIMENTAL_HIGH",
        vix: 12,
        confirmations: { decision: "SUPPORTS_UP", pcr: "SUPPORTS_UP" },
      });
    }
    for (let i = 0; i < 12; i++) {
      preds.push(fp(`q${i}`, "GAP_UP_RESEARCH"));
      outs.push(oc(`q${i}`, "ACTUAL_GAP_DOWN"));
      meta.push({
        predictionId: `q${i}`,
        confidence: "EXPERIMENTAL_LOW",
        vix: 25,
        confirmations: { decision: "CONFLICT", pcr: "CONFLICT" },
      });
    }
    const r = buildGannGapResearchReport({ predictions: preds, outcomes: outs, meta });
    expect(r.summary.evaluated).toBe(24);
    expect(r.byConfidence.EXPERIMENTAL_HIGH.n).toBe(12);
    expect(r.byConfidence.EXPERIMENTAL_HIGH.accuracyPct).toBe(100);
    expect(r.byConfidence.EXPERIMENTAL_LOW.accuracyPct).toBe(0);
    expect(r.byVixRegime.LOW.n).toBe(12);
    expect(r.byVixRegime.HIGH.n).toBe(12);
    expect(r.byConfirmation.decision.ALIGNED.n).toBe(12);
    expect(r.byConfirmation.decision.CONFLICT.n).toBe(12);
    expect(r.strongSignals.some((s) => /HIGH-confidence/i.test(s))).toBe(true);
    expect(r.recommendations.some((x) => x.action === "KEEP" || x.action === "TUNE")).toBe(true);
  });

  it("flags leakage without crashing", () => {
    const p = fp("x", "GAP_UP_RESEARCH");
    const o: OutcomeRecord = { ...oc("x", "ACTUAL_GAP_UP"), evaluatedAt: p.frozenAt };
    const r = buildGannGapResearchReport({ predictions: [p], outcomes: [o] });
    expect(r.summary.leakageDetected).toBe(1);
    expect(r.remainingBlockers.some((b) => /leakage/i.test(b))).toBe(true);
  });

  it("aggregates by formula/config/outcome version", () => {
    const preds = [fp("a", "GAP_UP_RESEARCH"), fp("b", "GAP_DOWN_RESEARCH")];
    const outs = [oc("a", "ACTUAL_GAP_UP"), oc("b", "ACTUAL_FLAT")];
    const meta: ResearchRecordMeta[] = [
      { predictionId: "a", formulaVersion: "v1", configVersion: "c1", outcomeVersion: "o1" },
      { predictionId: "b", formulaVersion: "v2", configVersion: "c1", outcomeVersion: "o1" },
    ];
    const r = buildGannGapResearchReport({ predictions: preds, outcomes: outs, meta });
    expect(r.byFormulaVersion.map((x) => x.version).sort()).toEqual(["v1", "v2"]);
    expect(r.byConfigVersion).toHaveLength(1);
    expect(r.byOutcomeVersion).toHaveLength(1);
  });
});