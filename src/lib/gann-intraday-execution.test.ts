import { describe, it, expect } from "vitest";
import {
  initExecution,
  onTouch,
  onCandleClose,
  onRetest,
  expireAtSessionClose,
} from "./gann-intraday-execution";
import type { RankedLevel } from "./gann-level-ranking";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const level = (over: Partial<RankedLevel> = {}): RankedLevel => ({
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
  pivotConfluence: "WEAK",
  nearestPivotDistance: 10,
  ...over,
});

describe("Phase 21.2 · execution state machine", () => {
  it("BUY: green 5m candle within deviation ⇒ ENTRY_READY with SL/target", () => {
    let p = initExecution("NIFTY50", level());
    p = onTouch(p);
    p = onCandleClose("NIFTY50", p, { open: 18420, high: 18445, low: 18415, close: 18440 });
    expect(p.state).toBe("ENTRY_READY");
    expect(p.entry).toBe(18440);
    expect(p.stopLoss).toBe(18440 - 51);
    expect(p.target).toBe(18440 + 51);
  });
  it("BUY: red candle ⇒ INVALIDATED", () => {
    let p = initExecution("NIFTY50", level());
    p = onTouch(p);
    p = onCandleClose("NIFTY50", p, { open: 18440, high: 18445, low: 18400, close: 18410 });
    expect(p.state).toBe("INVALIDATED");
  });
  it("BUY: close beyond max deviation ⇒ WAITING_RETEST; retest fills entry", () => {
    let p = initExecution("NIFTY50", level());
    p = onTouch(p);
    // 15 pt max — close is 30 pts above level
    p = onCandleClose("NIFTY50", p, { open: 18430, high: 18465, low: 18425, close: 18460 });
    expect(p.state).toBe("WAITING_RETEST");
    p = onRetest("NIFTY50", p, 18442);
    expect(p.state).toBe("ENTRY_READY");
    expect(p.entry).toBe(18442);
  });
  it("SELL: red candle within deviation ⇒ ENTRY_READY", () => {
    let p = initExecution("NIFTY50", level({
      side: "RESISTANCE",
      tradeBias: "SELL",
      value: 18790,
    }));
    p = onTouch(p);
    p = onCandleClose("NIFTY50", p, { open: 18795, high: 18800, low: 18775, close: 18780 });
    expect(p.state).toBe("ENTRY_READY");
    expect(p.stopLoss).toBe(18780 + 51);
    expect(p.target).toBe(18780 - 51);
  });
  it("BANKNIFTY uses 101 pt stop and 30 pt max deviation", () => {
    let p = initExecution(
      "BANKNIFTY",
      level({ value: 43560, previousClose: 43677 }),
    );
    p = onTouch(p);
    p = onCandleClose("BANKNIFTY", p, { open: 43555, high: 43580, low: 43550, close: 43575 });
    expect(p.state).toBe("ENTRY_READY");
    expect(p.stopLoss).toBe(43575 - 101);
    expect(p.target).toBe(43575 + 101);
  });
  it("session close invalidates non-ENTRY_READY plans", () => {
    const p = initExecution("NIFTY50", level());
    expect(expireAtSessionClose(p).state).toBe("INVALIDATED");
  });
});