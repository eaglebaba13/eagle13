import { describe, it, expect } from "vitest";
import {
  computeCycles,
  computeAstroLevels,
  computeGannAstroLevels,
  computeAstroLevelsLegacyCascade,
  computeLevelsForVersion,
  buildLevelBoard,
  computeSignal,
  type PlanetRow,
} from "./astro-levels";

/* --------------------------- cycles + levels --------------------------- */

describe("computeCycles", () => {
  it("derives base/upper/lower from prevClose (360 cycle)", () => {
    // 24500 / 360 = 68.05 -> floor 68
    expect(computeCycles(24500)).toEqual({ base: 68, upper: 68 * 360, lower: 67 * 360 });
  });
  it("handles an exact multiple of 360", () => {
    expect(computeCycles(360 * 50)).toEqual({ base: 50, upper: 18000, lower: 17640 });
  });
  it("handles small positive prices", () => {
    expect(computeCycles(100)).toEqual({ base: 0, upper: 0, lower: -360 });
  });
  it("rejects non-positive or non-finite previous close", () => {
    expect(() => computeCycles(0)).toThrow();
    expect(() => computeCycles(-1)).toThrow();
    expect(() => computeCycles(NaN)).toThrow();
    expect(() => computeCycles(Infinity)).toThrow();
  });
});

describe("computeAstroLevels", () => {
  it("applies the GANN_NIFTY_ASTRO_V1_1 formula R1/R2/S1/S2 = upper/lower ± degree", () => {
    const cycles = computeCycles(24500); // upper 24480, lower 24120
    const levels = computeAstroLevels(cycles, 12.7);
    expect(levels).toEqual({
      r1: Math.round(24480 + 12.7),
      r2: Math.round(24480 - 12.7),
      s1: Math.round(24120 + 12.7),
      s2: Math.round(24120 - 12.7),
    });
  });
  it("is deterministic and monotone (r1 >= r2, s1 >= s2)", () => {
    const cycles = computeCycles(24500);
    const l = computeAstroLevels(cycles, 5);
    expect(l.r1).toBeGreaterThanOrEqual(l.r2);
    expect(l.s1).toBeGreaterThanOrEqual(l.s2);
  });
  it("rejects degrees outside [0,30) and non-finite values", () => {
    const cycles = computeCycles(24176);
    expect(() => computeGannAstroLevels(cycles, -0.1)).toThrow();
    expect(() => computeGannAstroLevels(cycles, 30)).toThrow();
    expect(() => computeGannAstroLevels(cycles, 45)).toThrow(); // absolute-longitude bug
    expect(() => computeGannAstroLevels(cycles, NaN)).toThrow();
    expect(() => computeGannAstroLevels(cycles, Infinity)).toThrow();
  });
  it("Math.round half-to-even/up: .49/.50/.51 across a positive boundary", () => {
    // upper = 24120. degree chosen so upper+degree lands on X.49/.50/.51
    expect(computeGannAstroLevels({ base: 67, upper: 24120, lower: 23760 }, 0.49).r1).toBe(24120);
    expect(computeGannAstroLevels({ base: 67, upper: 24120, lower: 23760 }, 0.5).r1).toBe(24121);
    expect(computeGannAstroLevels({ base: 67, upper: 24120, lower: 23760 }, 0.51).r1).toBe(24121);
  });
});

/* ---- Phase 21.0 Gann reference regression: prevClose = 24176 ---- */

describe("GANN_NIFTY_ASTRO_V1_1 — 9-planet reference regression (prevClose 24176)", () => {
  const cycles = computeCycles(24176);
  it("cycles are base=67 / upper=24120 / lower=23760", () => {
    expect(cycles).toEqual({ base: 67, upper: 24120, lower: 23760 });
  });

  const REF: Array<[string, number, { r1: number; r2: number; s1: number; s2: number }]> = [
    ["Sun",     27.02, { r1: 24147, r2: 24093, s1: 23787, s2: 23733 }],
    ["Moon",    15.50, { r1: 24136, r2: 24105, s1: 23776, s2: 23745 }],
    ["Mercury", 21.12, { r1: 24141, r2: 24099, s1: 23781, s2: 23739 }],
    ["Venus",    4.30, { r1: 24124, r2: 24116, s1: 23764, s2: 23756 }],
    ["Mars",    23.77, { r1: 24144, r2: 24096, s1: 23784, s2: 23736 }],
    ["Jupiter",  2.02, { r1: 24122, r2: 24118, s1: 23762, s2: 23758 }],
    ["Saturn",  18.88, { r1: 24139, r2: 24101, s1: 23779, s2: 23741 }],
    ["Rahu",     9.35, { r1: 24129, r2: 24111, s1: 23769, s2: 23751 }],
    ["Ketu",     9.35, { r1: 24129, r2: 24111, s1: 23769, s2: 23751 }],
  ];
  for (const [planet, deg, expected] of REF) {
    it(`${planet} @ ${deg}° matches reference exactly`, () => {
      expect(computeGannAstroLevels(cycles, deg)).toEqual(expected);
    });
  }
});

