import { describe, it, expect } from "vitest";
import { evaluateCube } from "./gann-cube-engine";
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

describe("Phase 21.2 · Cube setup gate", () => {
  it("mandatory pass yields BUY action", () => {
    const r = evaluateCube({ level: lvl(), starBias: "BULLISH" });
    expect(r.mandatoryPassed).toBe(true);
    expect(r.action).toBe("BUY");
  });
  it("star conflict blocks trade", () => {
    const r = evaluateCube({ level: lvl(), starBias: "BEARISH" });
    expect(r.mandatoryPassed).toBe(false);
    expect(r.action).toBe("NO_TRADE_CONFLICT");
  });
  it("missing pivot confluence ⇒ WAIT", () => {
    const r = evaluateCube({
      level: lvl({ pivotConfluence: "NONE" }),
      starBias: "BULLISH",
    });
    expect(r.mandatoryPassed).toBe(false);
    expect(r.action).toBe("WAIT");
  });
  it("any conflicting optional condition blocks trade", () => {
    const r = evaluateCube({
      level: lvl(),
      starBias: "BULLISH",
      retrograde: "CONFLICT",
    });
    expect(r.action).toBe("NO_TRADE_CONFLICT");
  });
  it("grades A/B/C based on aligned count", () => {
    const a = evaluateCube({
      level: lvl({ exact360Confluence: true }),
      starBias: "BULLISH",
      retrograde: "ALIGNED",
      aspect: "ALIGNED",
    });
    expect(a.cubeGrade).toBe("A");
  });
});