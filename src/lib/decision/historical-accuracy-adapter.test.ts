import { describe, expect, it } from "vitest";
import {
  selectHistoricalAccuracy,
  type HistoricalRunCandidate,
  type HistoricalSelectionContext,
} from "./historical-accuracy-adapter";

const NOW = "2026-07-17T10:00:00Z";
const ctx: HistoricalSelectionContext = {
  instrument: "NIFTY",
  strategyVersion: "astro@1.2.0",
  formulaVersion: "decision@1.0.0",
  timeframe: "5m",
  now: NOW,
};

function run(over: Partial<HistoricalRunCandidate>): HistoricalRunCandidate {
  return {
    id: over.id ?? "r1",
    source: over.source ?? "SHADOW_VALIDATED",
    approved: over.approved ?? true,
    instrument: over.instrument ?? "NIFTY",
    strategyVersion: over.strategyVersion ?? "astro@1.2.0",
    formulaVersion: over.formulaVersion ?? "decision@1.0.0",
    timeframe: over.timeframe ?? "5m",
    wins: over.wins ?? 30,
    losses: over.losses ?? 20,
    neutral: over.neutral ?? 5,
    evaluatedAt: over.evaluatedAt ?? "2026-07-16T10:00:00Z",
    direction: over.direction ?? "BULL",
    ...over,
  };
}

describe("selectHistoricalAccuracy", () => {
  it("returns NO_DATA when no candidates", () => {
    const r = selectHistoricalAccuracy([], ctx);
    expect(r.capability).toBe("NO_DATA");
    expect(r.source).toBe("UNAVAILABLE");
    expect(r.sampleSize).toBeNull();
  });

  it("prefers shadow-validated over walk-forward and backtest", () => {
    const r = selectHistoricalAccuracy(
      [
        run({ id: "b1", source: "BACKTEST_APPROVED" }),
        run({ id: "w1", source: "WALK_FORWARD_APPROVED" }),
        run({ id: "s1", source: "SHADOW_VALIDATED" }),
      ],
      ctx,
    );
    expect(r.source).toBe("SHADOW_VALIDATED");
    expect(r.runId).toBe("s1");
    expect(r.capability).toBe("SUPPORTED");
  });

  it("rejects incompatible formula/strategy versions", () => {
    const r = selectHistoricalAccuracy(
      [run({ formulaVersion: "decision@0.9.0" })],
      ctx,
    );
    expect(r.capability).toBe("NO_COMPATIBLE_RUN");
    expect(r.rejectedReasons[0]).toMatch(/formula version mismatch/);
  });

  it("rejects stale runs (>30 days)", () => {
    const r = selectHistoricalAccuracy(
      [run({ evaluatedAt: "2026-05-01T10:00:00Z" })],
      ctx,
    );
    expect(r.capability).toBe("NO_COMPATIBLE_RUN");
    expect(r.rejectedReasons[0]).toMatch(/stale/);
  });

  it("rejects insufficient sample size", () => {
    const r = selectHistoricalAccuracy(
      [run({ wins: 2, losses: 3, neutral: 0 })],
      ctx,
    );
    expect(r.capability).toBe("NO_COMPATIBLE_RUN");
    expect(r.rejectedReasons[0]).toMatch(/insufficient sample/);
  });

  it("computes win rate and Wilson CI", () => {
    const r = selectHistoricalAccuracy(
      [run({ wins: 60, losses: 40, neutral: 10 })],
      ctx,
    );
    expect(r.winRatePct).toBeCloseTo(60, 5);
    expect(r.sampleSize).toBe(110);
    expect(r.confidenceIntervalPct?.[0]).toBeLessThan(60);
    expect(r.confidenceIntervalPct?.[1]).toBeGreaterThan(60);
  });

  it("never merges incompatible runs silently", () => {
    const r = selectHistoricalAccuracy(
      [
        run({ id: "a", instrument: "BANKNIFTY" }),
        run({ id: "b", source: "BACKTEST_APPROVED" }),
      ],
      ctx,
    );
    expect(r.runId).toBe("b");
    expect(r.rejectedReasons).toContain("a: instrument mismatch");
  });

  it("marks freshness stale for runs older than 7 days", () => {
    const r = selectHistoricalAccuracy(
      [run({ evaluatedAt: "2026-07-05T10:00:00Z" })],
      ctx,
    );
    expect(r.freshness).toBe("STALE");
  });
});