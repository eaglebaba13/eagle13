import { describe, it, expect } from "vitest";
import { classifyDataQuality, isTradableStatus } from "./data-quality-state";
import type { DataQualityReport } from "../candle-data-quality";

function report(overrides: Partial<DataQualityReport> = {}): DataQualityReport {
  return {
    totalRows: 75,
    validRows: 75,
    duplicateCount: 0,
    outOfOrderCount: 0,
    outOfWindowCount: 0,
    expectedCandlesPerSession: 75,
    sessionsDetected: 1,
    gaps: [],
    coveragePct: 100,
    causalityFailures: 0,
    ...overrides,
  } as DataQualityReport;
}

describe("Phase 21.4 Stage 4C · data quality state", () => {
  it("returns UNAVAILABLE when there are no candles", () => {
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 0,
        latestCandleMs: null,
        mode: "historical",
      }),
    ).toBe("UNAVAILABLE");
  });

  it("returns UNAVAILABLE on causality failure", () => {
    expect(
      classifyDataQuality({
        report: report({ causalityFailures: 3 }),
        candleCount: 75,
        latestCandleMs: null,
        mode: "historical",
      }),
    ).toBe("UNAVAILABLE");
  });

  it("returns PARTIAL when coverage is under 90%", () => {
    expect(
      classifyDataQuality({
        report: report({ coveragePct: 75 }),
        candleCount: 60,
        latestCandleMs: null,
        mode: "historical",
      }),
    ).toBe("PARTIAL");
  });

  it("historical mode returns LIVE regardless of freshness", () => {
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 75,
        latestCandleMs: 0,
        mode: "historical",
      }),
    ).toBe("LIVE");
  });

  it("live mode: fresh -> LIVE, mid -> DELAYED, old -> STALE", () => {
    const now = 1_000_000_000_000;
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 75,
        latestCandleMs: now - 60_000,
        nowMs: now,
        mode: "live",
      }),
    ).toBe("LIVE");
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 75,
        latestCandleMs: now - 20 * 60_000,
        nowMs: now,
        mode: "live",
      }),
    ).toBe("DELAYED");
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 75,
        latestCandleMs: now - 2 * 60 * 60_000,
        nowMs: now,
        mode: "live",
      }),
    ).toBe("STALE");
  });

  it("rejects future timestamps as STALE", () => {
    const now = 1_000_000_000_000;
    expect(
      classifyDataQuality({
        report: report(),
        candleCount: 75,
        latestCandleMs: now + 60_000,
        nowMs: now,
        mode: "live",
      }),
    ).toBe("STALE");
  });

  it("isTradableStatus: only LIVE/DELAYED", () => {
    expect(isTradableStatus("LIVE")).toBe(true);
    expect(isTradableStatus("DELAYED")).toBe(true);
    expect(isTradableStatus("STALE")).toBe(false);
    expect(isTradableStatus("PARTIAL")).toBe(false);
    expect(isTradableStatus("UNAVAILABLE")).toBe(false);
  });
});