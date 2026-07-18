// Phase 3G — Backtest Lab server functions.
// Auth required. Consumer-only. No provider fetches, no eval, no
// browser-side historical fetch, no broker imports.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  BacktestRunReport,
  HistoricalCandle,
  MonteCarloSummary,
  StrategyDefinition,
  WalkForwardSummary,
} from "./types";
import { validateStrategyDefinition, computeStrategyHash } from "./strategy-schema";
import { buildBacktestRunReport, compareRuns, exportRunCsv, exportRunJson } from "./report";
import { runMonteCarlo } from "./monte-carlo";
import { runWalkForward } from "./walk-forward";
import {
  deleteStrategy as delStrat,
  listRuns as listRunsMem,
  listStrategies as listStratsMem,
  persistenceAvailable,
  persistenceStats,
  readRun as readRunMem,
  readStrategy as readStratMem,
  recordFailure,
  saveRun,
  saveStrategy,
  updateStrategy,
} from "./persistence";
import { buildDiagnostics } from "./diagnostics";

function newRunId(now: number): string {
  return `BT_RUN_${now.toString(36)}`;
}

// Small helper so browser-supplied candles never carry surprise fields.
function sanitizeCandles(rows: readonly HistoricalCandle[]): HistoricalCandle[] {
  return rows.map((r) => ({
    ts: r.ts,
    open: r.open, high: r.high, low: r.low, close: r.close,
    volume: r.volume ?? null,
    atr: r.atr ?? null,
    signalSnapshot: r.signalSnapshot ?? null,
    valid: r.valid ?? true,
  }));
}

export const createStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { strategy: StrategyDefinition }) => data)
  .handler(async ({ data }): Promise<StrategyDefinition> => {
    validateStrategyDefinition(data.strategy);
    saveStrategy(data.strategy);
    return data.strategy;
  });

export const validateStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { strategy: StrategyDefinition }) => data)
  .handler(async ({ data }) => {
    validateStrategyDefinition(data.strategy);
    return { ok: true, hash: computeStrategyHash(data.strategy) };
  });

export const listStrategiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listStratsMem());

export const readStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { strategyId: string }) => data)
  .handler(async ({ data }) => readStratMem(data.strategyId));

export const updateStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { strategy: StrategyDefinition }) => data)
  .handler(async ({ data }) => {
    validateStrategyDefinition(data.strategy);
    updateStrategy(data.strategy);
    return data.strategy;
  });

export const deleteStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { strategyId: string }) => data)
  .handler(async ({ data }) => ({ deleted: delStrat(data.strategyId) }));

export interface RunBacktestInput {
  readonly strategy: StrategyDefinition;
  readonly candles: readonly HistoricalCandle[];
  readonly monteCarloIterations?: number;
  readonly monteCarloSeed?: number;
  readonly walkForward?: { mode: "EXPANDING" | "ROLLING"; splits: number; trainRatio?: number };
}

export const runBacktestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RunBacktestInput) => data)
  .handler(async ({ data }): Promise<BacktestRunReport> => {
    const t0 = Date.now();
    const nowIso = new Date().toISOString();
    try {
      validateStrategyDefinition(data.strategy);
      const candles = sanitizeCandles(data.candles);
      const walk: WalkForwardSummary | null = data.walkForward
        ? runWalkForward(data.strategy, candles, data.walkForward)
        : null;
      const report = buildBacktestRunReport({
        runId: newRunId(Date.now()),
        strategy: data.strategy,
        candles,
        generatedAt: nowIso,
        walkForward: walk,
      });
      const mc: MonteCarloSummary | null = data.monteCarloIterations && data.monteCarloIterations > 0
        ? runMonteCarlo(report.trades, data.strategy.capital, {
            iterations: data.monteCarloIterations,
            seed: data.monteCarloSeed ?? 1,
          })
        : null;
      const finalReport: BacktestRunReport = { ...report, monteCarlo: mc };
      saveRun(finalReport, Date.now() - t0);
      return finalReport;
    } catch (err) {
      recordFailure(nowIso);
      throw err;
    }
  });

export const listBacktestRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listRunsMem());

export const readBacktestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }) => readRunMem(data.runId));

export const compareBacktestRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runIds: readonly string[] }) => data)
  .handler(async ({ data }) => {
    const runs = data.runIds.map((id) => readRunMem(id)).filter((r): r is BacktestRunReport => r != null);
    if (runs.length < 2) return null;
    const pairs: ReturnType<typeof compareRuns>[] = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) pairs.push(compareRuns(runs[i], runs[j]));
    }
    return { runs, pairs };
  });

export const exportBacktestRunJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const r = readRunMem(data.runId);
    return r ? exportRunJson(r) : "";
  });

export const exportBacktestRunCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { runId: string }) => data)
  .handler(async ({ data }): Promise<string> => {
    const r = readRunMem(data.runId);
    return r ? exportRunCsv(r) : "";
  });

export const getBacktestLabDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const stats = persistenceStats();
    return buildDiagnostics({
      nowIso: new Date().toISOString(),
      strategies: listStratsMem(),
      runs: listRunsMem(),
      persistenceAvailable: persistenceAvailable(),
      failedRuns: stats.failed,
      lastFailureAt: stats.lastFailureAt,
      averageDurationMs: stats.avgDurationMs,
    });
  });