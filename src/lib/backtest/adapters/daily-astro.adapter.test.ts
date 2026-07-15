// Phase 21.3b · Parity tests for the daily-astro adapter (Sign-Degree + Legacy).
// The oracle is the exact same primitive chain used by `runBacktest`:
//   computeCycles → computeAstroLevels → buildLevelBoard → computeSignal
//   → pickTargetStop → resolveOutcome
// We invoke both the adapter and the primitives with identical inputs and
// assert deterministic equality on every trade field the adapter emits.

import { describe, expect, it } from "vitest";
import {
  buildLevelBoard,
  computeAstroLevels,
  computeCycles,
  computeSignal,
  type PlanetRow,
} from "../../astro-levels";
import { pickTargetStop, resolveOutcome, ZERO_COSTS } from "../../backtest-engine";
import {
  legacyHistoricalAdapter,
  signDegreeHistoricalAdapter,
  type DailyExtras,
} from "./daily-astro.adapter";
import { runHistoricalCore } from "../runner";

const p = (
  planet: string,
  degree: number,
  nakshatra: string,
  retro = false,
): PlanetRow => ({
  planet,
  degree,
  absDegree: degree,
  sign: "Aries",
  nakshatra,
  lord: "Mars",
  pada: 1,
  speed: 1,
  motion: retro ? "Retrograde" : "Direct",
  retro,
  retroBias: "neutral",
  bull: false,
  bear: false,
  r1: 0,
  s1: 0,
  r2: 0,
  s2: 0,
});

const CANDLES = [
  { date: "2026-01-01", open: 18000, high: 18010, low: 17990, close: 18005 },
  { date: "2026-01-02", open: 18010, high: 18100, low: 17950, close: 18080 }, // BUY case
  { date: "2026-01-05", open: 18080, high: 18120, low: 17800, close: 17820 }, // LOSS case
  { date: "2026-01-06", open: 17820, high: 17850, low: 17700, close: 17720 },
];

const POS = {
  moonSign: "Taurus",
  moonNakshatra: "Rohini", // bull nakshatra → confidence boost
  retroCount: 0,
  bullRetroCount: 0,
  bearRetroCount: 0,
  planets: [p("Sun", 5, "Rohini"), p("Moon", 10, "Rohini"), p("Mars", 15, "Rohini")],
};

const POS_BEAR = {
  moonSign: "Scorpio",
  moonNakshatra: "Jyeshtha", // bear nakshatra
  retroCount: 3,
  bullRetroCount: 0,
  bearRetroCount: 2,
  planets: [p("Sun", 5, "Jyeshtha", true), p("Moon", 10, "Jyeshtha"), p("Mars", 15, "Jyeshtha", true)],
};

const extras: DailyExtras = {
  candles: CANDLES,
  positions: {
    "2026-01-02": POS,
    "2026-01-05": POS_BEAR,
    "2026-01-06": POS_BEAR,
  },
};

function replayOracle(
  today: (typeof CANDLES)[number],
  prev: (typeof CANDLES)[number],
  positions: typeof POS,
) {
  const cycles = computeCycles(prev.close);
  const planets = positions.planets.map((pl) => ({
    ...pl,
    ...computeAstroLevels(cycles, pl.degree),
  }));
  const entry = today.open;
  const board = buildLevelBoard(planets, entry);
  const sig = computeSignal({
    price: entry,
    board,
    moonNakshatra: positions.moonNakshatra,
    retroCount: positions.retroCount,
    totalPlanets: planets.length,
    bullRetroCount: positions.bullRetroCount,
    bearRetroCount: positions.bearRetroCount,
  });
  const picked = pickTargetStop(
    board.map((b) => ({ value: b.value, isResistance: b.isResistance })),
    entry,
    sig.signal,
  );
  if (sig.signal === "WAIT") return { sig, picked, outcome: null };
  if (picked.target == null || picked.stop == null)
    return { sig, picked, outcome: null, invalid: true };
  const outcome = resolveOutcome({
    signal: sig.signal,
    entry,
    target: picked.target,
    stop: picked.stop,
    high: today.high,
    low: today.low,
    close: today.close,
    policy: "conservative",
    costs: ZERO_COSTS,
  });
  return { sig, picked, outcome };
}

