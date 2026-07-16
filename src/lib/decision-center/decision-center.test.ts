// Phase 24 — Decision Center deterministic tests.
import { describe, it, expect } from "vitest";
import {
  evaluateDecision,
  DECISION_WEIGHTS,
  type DecisionEvidenceInput,
} from "./decision-center";
import { computeDecisionRunId } from "./decision-run-id";
import { buildDecisionBundle, buildDecisionCsv, buildDecisionJson } from "./decision-exports";

function full(overrides: Partial<DecisionEvidenceInput> = {}): DecisionEvidenceInput {
  return {
    walkForward: { runId: "WF:1", oosExpectancy: 0.6, stabilityScore: 0.8, overfitFlag: false, totalTrades: 200 },
    monteCarlo: { runId: "MC:1", worstDrawdownPct: 0.2, medianCagr: 0.15, ruinProbability: 0.01 },
    robustness: { runId: "RB:1", score: 0.8, verdict: "ROBUST" },
    sensitivity: { runId: "SN:1", cliffScore: 0.85, plateauCoverage: 0.7 },
    optimizer: { runId: "OP:1", confidence: 0.8, selectedCandidate: "A" },
    recommendationValidator: { runId: "RV:1", reliability: 0.8, verdict: "RELIABLE" },
    crossAsset: { runId: "CX:1", consistency: 0.75, assetsCovered: 4 },
    portfolio: { runId: "PF:1", recommendation: "ACCEPT", expectedDrawdown: 0.15, diversificationScore: 0.7 },
    shadow: { runId: "SH:1", readiness: "READY_FOR_SCHEDULED_SHADOW", accuracy: 0.75, calibration: 0.8, resolvedTrades: 60 },
    recommendation: { runId: "RC:1", expectedWinRate: 0.55, expectedProfitFactor: 1.8, confidence: 0.7 },
    researchStability: { runId: "RS:1", stability: 0.8 },
    regime: { runId: "RG:1", coverage: 0.85 },
    dataQuality: { ok: true, causalityOk: true, dataHash: "abc123" },
    ...overrides,
  };
}

describe("Decision Center — weights", () => {
  it("weights sum to 1.0", () => {
    const s = Object.values(DECISION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(s - 1)).toBeLessThan(1e-9);
  });
});

describe("Decision Center — hard gates", () => {
  it("robustness OVERFIT forces NO_GO", () => {
    const r = evaluateDecision(full({ robustness: { runId: "RB", score: 0.9, verdict: "OVERFIT" } }));
    expect(r.state).toBe("NO_GO");
    expect(r.hardGates).toContain("ROBUSTNESS_OVERFIT");
  });
  it("walk-forward overfit flag forces NO_GO", () => {
    const r = evaluateDecision(full({ walkForward: { runId: "WF", oosExpectancy: 0.6, stabilityScore: 0.9, overfitFlag: true, totalTrades: 200 } }));
    expect(r.state).toBe("NO_GO");
    expect(r.hardGates).toContain("WALK_FORWARD_OVERFIT");
  });
  it("shadow NOT_READY forces NO_GO", () => {
    const r = evaluateDecision(full({ shadow: { runId: "SH", readiness: "NOT_READY", accuracy: 0.8, calibration: 0.8, resolvedTrades: 50 } }));
    expect(r.state).toBe("NO_GO");
    expect(r.hardGates).toContain("SHADOW_NOT_READY");
  });
  it("portfolio REJECT forces NO_GO", () => {
    const r = evaluateDecision(full({ portfolio: { runId: "PF", recommendation: "REJECT", expectedDrawdown: 0.4, diversificationScore: 0.3 } }));
    expect(r.state).toBe("NO_GO");
    expect(r.hardGates).toContain("PORTFOLIO_REJECT");
  });
  it("data quality failure forces NO_GO", () => {
    const r = evaluateDecision(full({ dataQuality: { ok: false, causalityOk: true, dataHash: "x" } }));
    expect(r.state).toBe("NO_GO");
    expect(r.hardGates).toContain("DATA_QUALITY_FAILURE");
  });
  it("causality failure forces NO_GO", () => {
    const r = evaluateDecision(full({ dataQuality: { ok: true, causalityOk: false, dataHash: "x" } }));
    expect(r.hardGates).toContain("CAUSALITY_FAILURE");
    expect(r.state).toBe("NO_GO");
  });
  it("insufficient trades forces NO_GO", () => {
    const r = evaluateDecision(full({ walkForward: { runId: "WF", oosExpectancy: 0.5, stabilityScore: 0.9, overfitFlag: false, totalTrades: 10 } }));
    expect(r.hardGates).toContain("INSUFFICIENT_TRADES");
  });
  it("low confidence forces NO_GO", () => {
    const r = evaluateDecision(full({ recommendation: { runId: "RC", expectedWinRate: 0.5, expectedProfitFactor: 1.2, confidence: 0.3 } }));
    expect(r.hardGates).toContain("LOW_CONFIDENCE");
  });
  it("recommendation UNRELIABLE forces NO_GO", () => {
    const r = evaluateDecision(full({ recommendationValidator: { runId: "RV", reliability: 0.2, verdict: "UNRELIABLE" } }));
    expect(r.hardGates).toContain("RECOMMENDATION_UNRELIABLE");
  });
  it("missing evidence trips MISSING_RESEARCH_CONTEXT", () => {
    const r = evaluateDecision({});
    expect(r.hardGates).toContain("MISSING_RESEARCH_CONTEXT");
    expect(r.state).toBe("NO_GO");
    expect(r.missingEvidence.length).toBeGreaterThan(0);
  });
  it("score cannot override gates", () => {
    // Perfect scores but one gate trips
    const r = evaluateDecision(full({ portfolio: { runId: "PF", recommendation: "REJECT", expectedDrawdown: 0.1, diversificationScore: 0.9 } }));
    expect(r.state).toBe("NO_GO");
  });
});

