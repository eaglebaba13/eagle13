// Phase 21.6 · Stage 2 — Shared immutable research payload.
//
// Owns the one-and-only intraday payload used across base backtest,
// walk-forward, Monte Carlo, sensitivity, robustness, and exports for a
// single Research run. Pure and side-effect free: candles are frozen and
// callers must never mutate them. Compute counters exist so tests can prove
// that provider fetches, data-quality checks, and structure passes are
// executed exactly once per research run.

import type { Candle } from "../smc-types";
import type { CostModel } from "./cost-model";
import type { DataGranularity } from "./result";

export type ResearchDataQuality = {
  readonly status: "OK" | "DEGRADED" | "FAIL";
  readonly coveragePct: number;
  readonly missingBars: number;
  readonly reasons: readonly string[];
};

export type ResearchDataContext = {
  readonly instrument: string;
  readonly timeframe: DataGranularity;
  readonly provider: string;
  readonly timezone: string;
  readonly requestedRange: { readonly from: string; readonly to: string };
  readonly actualRange: { readonly from: string; readonly to: string };
  readonly candles: readonly Candle[];
  readonly dataHash: string;
  readonly dataQuality: ResearchDataQuality;
  readonly baseRunId: string;
  readonly costs: CostModel;
  readonly source: string;
};

/** Deterministic FNV-1a hash of the ordered candle stream. */
export function computeCandleDataHash(candles: readonly Candle[]): string {
  let h = 0x811c9dc5;
  const step = (n: number) => {
    // eslint-disable-next-line no-bitwise
    h ^= n & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  for (const c of candles) {
    const key = `${c.t}|${c.o}|${c.h}|${c.l}|${c.c}|${c.v ?? 0}`;
    for (let i = 0; i < key.length; i++) step(key.charCodeAt(i));
  }
  // eslint-disable-next-line no-bitwise
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type ResearchComputeCounters = {
  providerLoadCount: number;
  dataQualityCount: number;
  astroComputeCount: number;
  smcStructureComputeCount: number;
  smcSignalComputeCount: number;
  executionCount: number;
};

export function createComputeCounters(): ResearchComputeCounters {
  return {
    providerLoadCount: 0,
    dataQualityCount: 0,
    astroComputeCount: 0,
    smcStructureComputeCount: 0,
    smcSignalComputeCount: 0,
    executionCount: 0,
  };
}

/**
 * Assert an immutable snapshot: the same array reference must be passed to
 * every downstream engine (no shallow copy that could diverge). This is a
 * developer aid — production callers may pass Object.freeze(candles).
 */
export function assertFrozenPayload(ctx: ResearchDataContext): {
  frozen: boolean;
  warning?: string;
} {
  if (ctx.candles.length === 0) return { frozen: true };
  if (Object.isFrozen(ctx.candles)) return { frozen: true };
  return {
    frozen: false,
    warning:
      "candles not frozen — pass Object.freeze(candles) to guarantee immutability",
  };
}