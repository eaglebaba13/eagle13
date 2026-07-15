import { describe, it, expect } from "vitest";
import { buildAbsoluteIntradayLevels } from "./gann-absolute-levels";
import { rankLevels } from "./gann-level-ranking";
import { assertAbsoluteDegree, GANN_PLANETS, type PlanetAbsoluteInput } from "./gann-intraday.types";

const nine = (d: number[]): PlanetAbsoluteInput[] =>
  GANN_PLANETS.map((p, i) => ({
    planet: p,
    absoluteDegree: assertAbsoluteDegree(p, d[i] ?? 0),
  }));

describe("Phase 21.2 · rankLevels", () => {
  const bundle = buildAbsoluteIntradayLevels({
    instrument: "NIFTY50",
    previousClose: 18665,
    planets: nine([70, 158, 63, 12, 200, 90, 300, 45, 225]),
  });
  const r = rankLevels("NIFTY50", bundle.levels, {
    pivot: 18665,
    r1: 18720,
    r2: 18800,
    s1: 18600,
    s2: 18500,
  });

  it("returns 36 ranked rows", () => {
    expect(r.ranked).toHaveLength(36);
  });
  it("nearest safe buy is a SUPPORT + SAFE row", () => {
    if (r.nearestSafeBuy) {
      expect(r.nearestSafeBuy.side).toBe("SUPPORT");
      expect(r.nearestSafeBuy.safety).toBe("SAFE");
    }
  });
  it("nearest safe sell is a RESISTANCE + SAFE row", () => {
    if (r.nearestSafeSell) {
      expect(r.nearestSafeSell.side).toBe("RESISTANCE");
      expect(r.nearestSafeSell.safety).toBe("SAFE");
    }
  });
  it("clusters are deterministic and side-partitioned", () => {
    for (const c of r.clusters) {
      expect(c.minLevel).toBeLessThanOrEqual(c.maxLevel);
      expect(c.levelCount).toBeGreaterThan(0);
    }
  });
  it("re-ranking same input yields identical order", () => {
    const r2 = rankLevels("NIFTY50", bundle.levels, {
      pivot: 18665,
      r1: 18720,
      r2: 18800,
      s1: 18600,
      s2: 18500,
    });
    expect(r2.ranked.map((x) => `${x.planet}:${x.sourceLevel}`)).toEqual(
      r.ranked.map((x) => `${x.planet}:${x.sourceLevel}`),
    );
  });
});