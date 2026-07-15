// Phase 21.3b · Parity test for the absolute-degree intraday adapter.
// Oracle = the exact same `simulateSession` call the Stage-4 tests use.
// The adapter output must project every relevant per-level result onto
// HistoricalTrade without dropping any absolute-specific metadata.

import { describe, expect, it } from "vitest";
import { simulateSession } from "../../gann-intraday-simulator";
import type { TimedCandle5m } from "../../gann-intraday-touch";
import type { RankedLevel } from "../../gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "../../engine-version";
import {
  absoluteIntradayHistoricalAdapter,
  type AbsoluteExtras,
} from "./absolute-intraday.adapter";
import { runHistoricalCore } from "../runner";

const buyLvl = (over: Partial<RankedLevel> = {}): RankedLevel => ({
  planet: "Sun",
  absoluteDegree: 70,
  sourceLevel: "L2",
  value: 18430,
  previousClose: 18665,
  upperMultiple: 18720,
  lowerMultiple: 18360,
  distanceFromClose: 235,
  side: "SUPPORT",
  tradeBias: "BUY",
  safety: "SAFE",
  formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  hasSun: true,
  hasMoon: false,
  sunMoonPriority: true,
  clusterCount: 1,
  clusterPlanets: ["Sun"],
  exact360Distance: 70,
  exact360Confluence: false,
  pivotConfluence: "STRONG",
  nearestPivotDistance: 3,
  ...over,
});

const mk = (i: number, o: number, h: number, l: number, c: number): TimedCandle5m => ({
  timeIst: `2026-07-15T09:${(15 + i * 5).toString().padStart(2, "0")}:00+05:30`,
  openTimeMs: 1_000_000_000 + i * 5 * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
});

// Session that produces a TARGET hit for the BUY level.
const winCandles: TimedCandle5m[] = [
  mk(0, 18500, 18510, 18490, 18495),
  mk(1, 18470, 18475, 18425, 18428), // touch
  mk(2, 18428, 18445, 18425, 18440), // confirm green
  mk(3, 18441, 18492, 18440, 18490), // hits target 18491
  mk(4, 18490, 18495, 18485, 18490),
];

// Session that produces a STOP hit for the BUY level.
const loseCandles: TimedCandle5m[] = [
  mk(0, 18500, 18510, 18490, 18495),
  mk(1, 18470, 18475, 18425, 18428),
  mk(2, 18428, 18445, 18425, 18440),
  mk(3, 18441, 18445, 18388, 18389),
];

const cube = {
  starBias: "BULLISH" as const,
  retrograde: "UNKNOWN" as const,
  aspect: "UNKNOWN" as const,
  priceAction: "UNKNOWN" as const,
  ema13: "UNKNOWN" as const,
  rsi14: "UNKNOWN" as const,
};

const extras: AbsoluteExtras = {
  sessions: [
    {
      tradingDate: "2026-07-15",
      instrument: "NIFTY50",
      ranked: [buyLvl()],
      candles: winCandles,
      cubeInputs: cube,
    },
    {
      tradingDate: "2026-07-16",
      instrument: "NIFTY50",
      ranked: [buyLvl()],
      candles: loseCandles,
      cubeInputs: cube,
    },
  ],
  ambiguousPolicy: "conservative",
};

describe("Phase 21.3b · absolute-intraday adapter parity", () => {
  it("target-hit session maps to WIN with correct entry/exit", async () => {
    const oracle = simulateSession({
      instrument: "NIFTY50",
      ranked: [buyLvl()],
      candles: winCandles,
      cubeInputs: cube,
      ambiguousPolicy: "conservative",
    });
    expect(oracle.perLevel[0].outcome).toBe("TARGET");

    const r = await runHistoricalCore({
      formula: absoluteIntradayHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-07-15",
      to: "2026-07-15",
      source: "unit-fixture",
      extras,
    });
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.outcome).toBe("WIN");
    expect(t.side).toBe("BUY");
    expect(t.entry).toBe(oracle.perLevel[0].entry);
    expect(t.target).toBe(oracle.perLevel[0].target);
    expect(t.stop).toBe(oracle.perLevel[0].stopLoss);
    expect(t.mfe).toBe(oracle.perLevel[0].mfe);
    expect(t.mae).toBe(oracle.perLevel[0].mae);
  });

  it("stop-hit session maps to LOSS with negative pnl", async () => {
    const r = await runHistoricalCore({
      formula: absoluteIntradayHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-07-16",
      to: "2026-07-16",
      source: "unit-fixture",
      extras,
    });
    expect(r.trades).toHaveLength(1);
    expect(r.trades[0].outcome).toBe("LOSS");
    expect(r.trades[0].pnl).toBeLessThan(0);
  });

  it("preserves planet/L-family/safeRisky/cubeGrade/touchTime/confirmationTime metadata", async () => {
    const r = await runHistoricalCore({
      formula: absoluteIntradayHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-07-15",
      to: "2026-07-16",
      source: "unit-fixture",
      extras,
    });
    for (const t of r.trades) {
      const md = t.metadata as Record<string, unknown>;
      expect(md.planet).toBe("Sun");
      expect(md.sourceLevel).toBe("L2");
      expect(md.safeRisky).toBe("SAFE");
      expect(typeof md.cubeGrade).toBe("string");
      expect(md.pivotConfluence).toBe("STRONG");
      expect(typeof md.touchTime).toBe("string");
      expect(typeof md.confirmationTime).toBe("string");
    }
  });

  it("run-id prefix is the absolute-degree formula version", async () => {
    const r = await runHistoricalCore({
      formula: absoluteIntradayHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-07-15",
      to: "2026-07-16",
      source: "unit-fixture",
      extras,
    });
    expect(r.runId.startsWith("GANN_ASTRO_INTRADAY_ABSOLUTE_V1:")).toBe(true);
    expect(r.formulaVersion).toBe("GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
  });

  it("rejects unsupported instrument", async () => {
    await expect(
      runHistoricalCore({
        formula: absoluteIntradayHistoricalAdapter,
        instrument: "GOLD",
        from: "2026-07-15",
        to: "2026-07-16",
        extras,
      }),
    ).rejects.toThrow(/does not support/);
  });

  it("throws when extras.sessions missing", async () => {
    await expect(
      runHistoricalCore({
        formula: absoluteIntradayHistoricalAdapter,
        instrument: "NIFTY50",
        from: "2026-07-15",
        to: "2026-07-16",
      }),
    ).rejects.toThrow(/sessions/);
  });
});
