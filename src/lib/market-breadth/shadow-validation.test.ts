import { describe, it, expect } from "vitest";
import { summarizeGtiShadow, type GtiShadowSample } from "./shadow-validation";
import type { GtiResearchState } from "./types";

function s(t: number, state: GtiResearchState, fwd: number | null, conf = 60): GtiShadowSample {
  return {
    timestamp: new Date(1_800_000_000_000 + t * 1000).toISOString(),
    state, confidence: conf,
    niftyForwardMove: fwd, bankNiftyForwardMove: null,
    conflictCount: 0, breadthWeighted: null, vixRegime: "BELOW_15", pcrScore: null,
  };
}

describe("GTI shadow validation", () => {
  it("segments CE research runs, captures MFE/MAE, and flags reversal", () => {
    const obs = summarizeGtiShadow([
      s(0, "NEUTRAL_RESEARCH", 0),
      s(1, "CE_RESEARCH_FOCUS", 100),
      s(2, "CE_RESEARCH_FOCUS", 130),
      s(3, "CE_RESEARCH_FOCUS", 80),
      s(4, "PE_RESEARCH_FOCUS", 50),
    ]);
    expect(obs.length).toBeGreaterThanOrEqual(1);
    const first = obs[0];
    expect(first.state).toBe("CE_RESEARCH_FOCUS");
    expect(first.mfe).toBe(130);
    expect(first.mae).toBe(80);
    expect(first.reversal).toBe(true);
  });

  it("flags weakening when next state is BULLISH_BUT_CONFLICTED", () => {
    const obs = summarizeGtiShadow([
      s(0, "CE_RESEARCH_FOCUS", 100),
      s(1, "BULLISH_BUT_CONFLICTED", 90),
    ]);
    expect(obs[0].weakening).toBe(true);
  });

  it("ignores neutral runs entirely", () => {
    const obs = summarizeGtiShadow([
      s(0, "NEUTRAL_RESEARCH", 0),
      s(1, "DATA_INSUFFICIENT", 0),
    ]);
    expect(obs).toEqual([]);
  });
});
