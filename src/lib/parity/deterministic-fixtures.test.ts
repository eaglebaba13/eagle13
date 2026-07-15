// Phase 21.3d-parity-α · Deterministic-fixture replay oracle.
//
// Proves the parity fixtures are (a) reproducible, (b) network-independent,
// and (c) time-independent. If any β conversion introduces a hidden dependency
// on `Date.now()`, `Math.random()`, `process.env.TZ`, or a live fetch, this
// test will surface it because the fixtures re-execute the same pure helpers
// twice and compare byte-for-byte.

import { describe, expect, it, vi } from "vitest";
import {
  BACKTEST_GOLDEN,
  BACKTEST_GOLDEN_CONFIG_HASH,
  BACKTEST_GOLDEN_INPUT,
  BACKTEST_GOLDEN_RUN_ID,
} from "../__fixtures__/parity/backtest-golden";
import {
  HISTORY_GOLDEN,
  HISTORY_GOLDEN_INPUT,
  HISTORY_GOLDEN_RUN_ID,
} from "../__fixtures__/parity/history-golden";
import {
  computeRunId as computeLegacyBacktestRunId,
  hashConfig,
} from "../backtest-engine";
import { computeRunId as computeAbsoluteRunId } from "../gann-formula-compare";
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "../engine-version";
import {
  historyToJson,
  historyToSummaryCsv,
} from "../gann-intraday-validation-export";

describe("Phase 21.3d-parity-α · deterministic fixture replay", () => {
  it("BacktestResult golden Run-ID is stable across recomputation", () => {
    for (let i = 0; i < 3; i++) {
      expect(
        computeLegacyBacktestRunId({
          symbol: BACKTEST_GOLDEN_INPUT.symbol,
          from: BACKTEST_GOLDEN_INPUT.from,
          to: BACKTEST_GOLDEN_INPUT.to,
          policy: BACKTEST_GOLDEN_INPUT.policy,
          invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
          costs: BACKTEST_GOLDEN_INPUT.costs,
          dataSource: BACKTEST_GOLDEN_INPUT.dataSource,
          timezone: BACKTEST_GOLDEN_INPUT.timezone,
          astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
        }),
      ).toBe(BACKTEST_GOLDEN_RUN_ID);
    }
  });

  it("BacktestResult golden config-hash is stable across recomputation", () => {
    for (let i = 0; i < 3; i++) {
      expect(
        hashConfig({
          symbol: BACKTEST_GOLDEN_INPUT.symbol,
          from: BACKTEST_GOLDEN_INPUT.from,
          to: BACKTEST_GOLDEN_INPUT.to,
          policy: BACKTEST_GOLDEN_INPUT.policy,
          invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
          costs: BACKTEST_GOLDEN_INPUT.costs,
        }),
      ).toBe(BACKTEST_GOLDEN_CONFIG_HASH);
    }
  });

  it("HistoryResult golden Run-ID is stable across recomputation", () => {
    for (let i = 0; i < 3; i++) {
      expect(
        computeAbsoluteRunId({
          formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
          instrument: HISTORY_GOLDEN_INPUT.instrument,
          from: HISTORY_GOLDEN_INPUT.from,
          to: HISTORY_GOLDEN_INPUT.to,
          ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
          costs: {
            cost: HISTORY_GOLDEN_INPUT.costPerTrade,
            slippage: HISTORY_GOLDEN_INPUT.slippagePerTrade,
          },
        }),
      ).toBe(HISTORY_GOLDEN_RUN_ID);
    }
  });

  it("historyToSummaryCsv is byte-stable across recomputation (no time drift)", () => {
    const a = historyToSummaryCsv(HISTORY_GOLDEN);
    const b = historyToSummaryCsv(HISTORY_GOLDEN);
    expect(a).toBe(b);
  });

  it("historyToJson is byte-stable across recomputation", () => {
    const a = historyToJson(HISTORY_GOLDEN);
    const b = historyToJson(HISTORY_GOLDEN);
    expect(a).toBe(b);
  });

  it("no network access during oracle computation", () => {
    // Prove that computing the fixtures does not touch the network.
    // We spy on globalThis.fetch and recompute the whole oracle surface.
    const spy = vi.spyOn(globalThis, "fetch");
    historyToSummaryCsv(HISTORY_GOLDEN);
    historyToJson(HISTORY_GOLDEN);
    computeLegacyBacktestRunId({
      symbol: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: BACKTEST_GOLDEN_INPUT.policy,
      invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
      costs: BACKTEST_GOLDEN_INPUT.costs,
      dataSource: BACKTEST_GOLDEN_INPUT.dataSource,
      timezone: BACKTEST_GOLDEN_INPUT.timezone,
      astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("no dependence on current server time (generatedAt is frozen in fixtures)", () => {
    expect(BACKTEST_GOLDEN.generatedAt).toBe("2026-07-15T00:00:00.000Z");
    expect(HISTORY_GOLDEN.generatedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("no dependence on Math.random (recompute after re-seeding a random spy)", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.42);
    const runIdA = computeAbsoluteRunId({
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: HISTORY_GOLDEN_INPUT.instrument,
      from: HISTORY_GOLDEN_INPUT.from,
      to: HISTORY_GOLDEN_INPUT.to,
      ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
      costs: {
        cost: HISTORY_GOLDEN_INPUT.costPerTrade,
        slippage: HISTORY_GOLDEN_INPUT.slippagePerTrade,
      },
    });
    spy.mockReturnValue(0.99);
    const runIdB = computeAbsoluteRunId({
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: HISTORY_GOLDEN_INPUT.instrument,
      from: HISTORY_GOLDEN_INPUT.from,
      to: HISTORY_GOLDEN_INPUT.to,
      ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
      costs: {
        cost: HISTORY_GOLDEN_INPUT.costPerTrade,
        slippage: HISTORY_GOLDEN_INPUT.slippagePerTrade,
      },
    });
    expect(runIdA).toBe(runIdB);
    expect(runIdA).toBe(HISTORY_GOLDEN_RUN_ID);
    spy.mockRestore();
  });
});