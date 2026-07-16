import { describe, it, expect } from "vitest";
import { readingToCsv, readingToJson, buildCombinedPcrResearchBundle } from "./exports";
import type { CombinedPcrReading } from "./types";

const READING: CombinedPcrReading = {
  combinedScore: 12.5, direction: "PE",
  emaFast: 10, emaSlow: 5, slope: 5, previousSlope: 2, slopeChange: 3, zeroCross: false,
  signalState: "PE_FOCUS", confirmedState: "NO_TRADE", pendingState: "PE_FOCUS",
  confirmationCount: 1,
  instruments: [{
    underlying: "NIFTY", rawOiPcr: 1.2, rawChangeOiPcr: 1.1,
    normalizedOiPcr: 20, normalizedChangeOiPcr: 10, instrumentScore: 15,
    weight: 0.6, configuredWeight: 0.6, strikeCount: 21, atm: 24500,
    expiry: "2025-01-16", provider: "MOCK", timestamp: "2025-01-15T09:30:00Z",
    snapshotId: "NIFTY:2025-01-16:t", missing: [],
  }],
  timestamp: "2025-01-15T09:30:00Z", warnings: [], runId: "run-1",
};

describe("combined-pcr exports", () => {
  it("csv carries run id, formula, disclaimer and instrument rows", () => {
    const csv = readingToCsv(READING);
    expect(csv).toContain("run_id=run-1");
    expect(csv).toContain("RESEARCH ONLY");
    expect(csv).toContain("NIFTY");
    expect(csv).toContain("combined_score=12.5");
  });
  it("json round-trips and carries formula + disclaimer", () => {
    const json = readingToJson(READING);
    const parsed = JSON.parse(json);
    expect(parsed.runId).toBe("run-1");
    expect(parsed.formulaVersion).toContain("combined-pcr@");
    expect(parsed.disclaimer).toContain("RESEARCH ONLY");
  });
  it("research bundle wraps reading with metadata", () => {
    const b = buildCombinedPcrResearchBundle(READING, "2025-01-15T09:30:00Z");
    expect(b.version).toBe(1);
    expect(b.formulaVersion).toContain("combined-pcr@");
    expect(b.reading.runId).toBe("run-1");
  });
});