import { describe, it, expect } from "vitest";
import { detectConflicts, directionOfBreadth, directionOfPcr } from "./conflict-detector";
import { computeConfidence } from "./confidence";
import { buildMockBreadthBundle } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import { computeBreadth } from "./breadth-calc";
import type { CombinedPcrReading } from "../combined-pcr/types";

describe("conflict + confidence", () => {
  it("detects broad-vs-weighted mismatch", () => {
    const bull = buildMockBreadthBundle({ scenario: "BULLISH" });
    const bear = buildMockBreadthBundle({ scenario: "BEARISH" });
    const conflicts = detectConflicts({
      broad: bull.broad, nifty50: bull.nifty50, topWeighted: bear.topWeighted,
      banking: bull.banking, it: bull.it, oilGas: bull.oilGas, auto: bull.auto,
      pcr: adaptPcrConfirmation({ reading: null }),
      vix: evaluateVixRegime({ currentVix: 15, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
    });
    expect(conflicts.some((c) => c.code === "BROAD_VS_WEIGHTED")).toBe(true);
  });

  it("stale breadth vs fresh PCR is flagged", () => {
    const stale = computeBreadth({
      universe: "BROAD_NSE", provider: "M", timestamp: new Date().toISOString(),
      expectedSymbols: ["A"], ticks: [{ symbol: "A", direction: "ADVANCE", changePercent: 1 }],
      freshnessMs: 60 * 60 * 1000, staleThresholdMs: 60_000, snapshotId: "s",
    });
    const freshPcrReading: CombinedPcrReading = {
      combinedScore: 10, direction: "CE", emaFast: 5, emaSlow: 3,
      slope: 0.5, previousSlope: 0.4, slopeChange: 0.1, zeroCross: false,
      signalState: "CE_FOCUS", confirmedState: "CE_FOCUS", pendingState: "CE_FOCUS",
      confirmationCount: 2, instruments: [], timestamp: new Date().toISOString(),
      warnings: [], runId: "pcr-fresh",
    };
    const conflicts = detectConflicts({
      broad: stale, nifty50: null, topWeighted: null,
      banking: null, it: null, oilGas: null, auto: null,
      pcr: adaptPcrConfirmation({ reading: freshPcrReading }),
      vix: evaluateVixRegime({ currentVix: 15, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
    });
    expect(conflicts.some((c) => c.code === "STALE_BREADTH_FRESH_PCR")).toBe(true);
  });

  it("confidence penalty grows with conflicts and partial coverage", () => {
    const bundle = buildMockBreadthBundle({ scenario: "MIXED" });
    const noConflict = computeConfidence({
      breadthSnapshots: [bundle.broad, bundle.nifty50, bundle.topWeighted, bundle.banking, bundle.it, bundle.oilGas, bundle.auto],
      pcr: adaptPcrConfirmation({ reading: null }),
      vix: evaluateVixRegime({ currentVix: 15, provider: "MOCK", timestamp: new Date().toISOString(), freshness: "FRESH" }),
      conflicts: [],
    });
    const withConflicts = computeConfidence({
      breadthSnapshots: [bundle.broad, null, null, null, null, null, null],
      pcr: adaptPcrConfirmation({ reading: null }),
      vix: evaluateVixRegime({ currentVix: null, provider: "N/A", timestamp: new Date().toISOString() }),
      conflicts: [{ code: "X", message: "x" }, { code: "Y", message: "y" }, { code: "Z", message: "z" }],
    });
    expect(withConflicts.total).toBeLessThan(noConflict.total);
    expect(withConflicts.coveragePenalty).toBeGreaterThan(0);
    expect(withConflicts.conflictPenalty).toBeGreaterThan(0);
  });

  it("directionOfBreadth/Pcr helpers behave", () => {
    expect(directionOfBreadth(null)).toBe("UNKNOWN");
    expect(directionOfPcr(adaptPcrConfirmation({ reading: null }))).toBe("UNKNOWN");
  });
});
