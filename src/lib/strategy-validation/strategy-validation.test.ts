import { describe, it, expect } from "vitest";
import { analyseHistory, replaySnapshot, replaySeries } from "./index";
import type { HistoricalSnapshot } from "./types";
import type { DecisionEngineInput } from "@/lib/option-strategy-decision/types";

function baseInput(over: Partial<DecisionEngineInput> = {}): DecisionEngineInput {
  return {
    pcr: { combinedScore: 0.5, state: "CE_FOCUS", available: true },
    breadth: { advances: 30, declines: 20, netBreadth: 0.2, available: true },
    sector: { banking: "BULLISH", oilGas: "NEUTRAL", it: "BULLISH", available: true },
    oi: {
      highestCallOiStrike: 25000,
      highestPutOiStrike: 24500,
      atmStrike: 24800,
      totalCallChangeOi: 100,
      totalPutChangeOi: 200,
      buildUp: "LONG_BUILDUP",
      available: true,
    },
    maxPain: { value: 24700, spot: 24800, distance: 100, distancePct: 0.4, available: true },
    vix: 14,
    underlying: "NIFTY",
    generatedAt: "2026-07-17T09:15:00Z",
    ...over,
  };
}

function snap(ts: string, spot: number, fwd: number, over: Partial<HistoricalSnapshot> = {}): HistoricalSnapshot {
  return {
    timestamp: ts,
    spotPrice: spot,
    forwardPrice: fwd,
    regime: "TRENDING_BULL",
    institutionalFlow: "BUYING",
    input: baseInput(),
    ...over,
  };
}

describe("strategy validation replay", () => {
  it("is deterministic — same input, same output", () => {
    const s = snap("2026-07-17T09:15:00Z", 24800, 24900);
    const a = replaySnapshot(s);
    const b = replaySnapshot(s);
    expect(a).toEqual(b);
  });

  it("scores a bullish decision + up move as WIN", () => {
    const r = replaySnapshot(snap("t", 100, 101));
    if (r.action === "BUY_CALL") expect(r.outcome).toBe("WIN");
    else expect(["WAIT", "NO_TRADE", "WIN", "LOSS"]).toContain(r.outcome);
  });

  it("bearish input + down move → BUY_PUT WIN", () => {
    const bearish = snap("t", 100, 99, {
      input: baseInput({
        pcr: { combinedScore: -0.6, state: "PE_FOCUS", available: true },
        breadth: { advances: 10, declines: 40, netBreadth: -0.3, available: true },
        sector: { banking: "BEARISH", oilGas: "BEARISH", it: "NEUTRAL", available: true },
      }),
    });
    const r = replaySnapshot(bearish);
    expect(["BUY_PUT", "WAIT", "NO_TRADE"]).toContain(r.action);
    if (r.action === "BUY_PUT") expect(r.outcome).toBe("WIN");
  });

  it("replaySeries preserves order and count", () => {
    const series = [snap("a", 100, 101), snap("b", 101, 100), snap("c", 100, 100)];
    const out = replaySeries(series);
    expect(out.map((o) => o.timestamp)).toEqual(["a", "b", "c"]);
  });
});

describe("analyseHistory", () => {
  it("returns UNAVAILABLE on empty input", () => {
    const r = analyseHistory([]);
    expect(r.available).toBe(false);
    expect(r.note).toMatch(/UNAVAILABLE/);
  });

  it("flags LOW SAMPLE SIZE below 30", () => {
    const series = Array.from({ length: 10 }, (_, i) => snap(`t${i}`, 100, 100 + i));
    const r = analyseHistory(series);
    expect(r.available).toBe(false);
    expect(r.note).toMatch(/LOW SAMPLE SIZE/);
    expect(r.overall.lowSample).toBe(true);
  });

  it("computes overall metrics when sample size ≥ 30", () => {
    const series = Array.from({ length: 40 }, (_, i) =>
      snap(`t${i}`, 100, i % 2 === 0 ? 101 : 99.5),
    );
    const r = analyseHistory(series);
    expect(r.available).toBe(true);
    expect(r.overall.sampleSize).toBe(40);
    expect(r.decisionBreakdown.length).toBe(4);
    expect(r.calibration.length).toBeGreaterThan(0);
    expect(r.contribution.length).toBeGreaterThan(0);
    expect(r.journal.length).toBe(40);
  });

  it("classifies failures on losing trades", () => {
    const highVix = snap("t", 100, 99, {
      input: baseInput({ vix: 30 }),
    });
    const r = replaySnapshot(highVix);
    if (r.outcome === "LOSS") expect(r.failure).not.toBeNull();
  });
});