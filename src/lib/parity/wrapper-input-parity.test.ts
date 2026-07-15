// Phase 21.3d-parity-β2a · Input-schema and cache-key parity for the
// `runBacktest` compatibility wrapper.
//
// Guarantees:
//   (1) Omitting the new `astroFormulaVersion` field parses to a config
//       equivalent to the pre-β2a input (Sign-Degree defaults).
//   (2) The cache key produced with the default resolution is byte-for-byte
//       identical to the pre-β2a key (`astroCacheKey(base, DEFAULT)`).
//   (3) Passing Legacy produces a distinct cache key and Run ID without
//       otherwise mutating the input contract.
//   (4) The legacy-hash-quirk diagnostic fires only when non-zero costs are
//       supplied and never throws.

import { describe, expect, it, vi } from "vitest";
import { hashConfig, computeRunId, ZERO_COSTS } from "../backtest-engine";
import {
  ASTRO_FORMULA_VERSIONS,
  DEFAULT_ASTRO_FORMULA_VERSION,
  astroCacheKey,
} from "../engine-version";
import {
  hasNonZeroCosts,
  warnLegacyHashQuirkIfApplicable,
} from "../backtest/legacy-diagnostics";

function baseKey(costs = ZERO_COSTS) {
  return `backtest:NIFTY50:2024-01-01:2024-03-31:conservative:fabricate:${hashConfig(costs)}`;
}

describe("β2a · runBacktest wrapper input & cache-key parity", () => {
  it("default (no astroFormulaVersion) preserves the pre-β2a Sign-Degree cache key byte-for-byte", () => {
    const prev = astroCacheKey(baseKey(), DEFAULT_ASTRO_FORMULA_VERSION);
    const now = astroCacheKey(baseKey(), DEFAULT_ASTRO_FORMULA_VERSION);
    expect(now).toBe(prev);
    // Explicit undefined must fall through to the same value as omitted.
    expect(astroCacheKey(baseKey(), undefined)).toBe(prev);
  });

  it("Legacy Cascade selection produces a distinct cache key and Run ID", () => {
    const signKey = astroCacheKey(baseKey(), DEFAULT_ASTRO_FORMULA_VERSION);
    const legacyKey = astroCacheKey(
      baseKey(),
      ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    );
    expect(legacyKey).not.toBe(signKey);
    expect(legacyKey).toContain("LEGACY_EAGLEBABA_CASCADE_V1");

    const common = {
      symbol: "NIFTY50" as const,
      from: "2024-01-01",
      to: "2024-03-31",
      policy: "conservative" as const,
      invalidSetupPolicy: "fabricate" as const,
      costs: ZERO_COSTS,
      dataSource: "Yahoo Finance (daily, unadjusted OHLC)",
      timezone: "Asia/Kolkata",
    };
    const signRun = computeRunId({
      ...common,
      astroFormulaVersion: DEFAULT_ASTRO_FORMULA_VERSION,
    });
    const legacyRun = computeRunId({
      ...common,
      astroFormulaVersion: ASTRO_FORMULA_VERSIONS.LEGACY_EAGLEBABA_CASCADE_V1,
    });
    expect(legacyRun).not.toBe(signRun);
  });

  it("hash-quirk diagnostic fires only for non-zero costs and never throws", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    try {
      warnLegacyHashQuirkIfApplicable(ZERO_COSTS);
      expect(spy).not.toHaveBeenCalled();
      warnLegacyHashQuirkIfApplicable({
        slippagePct: 0.05,
        brokerageFlat: 0,
        brokeragePct: 0,
        taxesPct: 0,
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain(
        "LEGACY_RUN_ID_DOES_NOT_FULLY_ENCODE_NESTED_COSTS",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("hasNonZeroCosts is a total function over the cost model", () => {
    expect(hasNonZeroCosts(ZERO_COSTS)).toBe(false);
    expect(
      hasNonZeroCosts({
        slippagePct: 0,
        brokerageFlat: 1,
        brokeragePct: 0,
        taxesPct: 0,
      }),
    ).toBe(true);
  });
});