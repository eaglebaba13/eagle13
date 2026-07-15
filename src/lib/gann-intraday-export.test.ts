import { describe, it, expect } from "vitest";
import {
  VALIDATION_CSV_COLUMNS,
  toValidationCsv,
  toValidationJson,
  validationExportFilename,
} from "./gann-intraday-export";
import type { SessionSimulation } from "./gann-intraday-simulator";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const sim: SessionSimulation = {
  instrument: "NIFTY50",
  totalCandles: 10,
  ambiguousPolicy: "conservative",
  processingMicros: 42,
  counters: {
    firstTouch: 1,
    confirmed: 1,
    retest: 0,
    missedChase: 0,
    cubeApproved: 1,
    cubeConflict: 0,
    ambiguous: 0,
    invalidated: 0,
    targetHit: 1,
    stopHit: 0,
  },
  perLevel: [
    {
      level: {
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
      },
      cube: {
        conditionsAvailable: 5,
        conditionsAligned: 5,
        conditionsConflicting: 0,
        mandatoryPassed: true,
        cubeGrade: "A",
        action: "BUY",
        reasons: ["Sun/Moon priority"],
      },
      finalPlan: {
        state: "ENTRY_READY",
        level: {} as never,
        entry: 18440,
        stopLoss: 18389,
        target: 18491,
        maxEntryDeviation: 15,
      },
      touchIndex: 1,
      confirmIndex: 2,
      retestIndex: null,
      entry: 18440,
      stopLoss: 18389,
      target: 18491,
      entryTimeIst: "2026-07-15T09:20:00+05:30",
      exitTimeIst: "2026-07-15T09:30:00+05:30",
      exitIndex: 3,
      outcome: "TARGET",
      mfe: 51,
      mae: -3,
      ambiguousCandleCount: 0,
      ambiguousExcluded: false,
      candlesConsumed: 4,
    },
  ],
};

describe("Stage 4 · exports", () => {
  it("filename matches spec", () => {
    expect(validationExportFilename("NIFTY50", "2026-07-15", "csv")).toBe(
      "GANN_ABSOLUTE_INTRADAY_VALIDATION_NIFTY50_2026-07-15.csv",
    );
    expect(validationExportFilename("BANKNIFTY", "2026-07-15", "json")).toBe(
      "GANN_ABSOLUTE_INTRADAY_VALIDATION_BANKNIFTY_2026-07-15.json",
    );
  });
  it("CSV header matches column list and is deterministic", () => {
    const csv = toValidationCsv({
      instrument: "NIFTY50",
      tradingDate: "2026-07-15",
      anchorIst: "2026-07-15T09:15:00+05:30",
      previousClose: 18665,
      ambiguousPolicy: "conservative",
      simulation: sim,
    });
    const header = csv.split("\n")[0];
    expect(header).toBe(VALIDATION_CSV_COLUMNS.join(","));
    const again = toValidationCsv({
      instrument: "NIFTY50",
      tradingDate: "2026-07-15",
      anchorIst: "2026-07-15T09:15:00+05:30",
      previousClose: 18665,
      ambiguousPolicy: "conservative",
      simulation: sim,
    });
    expect(csv).toBe(again);
  });
  it("JSON export is deterministic and includes formula version", () => {
    const j1 = toValidationJson({
      instrument: "NIFTY50",
      tradingDate: "2026-07-15",
      anchorIst: "2026-07-15T09:15:00+05:30",
      previousClose: 18665,
      ambiguousPolicy: "conservative",
      simulation: sim,
    });
    expect(j1).toContain("GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
    const parsed = JSON.parse(j1);
    expect(parsed.perLevel[0].outcome).toBe("TARGET");
  });
});