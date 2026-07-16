import { describe, it, expect } from "vitest";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import type { CombinedPcrReading } from "../combined-pcr/types";

function reading(over: Partial<CombinedPcrReading> = {}): CombinedPcrReading {
  return {
    combinedScore: 12,
    direction: "CE",
    emaFast: 5, emaSlow: 3, slope: 0.5, previousSlope: 0.4, slopeChange: 0.1,
    zeroCross: false,
    signalState: "CE_FOCUS",
    confirmedState: "CE_FOCUS",
    pendingState: "CE_FOCUS",
    confirmationCount: 2,
    instruments: [],
    timestamp: new Date().toISOString(),
    warnings: [],
    runId: "pcr-1",
    ...over,
  };
}

describe("adaptPcrConfirmation", () => {
  it("UNAVAILABLE when reading is null (never substitutes zero)", () => {
    const r = adaptPcrConfirmation({ reading: null });
    expect(r.available).toBe(false);
    expect(r.combinedScore).toBe(null);
    expect(r.confirmedState).toBe("UNAVAILABLE");
  });
  it("passes through CE_FOCUS when fresh", () => {
    const r = adaptPcrConfirmation({ reading: reading(), now: Date.now() });
    expect(r.available).toBe(true);
    expect(r.confirmedState).toBe("CE_FOCUS");
    expect(r.dataQuality).toBe("OK");
  });
  it("marks STALE when older than threshold, and never emits a direction", () => {
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const r = adaptPcrConfirmation({ reading: reading({ timestamp: old }), staleAfterMs: 60_000 });
    expect(r.freshness).toBe("STALE");
    expect(r.confirmedState).toBe("UNAVAILABLE");
    expect(r.available).toBe(false);
  });
  it("PARTIAL when warnings present", () => {
    const r = adaptPcrConfirmation({ reading: reading({ warnings: ["missing strike"] }) });
    expect(r.dataQuality).toBe("PARTIAL");
  });
});
