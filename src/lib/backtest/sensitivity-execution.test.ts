// Phase 21.6 · Stage 2 — Sensitivity execution tests.

import { describe, expect, it } from "vitest";
import type { Candle } from "../smc-types";
import { ZERO_COSTS } from "./cost-model";
import {
  createComputeCounters,
  computeCandleDataHash,
  type ResearchDataContext,
} from "./research-payload";
import {
  MAX_SENSITIVITY_CELLS,
  SensitivityExecutionError,
  computeCellRunId,
  paramsChangeExecution,
  paramsChangeSignals,
  resolveHybridWeights,
  runSmcSensitivity,
  runHybridSensitivity,
  assertGridSize,
} from "./sensitivity-execution";
import { DEFAULT_HYBRID_CONFIG } from "./hybrid-decision";
import { generateParameterGrid } from "./parameter-sensitivity";

function buildCandles(n = 200): Candle[] {
  const t0 = Date.UTC(2024, 0, 1, 3, 45);
  const step = 5 * 60_000;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic pseudo-noise around a trending baseline.
    const trend = 100 + i * 0.15;
    const wiggle = Math.sin(i / 3.7) * 1.2 + Math.cos(i / 5.1) * 0.7;
    const p = trend + wiggle;
    out.push({
      t: t0 + i * step,
      o: p,
      h: p + 1.0 + Math.abs(Math.sin(i / 2.3)) * 0.6,
      l: p - 1.0 - Math.abs(Math.cos(i / 2.9)) * 0.6,
      c: p + Math.sin(i / 4.5) * 0.3,
      v: 1000 + (i % 5) * 40,
    });
  }
  return out;
}

function buildCtx(candles: Candle[] = buildCandles()): ResearchDataContext {
  return {
    instrument: "NIFTY50",
    timeframe: "5m",
    provider: "csv",
    timezone: "Asia/Kolkata",
    requestedRange: { from: "2024-01-01", to: "2024-01-05" },
    actualRange: { from: "2024-01-01", to: "2024-01-05" },
    candles: Object.freeze(candles),
    dataHash: computeCandleDataHash(candles),
    dataQuality: { status: "OK", coveragePct: 100, missingBars: 0, reasons: [] },
    baseRunId: "BASE_RUN_TEST",
    costs: ZERO_COSTS,
    source: "test-fixture",
  };
}

describe("sensitivity-execution · guards", () => {
  it("rejects empty and oversize grids", () => {
    expect(() => assertGridSize(0)).toThrow(SensitivityExecutionError);
    expect(() => assertGridSize(MAX_SENSITIVITY_CELLS + 1)).toThrow(/GRID_TOO_LARGE/);
  });

  it("throws INSUFFICIENT_DATA on short payloads", async () => {
    const ctx = buildCtx(buildCandles(5));
    await expect(
      runSmcSensitivity(ctx, [{ minScore: 50 }], createComputeCounters()),
    ).rejects.toThrow(/INSUFFICIENT_DATA/);
  });

  it("throws DATA_QUALITY_FAILURE when quality is FAIL", async () => {
    const base = buildCtx();
    const ctx: ResearchDataContext = {
      ...base,
      dataQuality: { status: "FAIL", coveragePct: 10, missingBars: 200, reasons: ["gaps"] },
    };
    await expect(
      runSmcSensitivity(ctx, [{ minScore: 50 }], createComputeCounters()),
    ).rejects.toThrow(/DATA_QUALITY_FAILURE/);
  });
});

describe("sensitivity-execution · SMC dispatch", () => {
  it("runs a small SMC grid, computes structure once, caches signals by config", async () => {
    const ctx = buildCtx();
    const counters = createComputeCounters();
    // Two rows sharing the same signal config (execution-only change) so signal
    // recompute happens exactly once, structure exactly once.
    const combos = generateParameterGrid([
      { name: "rr", min: 1, max: 2, step: 1 },
    ]);
    const result = await runSmcSensitivity(ctx, combos, counters, {
      baseSignalConfig: { minScore: 40 },
    });
    expect(result.cells.length).toBe(2);
    expect(counters.smcStructureComputeCount).toBe(1);
    expect(counters.smcSignalComputeCount).toBe(1);
    expect(counters.executionCount).toBe(2);
    expect(result.signalCacheHits).toBeGreaterThanOrEqual(1);
  });

  it("recomputes signals when minScore changes", async () => {
    const ctx = buildCtx();
    const counters = createComputeCounters();
    const combos = generateParameterGrid([
      { name: "minScore", min: 40, max: 60, step: 10 },
    ]);
    const result = await runSmcSensitivity(ctx, combos, counters, {
      baseSignalConfig: { minScore: 40 },
    });
    expect(result.cells.length).toBe(3);
    expect(counters.smcStructureComputeCount).toBe(1);
    expect(counters.smcSignalComputeCount).toBe(3);
  });

  it("marks low-sample cells as INSUFFICIENT_DATA", async () => {
    const ctx = buildCtx(buildCandles(60));
    const counters = createComputeCounters();
    const result = await runSmcSensitivity(
      ctx,
      [{ minScore: 99 }],
      counters,
      { baseSignalConfig: { minScore: 99 } },
    );
    expect(result.cells[0].metrics).toBeNull();
    expect(result.cells[0].reason).toContain("INSUFFICIENT_DATA");
  });

  it("respects abort signal and reports partial results", async () => {
    const ctx = buildCtx();
    const counters = createComputeCounters();
    const combos = generateParameterGrid([
      { name: "rr", min: 1, max: 4, step: 1 },
    ]);
    const controller = new AbortController();
    controller.abort();
    const result = await runSmcSensitivity(ctx, combos, counters, {
      signal: controller.signal,
    });
    expect(result.partial).toBe(true);
    expect(result.cells.length).toBe(0);
  });
});

