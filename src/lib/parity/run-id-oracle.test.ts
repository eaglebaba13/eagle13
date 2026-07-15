// Phase 21.3d-parity-α · Public Run-ID oracle.
//
// Locks the current public Run-ID hashes across all three production paths.
// These IDs are surfaced to users (headers, exports, cache keys). Any change
// silently breaks bookmarks, cached reports, and historical reproducibility.
//
// Values in this file are the exact strings emitted by the current, unchanged
// production hashers for the canonical golden inputs. If any test fails, do
// NOT update the expected string — a parity-β wrapper conversion must be
// rejected until the semantic change is understood and approved.

import { describe, expect, it } from "vitest";
import {
  BACKTEST_ENGINE_VERSION,
  BACKTEST_FORMULA_VERSION,
  computeRunId as computeLegacyBacktestRunId,
  hashConfig,
} from "../backtest-engine";
import { computeRunId as computeAbsoluteRunId } from "../gann-formula-compare";
import { computeUnifiedRunId } from "../backtest/run-id";
import {
  DEFAULT_ASTRO_FORMULA_VERSION,
  INTRADAY_FORMULA_VERSIONS,
} from "../engine-version";
import {
  BACKTEST_GOLDEN_CONFIG_HASH,
  BACKTEST_GOLDEN_INPUT,
  BACKTEST_GOLDEN_RUN_ID,
} from "../__fixtures__/parity/backtest-golden";
import {
  HISTORY_GOLDEN_INPUT,
  HISTORY_GOLDEN_RUN_ID,
} from "../__fixtures__/parity/history-golden";

