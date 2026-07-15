import { describe, it, expect } from "vitest";
import {
  buildAbsoluteIntradayLevels,
  computeCycleBounds,
  computePlanetLevels,
} from "./gann-absolute-levels";
import {
  AbsoluteDegreeValidationError,
  GANN_PLANETS,
  assertAbsoluteDegree,
  type PlanetAbsoluteInput,
} from "./gann-intraday.types";
import { INTRADAY_FORMULA_VERSIONS } from "./engine-version";

const nine = (degrees: number[]): PlanetAbsoluteInput[] =>
  GANN_PLANETS.map((p, i) => ({
    planet: p,
    absoluteDegree: assertAbsoluteDegree(p, degrees[i] ?? 0),
  }));

describe("Phase 21.2 · absolute-degree guard", () => {
  it("rejects negative, >=360, NaN", () => {
    expect(() => assertAbsoluteDegree("Sun", -1)).toThrow(AbsoluteDegreeValidationError);
    expect(() => assertAbsoluteDegree("Sun", 360)).toThrow(AbsoluteDegreeValidationError);
    expect(() => assertAbsoluteDegree("Sun", NaN)).toThrow(AbsoluteDegreeValidationError);
  });
  it("accepts 0 and just-below-360", () => {
    expect(assertAbsoluteDegree("Sun", 0)).toBe(0);
    expect(assertAbsoluteDegree("Sun", 359.999)).toBe(359.999);
  });
});

describe("Phase 21.2 · computeCycleBounds", () => {
  it("fixture A · previousClose 18665", () => {
    const c = computeCycleBounds(18665);
    expect(c).toMatchObject({
      lowerCycleIndex: 51,
      upperCycleIndex: 52,
      lowerMultiple: 18360,
      upperMultiple: 18720,
      exactBoundary: false,
    });
  });
  it("fixture B · previousClose 43677", () => {
    const c = computeCycleBounds(43677);
    expect(c).toMatchObject({
      lowerCycleIndex: 121,
      upperCycleIndex: 122,
      lowerMultiple: 43560,
      upperMultiple: 43920,
      exactBoundary: false,
    });
  });
  it("fixture C · exact 360-boundary applies provisional policy", () => {
    const c = computeCycleBounds(18720);
    expect(c.exactBoundary).toBe(true);
    expect(c.lowerMultiple).toBe(18720);
    expect(c.upperMultiple).toBe(19080);
  });
});

describe("Phase 21.2 · L1/L2/L3/L4 formulas", () => {
  it("Sun @70° with prevClose 18665", () => {
    const cycles = computeCycleBounds(18665);
    const levels = computePlanetLevels(
      { planet: "Sun", absoluteDegree: assertAbsoluteDegree("Sun", 70) },
      cycles,
      100,
    );
    const byKey = Object.fromEntries(levels.map((l) => [l.sourceLevel, l.value]));
    expect(byKey.L1).toBe(18790); // 18720 + 70
    expect(byKey.L2).toBe(18430); // 18360 + 70
    expect(byKey.L3).toBe(18650); // 18720 - 70
    expect(byKey.L4).toBe(18290); // 18360 - 70
  });
  it("degree 0 collapses L1=upper, L2=lower", () => {
    const cycles = computeCycleBounds(18665);
    const levels = computePlanetLevels(
      { planet: "Moon", absoluteDegree: assertAbsoluteDegree("Moon", 0) },
      cycles,
      100,
    );
    expect(levels.find((l) => l.sourceLevel === "L1")!.value).toBe(18720);
    expect(levels.find((l) => l.sourceLevel === "L2")!.value).toBe(18360);
  });
  it("Rahu/Ketu 180° opposition sanity", () => {
    const cycles = computeCycleBounds(18665);
    const r = computePlanetLevels(
      { planet: "Rahu", absoluteDegree: assertAbsoluteDegree("Rahu", 45) },
      cycles,
      100,
    );
    const k = computePlanetLevels(
      { planet: "Ketu", absoluteDegree: assertAbsoluteDegree("Ketu", 225) },
      cycles,
      100,
    );
    // L1(Rahu) - L1(Ketu) should differ by 180
    expect(
      Math.abs(
        r.find((l) => l.sourceLevel === "L1")!.value -
          k.find((l) => l.sourceLevel === "L1")!.value,
      ),
    ).toBe(180);
  });
});

describe("Phase 21.2 · buildAbsoluteIntradayLevels", () => {
  const bundle = buildAbsoluteIntradayLevels({
    instrument: "NIFTY50",
    previousClose: 18665,
    planets: nine([70, 158, 63, 12, 200, 90, 300, 45, 225]),
  });
  it("emits exactly 36 raw levels", () => {
    expect(bundle.levels).toHaveLength(36);
  });
  it("all levels carry formula version = GANN_ASTRO_INTRADAY_ABSOLUTE_V1", () => {
    for (const l of bundle.levels)
      expect(l.formulaVersion).toBe(
        INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      );
  });
  it("above-close ⇒ RESISTANCE/SELL, below-close ⇒ SUPPORT/BUY", () => {
    for (const l of bundle.levels) {
      if (l.value > 18665) {
        expect(l.side).toBe("RESISTANCE");
        expect(l.tradeBias).toBe("SELL");
      } else if (l.value < 18665) {
        expect(l.side).toBe("SUPPORT");
        expect(l.tradeBias).toBe("BUY");
      }
    }
  });
  it("NIFTY safe zone is ±100 vs previous close", () => {
    for (const l of bundle.levels) {
      const d = Math.abs(l.value - 18665);
      expect(l.safety).toBe(d >= 100 ? "SAFE" : "RISKY");
    }
  });
  it("throws when a planet is missing", () => {
    expect(() =>
      buildAbsoluteIntradayLevels({
        instrument: "NIFTY50",
        previousClose: 18665,
        planets: nine([70, 158, 63, 12, 200, 90, 300, 45, 225]).slice(0, 8),
      }),
    ).toThrow(/Missing absolute degrees/);
  });
  it("throws for unsupported instrument", () => {
    expect(() =>
      buildAbsoluteIntradayLevels({
        // @ts-expect-error — testing runtime guard
        instrument: "GOLD",
        previousClose: 60000,
        planets: nine([70, 158, 63, 12, 200, 90, 300, 45, 225]),
      }),
    ).toThrow(/not validated/);
  });
});

describe("Phase 21.2 · BANKNIFTY safe distance", () => {
  it("uses ±300 threshold", () => {
    const bundle = buildAbsoluteIntradayLevels({
      instrument: "BANKNIFTY",
      previousClose: 43677,
      planets: nine([70, 158, 63, 12, 200, 90, 300, 45, 225]),
    });
    for (const l of bundle.levels) {
      const d = Math.abs(l.value - 43677);
      expect(l.safety).toBe(d >= 300 ? "SAFE" : "RISKY");
    }
  });
});