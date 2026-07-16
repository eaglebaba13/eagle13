import { describe, it, expect } from "vitest";
import { classifyGti } from "./gti-classifier";
import { buildMockBreadthBundle } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import type { CombinedPcrReading } from "../combined-pcr/types";

function pcrReading(state: CombinedPcrReading["confirmedState"], score: number): CombinedPcrReading {
  return {
    combinedScore: score,
    direction: score > 0 ? "CE" : score < 0 ? "PE" : "NEUTRAL",
    emaFast: score, emaSlow: score, slope: 0, previousSlope: 0, slopeChange: 0,
    zeroCross: false,
    signalState: state, confirmedState: state, pendingState: state,
    confirmationCount: 3,
    instruments: [], timestamp: new Date().toISOString(), warnings: [], runId: "pcr-x",
  };
}

describe("GTI classifier", () => {
  it("bullish agreement → CE-focused research state", () => {
    const b = buildMockBreadthBundle({ scenario: "BULLISH" });
    const r = classifyGti({
      broad: b.broad, nifty50: b.nifty50, topWeighted: b.topWeighted,
      banking: b.banking, it: b.it, oilGas: b.oilGas, auto: b.auto,
      pcr: adaptPcrConfirmation({ reading: pcrReading("CE_FOCUS", 25) }),
      vix: evaluateVixRegime({ currentVix: 14, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
      runId: "gti-1",
    });
    expect(["STRONG_CE_RESEARCH_FOCUS", "CE_RESEARCH_FOCUS", "BULLISH_BUT_CONFLICTED"]).toContain(r.state);
  });

  it("bearish agreement → PE-focused research state", () => {
    const b = buildMockBreadthBundle({ scenario: "BEARISH" });
    const r = classifyGti({
      broad: b.broad, nifty50: b.nifty50, topWeighted: b.topWeighted,
      banking: b.banking, it: b.it, oilGas: b.oilGas, auto: b.auto,
      pcr: adaptPcrConfirmation({ reading: pcrReading("PE_FOCUS", -25) }),
      vix: evaluateVixRegime({ currentVix: 22, previousVix: 17, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
      runId: "gti-2",
    });
    expect(["STRONG_PE_RESEARCH_FOCUS", "PE_RESEARCH_FOCUS", "BEARISH_BUT_CONFLICTED"]).toContain(r.state);
  });

  it("DATA_INSUFFICIENT when nearly all breadth is missing", () => {
    const empty = null;
    const r = classifyGti({
      broad: empty, nifty50: empty, topWeighted: empty,
      banking: empty, it: empty, oilGas: empty, auto: empty,
      pcr: adaptPcrConfirmation({ reading: null }),
      vix: evaluateVixRegime({ currentVix: null, provider: "N/A", timestamp: new Date().toISOString() }),
      runId: "gti-3",
    });
    expect(r.state).toBe("DATA_INSUFFICIENT");
    expect(r.confidence).toBeLessThan(50);
  });

  it("never emits BUY/SELL/entry/exit tokens", () => {
    const b = buildMockBreadthBundle({ scenario: "BULLISH" });
    const r = classifyGti({
      broad: b.broad, nifty50: b.nifty50, topWeighted: b.topWeighted,
      banking: b.banking, it: b.it, oilGas: b.oilGas, auto: b.auto,
      pcr: adaptPcrConfirmation({ reading: pcrReading("CE_FOCUS", 25) }),
      vix: evaluateVixRegime({ currentVix: 14, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
      runId: "gti-4",
    });
    const forbidden = /\b(BUY|SELL|ENTRY|EXIT|TARGET|STOP[_ ]LOSS)\b/;
    expect(JSON.stringify(r).match(forbidden)).toBe(null);
  });
});