describe("legacy cascade vs corrected v1.1 — dispatcher", () => {
  const cycles = computeCycles(24500);
  it("legacy still exposes ±360 cascade for old exports", () => {
    const l = computeAstroLevelsLegacyCascade(cycles, 12.7);
    expect(l.r2).toBe(Math.round(24480 - 360 + 12.7));
    expect(l.s2).toBe(Math.round(24120 - 360 + 12.7));
  });
  it("dispatcher default is GANN_NIFTY_ASTRO_V1_1", () => {
    expect(computeLevelsForVersion(cycles, 12.7)).toEqual(computeGannAstroLevels(cycles, 12.7));
  });
  it("dispatcher legacy mode reproduces legacy cascade", () => {
    expect(computeLevelsForVersion(cycles, 12.7, "LEGACY_EAGLEBABA_CASCADE_V1")).toEqual(
      computeAstroLevelsLegacyCascade(cycles, 12.7),
    );
  });
});

/* ------------------------------ level board ------------------------------ */

function planet(partial: Partial<PlanetRow> & Pick<PlanetRow, "planet" | "r1" | "s1" | "r2" | "s2">): PlanetRow {
  return {
    degree: 0,
    absDegree: 0,
    sign: "Aries",
    nakshatra: "Ashwini",
    lord: "Ketu",
    pada: 1,
    speed: 1,
    motion: "Direct",
    retro: false,
    retroBias: "none",
    bull: false,
    bear: false,
    ...partial,
  };
}

describe("buildLevelBoard", () => {
  const planets = [planet({ planet: "Sun", r1: 24500, r2: 24140, s1: 24100, s2: 23740 })];

  it("produces 4 entries per planet sorted by distance", () => {
    const board = buildLevelBoard(planets, 24490);
    expect(board).toHaveLength(4);
    for (let i = 1; i < board.length; i++) {
      expect(board[i].distance).toBeGreaterThanOrEqual(board[i - 1].distance);
    }
  });

  it("marks resistance BROKEN when price is above it and TOUCHED within 2 pts", () => {
    const board = buildLevelBoard(planets, 24501); // above R1 (24500)
    const r1 = board.find((e) => e.kind === "R1")!;
    expect(r1.status).toBe("TOUCHED"); // distance 1 <= 2 wins over broken
    const above = buildLevelBoard(planets, 24520).find((e) => e.kind === "R1")!;
    expect(above.status).toBe("BROKEN");
  });

  it("marks support BROKEN when price is below it", () => {
    const board = buildLevelBoard(planets, 24000); // below S1 (24100)
    const s1 = board.find((e) => e.kind === "S1")!;
    expect(s1.status).toBe("BROKEN");
  });

  it("assigns FLASH proximity within 2 pts and NORMAL when far", () => {
    const flash = buildLevelBoard(planets, 24500).find((e) => e.kind === "R1")!;
    expect(flash.proximity).toBe("FLASH");
    const far = buildLevelBoard(planets, 20000).find((e) => e.kind === "R1")!;
    expect(far.proximity).toBe("NORMAL");
  });
});

/* ------------------------------ signal engine ------------------------------ */

describe("computeSignal (buy / sell / wait)", () => {
  const board = buildLevelBoard(
    [planet({ planet: "Sun", r1: 24500, r2: 24140, s1: 24100, s2: 23740 })],
    24300,
  );

  it("returns WAIT / Neutral for a balanced setup", () => {
    const s = computeSignal({
      price: 24300,
      board,
      moonNakshatra: "Rohini",
      retroCount: 2,
      totalPlanets: 9,
    });
    expect(s.signal).toBe("WAIT");
    expect(s.confidence).toBeGreaterThanOrEqual(0);
    expect(s.confidence).toBeLessThanOrEqual(100);
  });

  it("pushes BUY when bullish factors stack up", () => {
    const s = computeSignal({
      price: 24102, // holding support S1 (24100) within 2 pts
      board: buildLevelBoard(
        [planet({ planet: "Sun", r1: 24500, r2: 24140, s1: 24100, s2: 23740 })],
        24102,
      ),
      moonNakshatra: "Pushya", // bull nakshatra
      retroCount: 0,
      totalPlanets: 9,
      bullRetroCount: 2,
      emaBias: "Bullish",
    });
    expect(s.confidence).toBeGreaterThan(75);
    expect(s.signal).toBe("BUY");
    expect(s.emoji).toBe("🟢");
  });

  it("pushes SELL when bearish factors stack up", () => {
    const s = computeSignal({
      price: 23000, // broke below all supports
      board: buildLevelBoard(
        [planet({ planet: "Sun", r1: 24500, r2: 24140, s1: 24100, s2: 23740 })],
        23000,
      ),
      moonNakshatra: "Bharani", // bear nakshatra
      retroCount: 4,
      totalPlanets: 9,
      bearRetroCount: 2,
      emaBias: "Bearish",
    });
    expect(s.confidence).toBeLessThan(50);
    expect(s.signal).toBe("SELL");
    expect(s.emoji).toBe("🔴");
  });

  it("clamps confidence to [0,100] and always returns a reason", () => {
    const s = computeSignal({
      price: 23000,
      board: buildLevelBoard(
        [planet({ planet: "Sun", r1: 24500, r2: 24140, s1: 24100, s2: 23740 })],
        23000,
      ),
      moonNakshatra: "Bharani",
      retroCount: 9,
      totalPlanets: 9,
      bearRetroCount: 5,
      emaBias: "Bearish",
    });
    expect(s.confidence).toBeGreaterThanOrEqual(0);
    expect(s.reasons.length).toBeGreaterThan(0);
  });

  it("handles an empty board without throwing", () => {
    const s = computeSignal({
      price: 24000,
      board: [],
      moonNakshatra: "Rohini",
      retroCount: 1,
      totalPlanets: 9,
    });
    expect(s.nearest).toBeNull();
    expect(["BUY", "SELL", "WAIT"]).toContain(s.signal);
  });
});