describe("Phase 21.3d-parity-α · legacy daily-astro Run-ID (backtest-engine)", () => {
  it("Sign-Degree conservative fabricate no-costs → locked string", () => {
    // Compute fresh to prove determinism and lock format:
    //   `${symbol}:${from}:${to}:${policy}:${invalidSetupPolicy}:${engineVersion}:${formulaVersion}:${astroFormulaVersion}:${configHash8}`
    const fresh = computeLegacyBacktestRunId({
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
    expect(fresh).toBe(BACKTEST_GOLDEN_RUN_ID);

    // Format lock — must be nine colon-separated tokens ending in the config hash.
    const parts = fresh.split(":");
    expect(parts).toHaveLength(9);
    expect(parts[0]).toBe("NIFTY50");
    expect(parts[1]).toBe("2026-04-01");
    expect(parts[2]).toBe("2026-06-30");
    expect(parts[3]).toBe("conservative");
    expect(parts[4]).toBe("fabricate");
    expect(parts[5]).toBe(BACKTEST_ENGINE_VERSION);
    expect(parts[6]).toBe(BACKTEST_FORMULA_VERSION);
    expect(parts[7]).toBe(DEFAULT_ASTRO_FORMULA_VERSION);
    expect(parts[8]).toMatch(/^[0-9a-f]{8}$/);
  });

  it("[LATENT BEHAVIOUR] costs perturbation does NOT change legacy Run-ID (nested keys elided by hashConfig replacer)", () => {
    // The legacy `hashConfig` uses `JSON.stringify(input, Object.keys(input).sort())`,
    // and the replacer-array form filters keys at EVERY nesting level. Because
    // `costs`' nested fields (slippagePct / brokerageFlat / brokeragePct /
    // taxesPct) are not in the top-level key list, they are omitted from the
    // serialised payload and never influence the resulting hash. This is a
    // production quirk — surfaced here so β cannot silently "fix" it and
    // invalidate every historical Run-ID at the same time.
    const perturbed = computeLegacyBacktestRunId({
      symbol: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: BACKTEST_GOLDEN_INPUT.policy,
      invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
      costs: { slippagePct: 0.05, brokerageFlat: 20, brokeragePct: 0.03, taxesPct: 0.1 },
      dataSource: BACKTEST_GOLDEN_INPUT.dataSource,
      timezone: BACKTEST_GOLDEN_INPUT.timezone,
      astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
    });
    expect(perturbed).toBe(BACKTEST_GOLDEN_RUN_ID);
  });

  it("policy perturbation DOES change legacy Run-ID (top-level key survives filter)", () => {
    const perturbed = computeLegacyBacktestRunId({
      symbol: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: "optimistic",
      invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
      costs: BACKTEST_GOLDEN_INPUT.costs,
      dataSource: BACKTEST_GOLDEN_INPUT.dataSource,
      timezone: BACKTEST_GOLDEN_INPUT.timezone,
      astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
    });
    expect(perturbed).not.toBe(BACKTEST_GOLDEN_RUN_ID);
    expect(perturbed.split(":")[3]).toBe("optimistic");
  });

  it("hashConfig is deterministic and 8-char hex", () => {
    const h = hashConfig({
      symbol: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: BACKTEST_GOLDEN_INPUT.policy,
      invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
      costs: BACKTEST_GOLDEN_INPUT.costs,
    });
    expect(h).toBe(BACKTEST_GOLDEN_CONFIG_HASH);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it("astroFormulaVersion perturbation shifts the Run-ID", () => {
    const legacy = computeLegacyBacktestRunId({
      symbol: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: BACKTEST_GOLDEN_INPUT.policy,
      invalidSetupPolicy: BACKTEST_GOLDEN_INPUT.invalidSetupPolicy,
      costs: BACKTEST_GOLDEN_INPUT.costs,
      dataSource: BACKTEST_GOLDEN_INPUT.dataSource,
      timezone: BACKTEST_GOLDEN_INPUT.timezone,
      astroFormulaVersion: "LEGACY_EAGLEBABA_CASCADE_V1",
    });
    expect(legacy).not.toBe(BACKTEST_GOLDEN_RUN_ID);
    expect(legacy.split(":")[7]).toBe("LEGACY_EAGLEBABA_CASCADE_V1");
  });
});

describe("Phase 21.3d-parity-α · legacy absolute-intraday Run-ID (gann-formula-compare)", () => {
  it("Absolute-Intraday conservative → locked string", () => {
    const fresh = computeAbsoluteRunId({
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
    expect(fresh).toBe(HISTORY_GOLDEN_RUN_ID);
    // Format lock: `${formulaVersion}:${8-char-hex}`.
    expect(fresh.startsWith("GANN_ASTRO_INTRADAY_ABSOLUTE_V1:")).toBe(true);
    expect(fresh.split(":")[1]).toMatch(/^[0-9a-f]{8}$/);
  });

  it("cost/slippage perturbation shifts the hash", () => {
    const a = computeAbsoluteRunId({
      formulaVersion: INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1,
      instrument: HISTORY_GOLDEN_INPUT.instrument,
      from: HISTORY_GOLDEN_INPUT.from,
      to: HISTORY_GOLDEN_INPUT.to,
      ambiguousPolicy: HISTORY_GOLDEN_INPUT.ambiguousPolicy,
      costs: { cost: 0, slippage: 0 },
    });
    expect(a).not.toBe(HISTORY_GOLDEN_RUN_ID);
    expect(a.split(":")[0]).toBe("GANN_ASTRO_INTRADAY_ABSOLUTE_V1");
  });
});

describe("Phase 21.3d-parity-α · unified Run-ID (backtest/run-id)", () => {
  it("unified ID is deterministic and prefixed by formula version", () => {
    const id = computeUnifiedRunId({
      formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
      instrument: "NIFTY50",
      from: "2026-04-01",
      to: "2026-06-30",
      policy: "conservative",
      ambiguousPolicy: "conservative",
      costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 },
      source: "yahoo-daily",
      dataGranularity: "1d",
      engineVersion: "1.0.0",
      executionVersion: "1.0.0",
      cubeVersion: "1.0.0",
      policyVersion: "1.0.0",
      ingestVersion: "",
    });
    expect(id).toBe(
      computeUnifiedRunId({
        formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
        instrument: "NIFTY50",
        from: "2026-04-01",
        to: "2026-06-30",
        policy: "conservative",
        ambiguousPolicy: "conservative",
        costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 },
        source: "yahoo-daily",
        dataGranularity: "1d",
        engineVersion: "1.0.0",
        executionVersion: "1.0.0",
        cubeVersion: "1.0.0",
        policyVersion: "1.0.0",
        ingestVersion: "",
      }),
    );
    expect(id.startsWith("GANN_SIGN_DEGREE_TABLE_V1_1:")).toBe(true);
    expect(id.split(":")[1]).toMatch(/^[0-9a-f]{8}$/);
  });

  it("unified ID is DIFFERENT from the legacy Sign-Degree Run-ID (β must dual-track)", () => {
    const unified = computeUnifiedRunId({
      formulaVersion: "GANN_SIGN_DEGREE_TABLE_V1_1",
      instrument: BACKTEST_GOLDEN_INPUT.symbol,
      from: BACKTEST_GOLDEN_INPUT.from,
      to: BACKTEST_GOLDEN_INPUT.to,
      policy: BACKTEST_GOLDEN_INPUT.policy,
      ambiguousPolicy: BACKTEST_GOLDEN_INPUT.policy,
      costs: BACKTEST_GOLDEN_INPUT.costs,
      source: BACKTEST_GOLDEN_INPUT.dataSource,
      dataGranularity: "1d",
      engineVersion: BACKTEST_ENGINE_VERSION,
      executionVersion: "1.0.0",
      cubeVersion: "1.0.0",
      policyVersion: "1.0.0",
    });
    // Namespace prefix differs — legacy is `NIFTY50:...`, unified is `GANN_SIGN_DEGREE_TABLE_V1_1:...`.
    // This proves β MUST NOT replace `runId` — it must set `unifiedRunId` alongside.
    expect(unified).not.toBe(BACKTEST_GOLDEN_RUN_ID);
    expect(unified.split(":")[0]).toBe("GANN_SIGN_DEGREE_TABLE_V1_1");
    expect(BACKTEST_GOLDEN_RUN_ID.split(":")[0]).toBe("NIFTY50");
  });
});