describe("Phase 21.3b · daily-astro adapter — sign-degree parity", () => {
  it("adapter output matches replay oracle for every session", async () => {
    const r = await runHistoricalCore({
      formula: signDegreeHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    expect(r.trades.length).toBe(3);
    for (const t of r.trades) {
      const idx = CANDLES.findIndex((c) => c.date === t.date);
      const oracle = replayOracle(
        CANDLES[idx],
        CANDLES[idx - 1],
        extras.positions[t.date]!,
      );
      expect(t.side).toBe(oracle.sig.signal);
      if (oracle.sig.signal === "WAIT") {
        expect(t.outcome).toBe("SKIP");
        continue;
      }
      if (oracle.invalid) {
        expect(t.outcome).toBe("INVALID_SETUP");
        continue;
      }
      expect(t.target).toBe(
        oracle.picked.target == null ? null : Math.round(oracle.picked.target * 100) / 100,
      );
      expect(t.stop).toBe(
        oracle.picked.stop == null ? null : Math.round(oracle.picked.stop * 100) / 100,
      );
      expect(t.outcome).toBe(oracle.outcome!.result);
      expect(t.pnl).toBe(oracle.outcome!.netPnl);
      expect(t.ambiguous).toBe(oracle.outcome!.ambiguous);
      expect(t.exit).toBe(oracle.outcome!.exit);
    }
  });

  it("deterministic — same inputs → same runId + trades", async () => {
    const r1 = await runHistoricalCore({
      formula: signDegreeHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    const r2 = await runHistoricalCore({
      formula: signDegreeHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    expect(r1.runId).toBe(r2.runId);
    expect(r1.trades).toEqual(r2.trades);
  });

  it("preserves nakshatra/moonSign/retrograde/nearest in trade metadata", async () => {
    const r = await runHistoricalCore({
      formula: signDegreeHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    for (const t of r.trades) {
      const md = t.metadata as Record<string, unknown>;
      expect(md).toHaveProperty("moonSign");
      expect(md).toHaveProperty("moonNakshatra");
      expect(md).toHaveProperty("retrograde");
      expect(md).toHaveProperty("nearest");
      expect(md).toHaveProperty("astroFormulaVersion");
      expect(md).toHaveProperty("strength");
      expect(md).toHaveProperty("confidence");
    }
  });

  it("rejects unsupported instrument", async () => {
    await expect(
      runHistoricalCore({
        formula: signDegreeHistoricalAdapter,
        instrument: "ETH-USD",
        from: "2026-01-02",
        to: "2026-01-06",
        extras,
      }),
    ).rejects.toThrow(/does not support/);
  });

  it("throws when extras are missing (backend parity contract)", async () => {
    await expect(
      runHistoricalCore({
        formula: signDegreeHistoricalAdapter,
        instrument: "NIFTY50",
        from: "2026-01-02",
        to: "2026-01-06",
      }),
    ).rejects.toThrow(/candles/);
  });
});

describe("Phase 21.3b · legacy adapter — formula version isolation", () => {
  it("legacy adapter emits legacyRunId prefix and legacy formula tag in metadata", async () => {
    const r = await runHistoricalCore({
      formula: legacyHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    expect(r.formulaVersion).toBe("LEGACY_EAGLEBABA_CASCADE_V1");
    expect(r.runId.startsWith("LEGACY_EAGLEBABA_CASCADE_V1:")).toBe(true);
    for (const t of r.trades) {
      const md = t.metadata as Record<string, unknown>;
      expect(md.astroFormulaVersion).toBe("LEGACY_EAGLEBABA_CASCADE_V1");
    }
  });

  it("legacy run-id differs from sign-degree run-id for the same inputs", async () => {
    const legacy = await runHistoricalCore({
      formula: legacyHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    const sign = await runHistoricalCore({
      formula: signDegreeHistoricalAdapter,
      instrument: "NIFTY50",
      from: "2026-01-02",
      to: "2026-01-06",
      source: "unit-fixture",
      extras,
    });
    expect(legacy.runId).not.toBe(sign.runId);
  });
});
