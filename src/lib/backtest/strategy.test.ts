import { describe, expect, it } from "vitest";
import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";
import {
  STRATEGY_REGISTRY,
  UnifiedBacktestConfigError,
  astroStrategyAdapter,
  getStrategyAdapter,
  listStrategies,
  validateUnifiedConfig,
} from "./strategy";
import { runUnifiedBacktest } from "./unified";

describe("HistoricalStrategyAdapter registry", () => {
  it("registers ASTRO/SMC/HYBRID/BASELINE", () => {
    const ids = listStrategies().map((s) => s.strategyId);
    expect(ids).toEqual(["ASTRO", "SMC", "ASTRO_SMC_HYBRID", "BASELINE"]);
  });

  it("ASTRO/SMC/Hybrid are AVAILABLE; Baseline remains COMING_NEXT", () => {
    expect(astroStrategyAdapter.availability).toBe("AVAILABLE");
    expect(STRATEGY_REGISTRY.SMC.availability).toBe("AVAILABLE");
    expect(STRATEGY_REGISTRY.ASTRO_SMC_HYBRID.availability).toBe("AVAILABLE");
    expect(STRATEGY_REGISTRY.BASELINE.availability).toBe("COMING_NEXT");
  });

  it("Astro strategy exposes all three formula versions", () => {
    expect(astroStrategyAdapter.supportedFormulaVersions).toEqual(
      expect.arrayContaining([
        INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
        INTRADAY_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
        INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      ]),
    );
  });

  it("resolves formula adapters by id and returns null on miss", () => {
    const a = astroStrategyAdapter.resolveFormulaAdapter(
      INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
    );
    expect(a?.id).toBe(INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1);
    expect(
      astroStrategyAdapter.resolveFormulaAdapter("NOT_A_FORMULA" as never),
    ).toBeNull();
  });

  it("getStrategyAdapter returns registry entries", () => {
    expect(getStrategyAdapter("ASTRO")).toBe(astroStrategyAdapter);
  });
});

describe("validateUnifiedConfig — typed errors", () => {
  it("throws STRATEGY_ADAPTER_NOT_AVAILABLE for Baseline", () => {
    try {
      validateUnifiedConfig({
        strategy: "BASELINE",
        formula: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
        instrument: "NIFTY50",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnifiedBacktestConfigError);
      expect((e as UnifiedBacktestConfigError).code).toBe(
        "STRATEGY_ADAPTER_NOT_AVAILABLE",
      );
    }
  });

  it("resolves Hybrid formula adapter", () => {
    const v = validateUnifiedConfig({
      strategy: "ASTRO_SMC_HYBRID",
      formula: INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1,
      instrument: "NIFTY50",
      timeframe: "5m",
    });
    expect(v.strategy.strategyId).toBe("ASTRO_SMC_HYBRID");
    expect(v.formula.id).toBe(INTRADAY_FORMULA_VERSIONS.ASTRO_SMC_HYBRID_V1);
  });

  it("throws UNSUPPORTED_FORMULA_FOR_STRATEGY", () => {
    expect(() =>
      validateUnifiedConfig({
        strategy: "ASTRO",
        formula: "NOT_A_FORMULA" as never,
        instrument: "NIFTY50",
      }),
    ).toThrowError(/UNSUPPORTED_FORMULA_FOR_STRATEGY|not supported/);
  });

  it("throws UNSUPPORTED_INSTRUMENT", () => {
    try {
      validateUnifiedConfig({
        strategy: "ASTRO",
        formula: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
        instrument: "XAUUSD",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as UnifiedBacktestConfigError).code).toBe(
        "UNSUPPORTED_INSTRUMENT",
      );
    }
  });

  it("throws UNSUPPORTED_TIMEFRAME for daily formula on 5m", () => {
    try {
      validateUnifiedConfig({
        strategy: "ASTRO",
        formula: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
        instrument: "NIFTY50",
        timeframe: "5m",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as UnifiedBacktestConfigError).code).toBe(
        "UNSUPPORTED_TIMEFRAME",
      );
    }
  });

  it("accepts a valid Astro sign-degree config", () => {
    const v = validateUnifiedConfig({
      strategy: "ASTRO",
      formula: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
      instrument: "NIFTY50",
      timeframe: "1d",
    });
    expect(v.strategy.strategyId).toBe("ASTRO");
    expect(v.formula.dataGranularity).toBe("1d");
  });
});

describe("runUnifiedBacktest dispatch", () => {
  it("refuses SMC with a non-SMC formula", async () => {
    await expect(
      runUnifiedBacktest({
        strategy: "SMC",
        formula: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
        instrument: "NIFTY50",
        from: "2024-01-01",
        to: "2024-01-31",
      }),
    ).rejects.toBeInstanceOf(UnifiedBacktestConfigError);
  });

  it("runs SMC through the shared runner with empty extras", async () => {
    const res = await runUnifiedBacktest({
      strategy: "SMC",
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-31",
      extras: { candles: [], signals: [] },
    });
    expect(res.formulaVersion).toBe(INTRADAY_FORMULA_VERSIONS.SMC_V1);
    expect(res.trades).toEqual([]);
    expect(res.runId).toContain(INTRADAY_FORMULA_VERSIONS.SMC_V1);
  });

  it("runs the Astro sign-degree adapter through the shared runner", async () => {
    const res = await runUnifiedBacktest({
      strategy: "ASTRO",
      formula: INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-31",
      // Empty candles+positions → zero sessions, zero trades. This proves the
      // dispatch reaches the shared runner without invoking any live data
      // fetching.
      extras: { candles: [], positions: {} },
    });
    expect(res.formulaVersion).toBe(
      INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
    );
    expect(res.trades).toEqual([]);
    expect(res.runId).toContain(
      INTRADAY_FORMULA_VERSIONS.GANN_SIGN_DEGREE_TABLE_V1_1,
    );
  });
});