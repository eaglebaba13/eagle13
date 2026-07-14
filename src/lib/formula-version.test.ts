import { describe, it, expect } from "vitest";
import {
  ASTRO_FORMULA_VERSIONS,
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroCacheKey,
  astroFormulaLabel,
  astroFormulaSlug,
  isLegacyAstroFormula,
  CACHE_NAMESPACE_VERSION,
} from "./engine-version";
import { computeRunId, ZERO_COSTS } from "./backtest-engine";
import { computeReplayRunId } from "./replay-engine";
import {
  assertSingleFormulaVersion,
  MixedFormulaVersionsError,
} from "./signal-analytics";
import type { BacktestResult } from "./backtest.functions";

describe("Phase 21.0A · formula-version propagation", () => {
  it("defaults to GANN_NIFTY_ASTRO_V1_1", () => {
    expect(DEFAULT_ASTRO_FORMULA_VERSION).toBe(
      ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1,
    );
  });

  it("labels each version correctly", () => {
    expect(astroFormulaLabel(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1)).toBe(
      "Gann Nifty Astro v1.1",
    );
    expect(
      astroFormulaLabel(ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1),
    ).toBe("Legacy Cascade v1");
    expect(astroFormulaSlug(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1)).toBe(
      "GANN_ASTRO_V1_1",
    );
    expect(
      astroFormulaSlug(ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1),
    ).toBe("LEGACY_CASCADE_V1");
    expect(isLegacyAstroFormula(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1))
      .toBe(false);
    expect(
      isLegacyAstroFormula(ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1),
    ).toBe(true);
  });

  it("cache keys are namespaced and differ per formula version", () => {
    const a = astroCacheKey("astro");
    const b = astroCacheKey("astro", ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1);
    expect(a).toContain(CACHE_NAMESPACE_VERSION);
    expect(a).toContain(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1);
    expect(b).toContain(ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1);
    expect(a).not.toBe(b);
  });

  it("backtest run id differs by astro formula version", () => {
    const base = {
      symbol: "NIFTY50",
      from: "2024-01-01",
      to: "2024-06-30",
      policy: "conservative" as const,
      invalidSetupPolicy: "fabricate" as const,
      costs: ZERO_COSTS,
      dataSource: "yahoo",
      timezone: "Asia/Kolkata",
    };
    const gann = computeRunId({
      ...base,
      astroFormulaVersion: ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1,
    });
    const legacy = computeRunId({
      ...base,
      astroFormulaVersion: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    });
    expect(gann).not.toBe(legacy);
    expect(gann).toContain(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1);
    expect(legacy).toContain(
      ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    );
    // Default (no astroFormulaVersion passed) equals GANN v1.1 form.
    expect(computeRunId(base)).toBe(gann);
  });

  it("replay run id differs by astro formula version", () => {
    const base = {
      symbol: "NIFTY50",
      date: "2024-06-04",
      timeframe: "15m" as const,
      provider: "yahoo",
      entryMode: "next_open" as const,
      policy: "conservative" as const,
      costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0 },
    };
    const gann = computeReplayRunId({
      ...base,
      astroFormulaVersion: ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1,
    });
    const legacy = computeReplayRunId({
      ...base,
      astroFormulaVersion: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    });
    expect(gann).not.toBe(legacy);
    expect(computeReplayRunId(base)).toBe(gann);
  });

  it("assertSingleFormulaVersion accepts uniform results", () => {
    const r = (v: string) => ({ astroFormulaVersion: v } as unknown as BacktestResult);
    expect(
      assertSingleFormulaVersion([
        r(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1),
        r(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1),
      ]),
    ).toBe(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1);
  });

  it("assertSingleFormulaVersion rejects mixed versions", () => {
    const r = (v: string) => ({ astroFormulaVersion: v } as unknown as BacktestResult);
    expect(() =>
      assertSingleFormulaVersion([
        r(ASTRO_FORMULA_VERSIONS.GANN_NIFTY_ASTRO_V1_1),
        r(ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1),
      ]),
    ).toThrow(MixedFormulaVersionsError);
  });
});