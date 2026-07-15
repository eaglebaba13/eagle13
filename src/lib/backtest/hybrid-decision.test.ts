import { describe, expect, it } from "vitest";
import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";
import {
  DEFAULT_HYBRID_CONFIG,
  DEFAULT_HYBRID_WEIGHTS,
  bucketFor,
  deriveHybridDecision,
  type AstroInput,
  type SmcInput,
} from "./hybrid-decision";

const ASTRO_V = INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1;
const SMC_V = INTRADAY_FORMULA_VERSIONS.SMC_V1;

function astro(
  direction: AstroInput["direction"],
  confidence = 80,
  fv: string = ASTRO_V,
): AstroInput {
  return { direction, confidence, formulaVersion: fv };
}
function smc(
  signal: SmcInput["signal"],
  score = 70,
  fv: string = SMC_V,
): SmcInput {
  return { signal, score, formulaVersion: fv };
}

describe("deriveHybridDecision", () => {
  it("BUY on BUY+BUY agreement above threshold", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY", 90),
      smc: smc("BUY", 80),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("BUY");
    expect(d.agreementBonus).toBeGreaterThan(0);
    expect(d.hybridScore).toBeGreaterThan(0);
  });

  it("SELL on SELL+SELL agreement above threshold", () => {
    const d = deriveHybridDecision({
      astro: astro("SELL", 85),
      smc: smc("SELL", 90),
      dataQualityPct: 95,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("SELL");
  });

  it("CONFLICT on BUY/SELL and score cannot override", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY", 100),
      smc: smc("SELL", 100),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
      config: {
        weights: { astro: 10, smc: 10, agreement: 10, dataQuality: 10 },
      },
    });
    expect(d.direction).toBe("CONFLICT");
    expect(d.agreementBonus).toBe(0);
  });

  it("CONFLICT on SELL/BUY", () => {
    const d = deriveHybridDecision({
      astro: astro("SELL"),
      smc: smc("BUY"),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("CONFLICT");
  });

  it("WAIT when astro is WAIT and SMC is BUY", () => {
    const d = deriveHybridDecision({
      astro: astro("WAIT"),
      smc: smc("BUY", 90),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("WAIT");
  });

  it("WAIT when SMC is WAIT and astro is BUY", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY"),
      smc: smc("WAIT", 0),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("WAIT");
  });

  it("WAIT when SMC score below threshold on agreement", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY"),
      smc: smc("BUY", 30),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
      config: { scoreThreshold: 55 },
    });
    expect(d.direction).toBe("WAIT");
  });

  it("WAIT when data quality below minimum on agreement", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY"),
      smc: smc("BUY", 90),
      dataQualityPct: 40,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
      config: { minDataQualityPct: 80 },
    });
    expect(d.direction).toBe("WAIT");
  });

  it("DATA_INCOMPLETE when astro missing", () => {
    const d = deriveHybridDecision({
      astro: null,
      smc: smc("BUY"),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("DATA_INCOMPLETE");
  });

  it("DATA_INCOMPLETE when smc missing", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY"),
      smc: null,
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("DATA_INCOMPLETE");
  });

  it("FORMULA_MISMATCH on wrong astro version", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY", 80, "WRONG"),
      smc: smc("BUY"),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("FORMULA_MISMATCH");
  });

  it("FORMULA_MISMATCH on wrong smc version", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY"),
      smc: smc("BUY", 80, "WRONG"),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    expect(d.direction).toBe("FORMULA_MISMATCH");
  });

  it("Score composition matches configured weights", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY", 100),
      smc: smc("BUY", 100),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
    });
    const w = DEFAULT_HYBRID_WEIGHTS;
    const expected =
      100 * w.astro + 100 * w.smc + 100 * w.agreement + 100 * w.dataQuality;
    expect(Math.round(d.hybridScore * 100) / 100).toBeCloseTo(expected, 2);
  });

  it("Weight overrides are honoured", () => {
    const d = deriveHybridDecision({
      astro: astro("BUY", 50),
      smc: smc("BUY", 100),
      dataQualityPct: 100,
      expectedAstroFormula: ASTRO_V,
      expectedSmcFormula: SMC_V,
      config: {
        weights: { astro: 0, smc: 1, agreement: 0, dataQuality: 0 },
      },
    });
    expect(d.astroContribution).toBe(0);
    expect(d.smcContribution).toBeCloseTo(100, 2);
    expect(d.hybridScore).toBeCloseTo(100, 2);
  });

  it("Default config threshold is 55", () => {
    expect(DEFAULT_HYBRID_CONFIG.scoreThreshold).toBe(55);
  });
});

describe("bucketFor", () => {
  it("classifies every direction pair", () => {
    expect(bucketFor("BUY", "BUY")).toBe("ASTRO_BUY_SMC_BUY");
    expect(bucketFor("SELL", "SELL")).toBe("ASTRO_SELL_SMC_SELL");
    expect(bucketFor("BUY", "SELL")).toBe("ASTRO_BUY_SMC_SELL");
    expect(bucketFor("SELL", "BUY")).toBe("ASTRO_SELL_SMC_BUY");
    expect(bucketFor("WAIT", "BUY")).toBe("ASTRO_WAIT_SMC_BUY");
    expect(bucketFor("BUY", "WAIT")).toBe("ASTRO_BUY_SMC_WAIT");
    expect(bucketFor(null, "BUY")).toBe("DATA_INCOMPLETE");
    expect(bucketFor("BUY", null)).toBe("DATA_INCOMPLETE");
  });
});