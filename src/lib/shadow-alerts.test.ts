import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  computeShadowEvent,
  appendShadowHistory,
  SHADOW_HISTORY_LIMIT,
  type ShadowInputs,
} from "./shadow-alerts";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";
import type { RankedLevel } from "./gann-level-ranking";
import type { LevelSimulation } from "./gann-intraday-simulator";

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

const makeSim = (over: Partial<LevelSimulation> = {}): LevelSimulation => ({
  level,
  cube: {
    conditionsAvailable: 3,
    conditionsAligned: 3,
    conditionsConflicting: 0,
    mandatoryPassed: true,
    cubeGrade: "A",
    action: "BUY",
    reasons: ["Star aligned"],
  },
  finalPlan: { state: "ENTRY_READY" } as never,
  touchIndex: 3,
  confirmIndex: 4,
  retestIndex: 5,
  entry: 18430,
  stopLoss: 18379,
  target: 18481,
  entryTimeIst: "2026-07-15T10:15:00+05:30",
  exitTimeIst: null,
  exitIndex: null,
  outcome: "OPEN",
  mfe: 0,
  mae: 0,
  ambiguousCandleCount: 0,
  ambiguousExcluded: false,
  candlesConsumed: 10,
  ...over,
});

const baseInputs = (over: Partial<ShadowInputs> = {}): ShadowInputs => ({
  instrument: "NIFTY50",
  tradingDate: "2026-07-15",
  todayIst: "2026-07-15",
  snapshotStatus: "LOCKED",
  formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
  simulation: makeSim(),
  level,
  livePrice: 18435,
  lastCandleClosed: true,
  providerHealthy: true,
  ...over,
});

describe("Phase 21.2 Stage 5 · shadow alerts", () => {
  it("shadow file never imports broker/notification/decision-engine", () => {
    const src = readFileSync(
      new URL("./shadow-alerts.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/broker/);
    expect(src).not.toMatch(/notification/);
    expect(src).not.toMatch(/decision-engine/);
    expect(src).not.toMatch(/notify/);
  });

  it("ENTRY_READY_SHADOW requires locked snapshot + closed candle + cube pass", () => {
    const ev = computeShadowEvent(baseInputs());
    expect(ev.stage).toBe("ENTRY_READY_SHADOW");
    expect(ev.labeledAs).toBe(
      "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    );
  });

  it("blocks with DATA_INCOMPLETE when snapshot is not LOCKED", () => {
    const ev = computeShadowEvent(baseInputs({ snapshotStatus: "PREVIEW" }));
    expect(ev.stage).toBe("DATA_INCOMPLETE");
    expect(ev.reasons.join(" ")).toMatch(/Snapshot not locked/);
  });

  it("blocks with DATA_INCOMPLETE when formula version mismatches", () => {
    const ev = computeShadowEvent(
      baseInputs({ formulaVersion: "LEGACY_EAGLEBABA_CASCADE_V1" }),
    );
    expect(ev.stage).toBe("DATA_INCOMPLETE");
  });

  it("blocks with DATA_INCOMPLETE when candle isn't closed", () => {
    // still ENTRY_READY_SHADOW requires closed candle — no closed = fall to RETEST_WAIT
    const ev = computeShadowEvent(baseInputs({ lastCandleClosed: false }));
    expect(ev.stage).not.toBe("ENTRY_READY_SHADOW");
  });

  it("blocks risky level without pivot confluence", () => {
    const riskyLvl = { ...level, safety: "RISKY" as const, pivotConfluence: "NONE" as const };
    const ev = computeShadowEvent(
      baseInputs({
        level: riskyLvl,
        simulation: makeSim({ level: riskyLvl }),
      }),
    );
    expect(ev.stage).toBe("WAIT");
  });

  it("emits STOP_HIT / TARGET_HIT on resolution", () => {
    expect(computeShadowEvent(baseInputs({ simulation: makeSim({ outcome: "STOP" }) })).stage).toBe("STOP_HIT");
    expect(computeShadowEvent(baseInputs({ simulation: makeSim({ outcome: "TARGET" }) })).stage).toBe("TARGET_HIT");
  });

  it("history rolls at 100 items", () => {
    let h: ReturnType<typeof appendShadowHistory> = [];
    for (let i = 0; i < 105; i++) {
      h = appendShadowHistory(h, computeShadowEvent(baseInputs()));
    }
    expect(h.length).toBe(SHADOW_HISTORY_LIMIT);
  });
});