describe("sensitivity-execution · Hybrid weight resolution", () => {
  it("keeps raw weights and reports total when normalize=false", () => {
    const { config, effective } = resolveHybridWeights(
      DEFAULT_HYBRID_CONFIG,
      { astroWeight: 0.6, smcWeight: 0.6 },
      false,
    );
    expect(effective.normalized).toBe(false);
    expect(effective.total).toBeCloseTo(0.6 + 0.6 + 0.15 + 0.05, 5);
    expect(config.weights.astro).toBeCloseTo(0.6);
  });

  it("normalizes weights when normalize=true", () => {
    const { config, effective } = resolveHybridWeights(
      DEFAULT_HYBRID_CONFIG,
      { astroWeight: 1, smcWeight: 1 },
      true,
    );
    expect(effective.normalized).toBe(true);
    expect(effective.total).toBe(1);
    const sum =
      config.weights.astro +
      config.weights.smc +
      config.weights.agreement +
      config.weights.dataQuality;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("rejects negative or non-finite weights", () => {
    expect(() =>
      resolveHybridWeights(DEFAULT_HYBRID_CONFIG, { astroWeight: -0.1 }, false),
    ).toThrow(/INVALID_PARAMETER_GRID|non-negative/);
  });
});

describe("sensitivity-execution · Hybrid dispatch", () => {
  it("executes a small Hybrid grid using shared candles", async () => {
    const ctx = buildCtx();
    const astroByDate: Record<string, { direction: "BUY" | "SELL" | "WAIT"; confidence: number }> = {};
    for (const c of ctx.candles) {
      const d = new Date(c.t).toISOString().slice(0, 10);
      astroByDate[d] = { direction: "BUY", confidence: 70 };
    }
    const counters = createComputeCounters();
    const combos = generateParameterGrid([
      { name: "hybridThreshold", min: 40, max: 55, step: 15 },
    ]);
    const result = await runHybridSensitivity(ctx, combos, counters, {
      astroByDate,
      astroFormulaVersion: "ASTRO_DAILY_V1",
      baseSignalConfig: { minScore: 40 },
      dataQualityPct: 100,
    });
    expect(result.cells.length).toBe(2);
    expect(counters.smcStructureComputeCount).toBe(1);
    expect(counters.executionCount).toBe(2);
  });
});

describe("sensitivity-execution · cell Run ID determinism", () => {
  const base = {
    baseRunId: "R1",
    dataHash: "abcd1234",
    strategy: "SMC_V1" as const,
    params: { minScore: 50, rr: 2 },
  };
  it("is deterministic and prefixed", () => {
    expect(computeCellRunId(base)).toBe(computeCellRunId(base));
    expect(computeCellRunId(base)).toMatch(/^SENSITIVITY_CELL_V1:[0-9a-f]{8}$/);
  });
  it("changes when params change", () => {
    const a = computeCellRunId(base);
    const b = computeCellRunId({ ...base, params: { minScore: 60, rr: 2 } });
    expect(a).not.toBe(b);
  });
  it("changes when data hash changes", () => {
    const a = computeCellRunId(base);
    const b = computeCellRunId({ ...base, dataHash: "different" });
    expect(a).not.toBe(b);
  });
  it("changes when normalize flag changes", () => {
    const a = computeCellRunId({ ...base, normalizeWeights: true });
    const b = computeCellRunId({ ...base, normalizeWeights: false });
    expect(a).not.toBe(b);
  });
});

describe("sensitivity-execution · partitions", () => {
  it("classifies signal-config keys", () => {
    expect(paramsChangeSignals({ minScore: 50 })).toBe(true);
    expect(paramsChangeSignals({ rr: 2 })).toBe(false);
  });
  it("classifies execution-config keys", () => {
    expect(paramsChangeExecution({ rr: 2 })).toBe(true);
    expect(paramsChangeExecution({ atrStopMultiplier: 1.5 })).toBe(true);
    expect(paramsChangeExecution({ minScore: 50 })).toBe(false);
  });
});

describe("sensitivity-execution · payload hashing", () => {
  it("is deterministic for the same candle series", () => {
    const a = computeCandleDataHash(buildCandles(50));
    const b = computeCandleDataHash(buildCandles(50));
    expect(a).toBe(b);
  });
  it("differs when candle content differs", () => {
    const a = computeCandleDataHash(buildCandles(50));
    const b = computeCandleDataHash(buildCandles(51));
    expect(a).not.toBe(b);
  });
});