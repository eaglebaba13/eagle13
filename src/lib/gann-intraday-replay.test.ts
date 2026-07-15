import { describe, it, expect } from "vitest";
import {
  initReplay,
  stepReplay,
  jumpReplay,
  restartReplay,
  computeReplayView,
} from "./gann-intraday-replay";
import type { TimedCandle5m } from "./gann-intraday-touch";
import type { RankedLevel } from "./gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const level: RankedLevel = {
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
};
const c = (i: number, o: number, h: number, l: number, cl: number): TimedCandle5m => ({
  timeIst: `2026-07-15T09:${(15 + i * 5).toString().padStart(2, "0")}:00+05:30`,
  openTimeMs: 1_000_000_000 + i * 5 * 60_000,
  open: o, high: h, low: l, close: cl,
});

describe("Stage 4 · replay controller", () => {
  const candles = [
    c(0, 18500, 18510, 18490, 18495),
    c(1, 18470, 18475, 18425, 18428),
    c(2, 18428, 18445, 18425, 18440),
    c(3, 18441, 18490, 18440, 18485),
  ];
  const noCube = {
    starBias: "BULLISH" as const,
    retrograde: "UNKNOWN" as const,
    aspect: "UNKNOWN" as const,
    priceAction: "UNKNOWN" as const,
    ema13: "UNKNOWN" as const,
    rsi14: "UNKNOWN" as const,
  };

  it("step forward reveals candles progressively", () => {
    let s = initReplay({
      instrument: "NIFTY50",
      ranked: [level],
      candles,
      cubeInputs: noCube,
    });
    expect(computeReplayView(s).totalCandles).toBe(0);
    s = stepReplay(s, 1);
    expect(computeReplayView(s).totalCandles).toBe(1);
    s = stepReplay(s, 1);
    s = stepReplay(s, 1);
    expect(computeReplayView(s).totalCandles).toBe(3);
  });

  it("step backward reveals fewer candles; snapshot immutable", () => {
    let s = initReplay({
      instrument: "NIFTY50",
      ranked: [level],
      candles,
      cubeInputs: noCube,
    });
    s = jumpReplay(s, 3);
    const at3 = computeReplayView(s);
    s = stepReplay(s, -1);
    const at2 = computeReplayView(s);
    expect(at3.totalCandles).toBe(3);
    expect(at2.totalCandles).toBe(2);
    // The revealed level metadata is identical (snapshot immutable).
    expect(at3.perLevel[0].level).toEqual(at2.perLevel[0].level);
  });

  it("jump beyond bounds clamps; restart returns to 0", () => {
    let s = initReplay({
      instrument: "NIFTY50",
      ranked: [level],
      candles,
      cubeInputs: noCube,
    });
    s = jumpReplay(s, 999);
    expect(s.cursor).toBe(candles.length);
    s = restartReplay(s);
    expect(s.cursor).toBe(0);
  });

  it("deterministic: same cursor → same simulation", () => {
    const s = jumpReplay(
      initReplay({
        instrument: "NIFTY50",
        ranked: [level],
        candles,
        cubeInputs: noCube,
      }),
      3,
    );
    // processingMicros is a wall-clock timing metric — exclude from determinism.
    const strip = (v: ReturnType<typeof computeReplayView>) =>
      JSON.stringify({ ...v, processingMicros: 0 });
    expect(strip(computeReplayView(s))).toBe(strip(computeReplayView(s)));
  });
});