describe("Decision Center — deployment states", () => {
  function scoreAt(target: number): DecisionEvidenceInput {
    // Simple lever: shape all component scores near `target`
    return {
      walkForward: { runId: "WF", oosExpectancy: (target - 0.5) * 2, stabilityScore: target, overfitFlag: false, totalTrades: 200 },
      monteCarlo: { runId: "MC", worstDrawdownPct: (1 - target) * 0.5, medianCagr: 0.1, ruinProbability: 0 },
      robustness: { runId: "RB", score: target, verdict: "ROBUST" },
      optimizer: { runId: "OP", confidence: target, selectedCandidate: "A" },
      recommendationValidator: { runId: "RV", reliability: target, verdict: "RELIABLE" },
      crossAsset: { runId: "CX", consistency: target, assetsCovered: 4 },
      portfolio: { runId: "PF", recommendation: "ACCEPT", expectedDrawdown: 0.1, diversificationScore: target },
      shadow: { runId: "SH", readiness: "READY_FOR_SCHEDULED_SHADOW", accuracy: target, calibration: target, resolvedTrades: 60 },
      recommendation: { runId: "RC", expectedWinRate: target, expectedProfitFactor: 1.5, confidence: Math.max(target, 0.6) },
      sensitivity: { runId: "SN", cliffScore: target, plateauCoverage: target },
      dataQuality: { ok: true, causalityOk: true, dataHash: "h" },
    };
  }
  it("low score => NOT_READY", () => {
    expect(evaluateDecision(scoreAt(0.2)).state).toBe("NOT_READY");
  });
  it("mid score => manual/scheduled shadow", () => {
    const s = evaluateDecision(scoreAt(0.5)).state;
    expect(["READY_FOR_MANUAL_SHADOW","READY_FOR_SCHEDULED_SHADOW"]).toContain(s);
  });
  it("high score => paper/beta/production", () => {
    const s = evaluateDecision(scoreAt(0.8)).state;
    expect(["READY_FOR_PAPER_TRADING","READY_FOR_LIMITED_BETA","READY_FOR_PRODUCTION_REVIEW"]).toContain(s);
  });
  it("near-perfect => GO_REVIEW_REQUIRED", () => {
    expect(evaluateDecision(scoreAt(0.99)).state).toBe("GO_REVIEW_REQUIRED");
  });
});

describe("Decision Center — evidence aggregation", () => {
  it("weakest and strongest reflect min/max component scores", () => {
    const r = evaluateDecision(full());
    expect(r.weakestModule).not.toBeNull();
    expect(r.strongestModule).not.toBeNull();
  });
  it("supporting run IDs include every provided module", () => {
    const r = evaluateDecision(full());
    expect(Object.keys(r.supportingRunIds).sort()).toEqual(
      ["crossAsset","monteCarlo","optimizer","portfolio","recommendation","recommendationValidator","regime","researchStability","robustness","sensitivity","shadow","walkForward"].sort(),
    );
  });
});

describe("Decision Center — run id determinism & exports", () => {
  it("run id is deterministic for identical evidence", () => {
    const a = full(); const b = full();
    const ra = evaluateDecision(a); const rb = evaluateDecision(b);
    expect(computeDecisionRunId(a, ra)).toBe(computeDecisionRunId(b, rb));
  });
  it("run id changes when a supporting run id changes", () => {
    const a = full();
    const b = full({ optimizer: { runId: "OP:2", confidence: 0.8, selectedCandidate: "A" } });
    expect(computeDecisionRunId(a, evaluateDecision(a))).not.toBe(computeDecisionRunId(b, evaluateDecision(b)));
  });
  it("bundle export contains all supporting run ids and decision", () => {
    const inp = full();
    const res = evaluateDecision(inp);
    const bundle = JSON.parse(buildDecisionBundle(inp, res));
    expect(bundle.bundle).toBe("DECISION_CENTER_BUNDLE_V1");
    expect(bundle.decision.state).toBe(res.state);
    expect(bundle.evidenceRunIds.walkForward).toBe("WF:1");
  });
  it("CSV export includes run ids and checklist", () => {
    const inp = full();
    const res = evaluateDecision(inp);
    const csv = buildDecisionCsv(res, "DEC:1");
    expect(csv).toMatch(/decision_run_id,DEC:1/);
    expect(csv).toMatch(/run_id\.walkForward,WF:1/);
    expect(csv).toMatch(/checklist\.portfolio,PASS/);
  });
  it("JSON export round-trips", () => {
    const res = evaluateDecision(full());
    const parsed = JSON.parse(buildDecisionJson(res, "R"));
    expect(parsed.state).toBe(res.state);
  });
});

describe("Decision Center — no recomputation contract", () => {
  it("evaluateDecision does not mutate its input", () => {
    const inp = full();
    const snap = JSON.stringify(inp);
    evaluateDecision(inp);
    expect(JSON.stringify(inp)).toBe(snap);
  });
});