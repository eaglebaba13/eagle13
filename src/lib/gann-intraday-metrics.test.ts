import { describe, it, expect } from "vitest";
import {
  computeCoreMetrics,
  bucketBySafety,
  bucketByCubeGrade,
  bucketByTimeOfDay,
  bucketByPlanet,
  bucketByLevelFamily,
  type SessionResult,
} from "./gann-intraday-metrics";
import type { LevelSimulation, SessionSimulation } from "./gann-intraday-simulator";
import type { RankedLevel } from "./gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const lvl = (over: Partial<RankedLevel> = {}): RankedLevel => ({
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

const perLvl = (
  outcome: LevelSimulation["outcome"],
  over: Partial<LevelSimulation> = {},
): LevelSimulation => ({
  level: lvl(over.level ?? {}),
  cube: {
    conditionsAvailable: 3,
    conditionsAligned: 3,
    conditionsConflicting: 0,
    mandatoryPassed: true,
    cubeGrade: "A",
    action: "BUY",
    reasons: [],
  },
  finalPlan: { state: "ENTRY_READY", entry: 18430, stopLoss: 18379, target: 18481 } as never,
  touchIndex: 0,
  confirmIndex: 1,
  retestIndex: 2,
  entry: 18430,
  stopLoss: 18379,
  target: 18481,
  entryTimeIst: "2026-07-15T10:15:00+05:30",
  exitTimeIst: "2026-07-15T11:00:00+05:30",
  exitIndex: 10,
  outcome,
  mfe: 55,
  mae: -12,
  ambiguousCandleCount: 0,
  ambiguousExcluded: false,
  candlesConsumed: 20,
  ...over,
});

const sim = (perLevel: LevelSimulation[]): SessionSimulation => ({
  instrument: "NIFTY50",
  totalCandles: 75,
  ambiguousPolicy: "conservative",
  perLevel,
  counters: {
    firstTouch: perLevel.filter((p) => p.touchIndex != null).length,
    confirmed: perLevel.filter((p) => p.confirmIndex != null).length,
    retest: perLevel.filter((p) => p.retestIndex != null).length,
    missedChase: perLevel.filter((p) => p.outcome === "MISSED_CHASE").length,
    cubeApproved: perLevel.filter((p) => p.cube.action === "BUY" || p.cube.action === "SELL").length,
    cubeConflict: perLevel.filter((p) => p.cube.action === "NO_TRADE_CONFLICT").length,
    ambiguous: 0,
    invalidated: 0,
    targetHit: perLevel.filter((p) => p.outcome === "TARGET").length,
    stopHit: perLevel.filter((p) => p.outcome === "STOP").length,
  },
  processingMicros: 0,
});

const sessionOf = (perLevel: LevelSimulation[]): SessionResult => ({
  tradingDate: "2026-07-15",
  instrument: "NIFTY50",
  simulation: sim(perLevel),
});

describe("Phase 21.2 Stage 5 · core metrics", () => {
  it("computes win rate, PF, expectancy, netPnL", () => {
    const m = computeCoreMetrics([
      sessionOf([perLvl("TARGET"), perLvl("TARGET"), perLvl("STOP")]),
    ]);
    expect(m.totalTrades).toBe(3);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(1);
    expect(m.winRate).toBeCloseTo(2 / 3);
    // NIFTY targetPoints=51, stopLossPoints=51 → PF = 102/51 = 2
    expect(m.profitFactor).toBeCloseTo(2);
    expect(m.netPnL).toBe(51 + 51 - 51);
  });

  it("tracks drawdown and streaks", () => {
    const m = computeCoreMetrics([
      sessionOf([
        perLvl("TARGET"),
        perLvl("STOP"),
        perLvl("STOP"),
        perLvl("STOP"),
        perLvl("TARGET"),
      ]),
    ]);
    expect(m.maxConsecutiveLosses).toBe(3);
    expect(m.maxConsecutiveWins).toBe(1);
    expect(m.maxDrawdown).toBeGreaterThan(0);
  });

  it("safe vs risky split respects pivot confluence", () => {
    const s = sessionOf([
      perLvl("TARGET", { level: lvl({ safety: "SAFE" }) }),
      perLvl("STOP", { level: lvl({ safety: "RISKY", pivotConfluence: "STRONG" }) }),
      perLvl("TARGET", { level: lvl({ safety: "RISKY", pivotConfluence: "NONE" }) }),
    ]);
    const b = bucketBySafety([s]);
    expect(b.SAFE.totalTrades).toBe(1);
    expect(b.RISKY_PIVOT.totalTrades).toBe(1);
    expect(b.RISKY_NOPIVOT.totalTrades).toBe(1);
  });

  it("groups by cube grade / time-of-day / planet / level family", () => {
    const s = sessionOf([perLvl("TARGET")]);
    expect(bucketByCubeGrade([s]).A.totalTrades).toBe(1);
    expect(bucketByCubeGrade([s]).B.totalTrades).toBe(0);
    expect(bucketByTimeOfDay([s])["10:00-11:30"].totalTrades).toBe(1);
    expect(bucketByPlanet([s]).Sun.totalTrades).toBe(1);
    expect(bucketByLevelFamily([s]).L2.totalTrades).toBe(1);
  });
});