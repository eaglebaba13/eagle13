import { describe, it, expect } from "vitest";
import { summarizeShadowObservations, type ShadowSample } from "./shadow-validation";
import type { PcrSignalState } from "./types";

function s(t: number, state: PcrSignalState, score: number, slope = 0, count = 1): ShadowSample {
  return {
    timestamp: new Date(1_700_000_000_000 + t * 1000).toISOString(),
    candidateState: state,
    confirmedState: state,
    pendingState: state,
    combinedScore: score,
    slope,
    confirmationCount: count,
  };
}

describe("summarizeShadowObservations", () => {
  it("segments CE_FOCUS runs and captures forward move / MFE / MAE", () => {
    const obs = summarizeShadowObservations([
      s(0, "NO_TRADE", 0),
      s(1, "CE_FOCUS", -10, -2, 2),
      s(2, "CE_FOCUS", -18),
      s(3, "CE_FOCUS", -12),
      s(4, "NO_TRADE", 0),
      s(5, "PE_FOCUS", 15, 3),
      s(6, "PE_FOCUS", 22),
    ]);
    expect(obs.length).toBe(2);
    expect(obs[0].state).toBe("CE_FOCUS");
    expect(obs[0].entryScore).toBe(-10);
    expect(obs[0].mfe).toBe(-10);
    expect(obs[0].mae).toBe(-18);
    expect(obs[0].forwardMove).toBe(10); // ended at NO_TRADE score 0
    expect(obs[1].state).toBe("PE_FOCUS");
    expect(obs[1].entrySlope).toBe(3);
  });

  it("flags reversal when the next confirmed state flips direction", () => {
    const obs = summarizeShadowObservations([
      s(0, "CE_FOCUS", -10),
      s(1, "CE_FOCUS", -12),
      s(2, "PE_FOCUS", 8),
    ]);
    expect(obs[0].reversal).toBe(true);
  });

  it("flags weakening when the next confirmed state is a weakening state", () => {
    const obs = summarizeShadowObservations([
      s(0, "CE_FOCUS", -10),
      s(1, "BULLISH_WEAKENING", -4),
    ]);
    expect(obs[0].weakening).toBe(true);
  });

  it("ignores NO_TRADE runs entirely", () => {
    const obs = summarizeShadowObservations([
      s(0, "NO_TRADE", 0),
      s(1, "NO_TRADE", 1),
      s(2, "NO_TRADE", -1),
    ]);
    expect(obs).toEqual([]);
  });

  it("captures confirmation delay from the first sample of the segment", () => {
    const obs = summarizeShadowObservations([
      s(0, "CE_FOCUS", -10, -1, 3),
      s(1, "CE_FOCUS", -12, -1, 4),
    ]);
    expect(obs[0].confirmationDelayCount).toBe(3);
  });
});