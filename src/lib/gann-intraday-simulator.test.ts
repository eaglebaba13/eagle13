import { describe, it, expect } from "vitest";
import { simulateSession, simulateLevel } from "./gann-intraday-simulator";
import type { TimedCandle5m } from "./gann-intraday-touch";
import type { RankedLevel } from "./gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

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
const sellLvl = (over: Partial<RankedLevel> = {}): RankedLevel =>
  buyLvl({ side: "RESISTANCE", tradeBias: "SELL", value: 18790, ...over });

const mk = (i: number, o: number, h: number, l: number, c: number): TimedCandle5m => ({
  timeIst: `2026-07-15T09:${(15 + i * 5).toString().padStart(2, "0")}:00+05:30`,
  openTimeMs: 1_000_000_000 + i * 5 * 60_000,
  open: o,
  high: h,
  low: l,
  close: c,
});

const noCube = {
  starBias: "BULLISH" as const,
  retrograde: "UNKNOWN" as const,
  aspect: "UNKNOWN" as const,
  priceAction: "UNKNOWN" as const,
  ema13: "UNKNOWN" as const,
  rsi14: "UNKNOWN" as const,
};

describe("Stage 4 · session simulator", () => {
  it("BUY confirmation on green candle within tolerance yields ENTRY_READY + SL/target", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18500, 18510, 18490, 18495), // no touch
        mk(1, 18470, 18475, 18425, 18428), // touch
        mk(2, 18428, 18445, 18425, 18440), // green close, dev 10 <= 15
        mk(3, 18441, 18490, 18440, 18485),
      ],
      noCube,
    );
    expect(sim.touchIndex).toBe(1);
    expect(sim.confirmIndex).toBe(2);
    expect(sim.entry).toBe(18440);
    expect(sim.stopLoss).toBe(18440 - 51);
    expect(sim.target).toBe(18440 + 51);
  });

  it("SELL confirmation on red candle", () => {
    const sim = simulateLevel(
      "NIFTY50",
      sellLvl(),
      [
        mk(0, 18790, 18800, 18785, 18795), // touch @ index 0
        mk(1, 18795, 18800, 18775, 18780), // red, close 18780
      ],
      noCube,
    );
    expect(sim.entry).toBe(18780);
    expect(sim.stopLoss).toBe(18780 + 51);
    expect(sim.target).toBe(18780 - 51);
  });

  it("wrong-colour close invalidates", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [mk(0, 18428, 18435, 18420, 18425), mk(1, 18440, 18445, 18400, 18410)],
      noCube,
    );
    expect(sim.outcome).toBe("INVALIDATED");
  });

  it("close beyond deviation → WAITING_RETEST; retest fills entry", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18428, 18435, 18420, 18425), // touch
        mk(1, 18430, 18465, 18428, 18460), // green, dev 30 > 15 → WAITING_RETEST
        mk(2, 18455, 18460, 18432, 18445), // retest reaches level within tol
      ],
      noCube,
    );
    expect(sim.retestIndex).toBe(2);
    expect(sim.entry).not.toBeNull();
  });

  it("missed chase when price never returns", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18428, 18435, 18420, 18425),
        mk(1, 18430, 18465, 18428, 18460),
        mk(2, 18465, 18500, 18462, 18495),
        mk(3, 18495, 18510, 18492, 18505),
      ],
      noCube,
    );
    expect(sim.outcome).toBe("MISSED_CHASE");
  });

  it("BANKNIFTY uses 30-pt tolerance and 101-pt SL/target", () => {
    const sim = simulateLevel(
      "BANKNIFTY",
      buyLvl({ value: 43560 }),
      [mk(0, 43600, 43610, 43555, 43575), mk(1, 43575, 43600, 43570, 43590)],
      noCube,
    );
    expect(sim.stopLoss).toBe(43590 - 101);
    expect(sim.target).toBe(43590 + 101);
  });

  it("conservative ambiguous policy resolves to STOP", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18428, 18435, 18420, 18425),
        mk(1, 18425, 18440, 18420, 18432), // green close dev 2 -> ENTRY_READY @ 18432 SL 18381 TGT 18483
        mk(2, 18432, 18485, 18380, 18450), // hits BOTH tgt & sl in same candle
      ],
      noCube,
      "conservative",
    );
    expect(sim.ambiguousCandleCount).toBe(1);
    expect(sim.outcome).toBe("STOP");
  });

  it("optimistic ambiguous policy resolves to TARGET", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18428, 18435, 18420, 18425),
        mk(1, 18425, 18440, 18420, 18432),
        mk(2, 18432, 18485, 18380, 18450),
      ],
      noCube,
      "optimistic",
    );
    expect(sim.outcome).toBe("TARGET");
  });

  it("exclude_ambiguous drops the trade", () => {
    const sim = simulateLevel(
      "NIFTY50",
      buyLvl(),
      [
        mk(0, 18428, 18435, 18420, 18425),
        mk(1, 18425, 18440, 18420, 18432),
        mk(2, 18432, 18485, 18380, 18450),
      ],
      noCube,
      "exclude_ambiguous",
    );
    expect(sim.outcome).toBe("AMBIGUOUS_EXCLUDED");
  });

  it("no-future-leak: processing candle i must not read candle i+1", () => {
    const raw = [
      mk(0, 18428, 18435, 18420, 18425),
      mk(1, 18425, 18440, 18420, 18432),
      mk(2, 18432, 18490, 18430, 18485),
    ];
    // Reveal the array progressively and confirm the intermediate result is
    // consistent with the full-session result up to that point.
    const partial = simulateLevel("NIFTY50", buyLvl(), raw.slice(0, 2), noCube);
    const full = simulateLevel("NIFTY50", buyLvl(), raw, noCube);
    // Partial can only observe touch + confirm; full may also see the target.
    expect(partial.touchIndex).toBe(full.touchIndex);
    expect(partial.confirmIndex).toBe(full.confirmIndex);
  });

  it("determinism: same input → same output", () => {
    const raw = [
      mk(0, 18428, 18435, 18420, 18425),
      mk(1, 18425, 18440, 18420, 18432),
    ];
    const a = simulateSession({
      instrument: "NIFTY50",
      ranked: [buyLvl()],
      candles: raw,
      cubeInputs: noCube,
    });
    const b = simulateSession({
      instrument: "NIFTY50",
      ranked: [buyLvl()],
      candles: raw,
      cubeInputs: noCube,
    });
    expect(JSON.stringify(a.perLevel)).toBe(JSON.stringify(b.perLevel));
  });
});