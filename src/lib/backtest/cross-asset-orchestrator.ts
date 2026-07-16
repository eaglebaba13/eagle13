// Phase 21.7 · Stage 2 — Multi-Asset Execution Orchestrator.
//
// Pure, deterministic batch driver that produces an execution plan across
// (strategy × formula × instrument × timeframe × period) and drives the
// existing `runUnifiedBacktest` via an injected `execute` dependency.
//
// Never creates another runner. Never mutates production strategy outputs,
// Run IDs, exports, provider fetches, or cache namespaces. All internal
// bookkeeping is additive and lives entirely in this module.

import type { CostModel } from "./cost-model";
import type { DataGranularity, HistoricalBacktestResult, UnifiedFormulaId } from "./result";
import type { StrategyId } from "./strategy";

export type BatchPeriod = {
  readonly label: string;
  readonly from: string; // YYYY-MM-DD
  readonly to: string;   // YYYY-MM-DD
};

export type BatchJob = {
  readonly strategy: StrategyId;
  readonly formula: UnifiedFormulaId;
  readonly instrument: string;
  readonly timeframe: DataGranularity;
  readonly period: BatchPeriod;
};

export type BatchJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type BatchJobError = { readonly code: string; readonly message: string };

export type BatchJobRecord = {
  readonly key: string;
  readonly job: BatchJob;
  readonly status: BatchJobStatus;
  readonly attempts: number;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly runId: string | null;
  readonly dataHash: string | null;
  readonly result: HistoricalBacktestResult | null;
  readonly error: BatchJobError | null;
};

export type BatchProgress = {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly running: number;
  readonly queued: number;
  readonly cancelled: number;
  readonly currentJobs: readonly BatchJob[];
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly etaMs: number | null;
};

export type BatchOrchestratorState = {
  readonly records: readonly BatchJobRecord[];
  readonly progress: BatchProgress;
  readonly paused: boolean;
  readonly cancelled: boolean;
};

export type BatchOrchestratorInput = {
  readonly strategies: readonly StrategyId[];
  /** Formula per strategy; strategies missing an entry are skipped from planning. */
  readonly formulas: Readonly<Partial<Record<StrategyId, UnifiedFormulaId>>>;
  readonly instruments: readonly string[];
  readonly timeframes: readonly DataGranularity[];
  readonly periods: readonly BatchPeriod[];
  readonly costs?: CostModel;
  readonly source?: string;
  readonly concurrency: 1 | 2 | 4 | 8;
};

export type BatchExecuteFn = (
  job: BatchJob,
  ctx: { readonly signal: AbortSignal; readonly costs?: CostModel; readonly source?: string },
) => Promise<HistoricalBacktestResult>;

export type BatchOrchestratorDeps = {
  readonly execute: BatchExecuteFn;
  readonly now?: () => number;
};

export type BatchController = {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  restartFailed(): void;
  restartAll(): void;
  getState(): BatchOrchestratorState;
  subscribe(listener: (state: BatchOrchestratorState) => void): () => void;
  /** Result database indexed by strategy|formula|instrument|timeframe|period. */
  getResults(): ReadonlyMap<string, BatchJobRecord>;
};

export const CROSS_ASSET_ORCHESTRATOR_VERSION = "CROSS_ASSET_ORCHESTRATOR_V1";

/** Deterministic key for one job configuration. */
export function jobKey(job: BatchJob): string {
  return [
    job.strategy,
    job.formula,
    job.instrument,
    job.timeframe,
    job.period.label,
    job.period.from,
    job.period.to,
  ].join("|");
}

/** Build a deterministic execution plan; iteration order is stable and unique. */
export function buildExecutionPlan(input: BatchOrchestratorInput): BatchJob[] {
  const jobs: BatchJob[] = [];
  const seen = new Set<string>();
  for (const strategy of input.strategies) {
    const formula = input.formulas[strategy];
    if (!formula) continue;
    for (const instrument of input.instruments) {
      for (const timeframe of input.timeframes) {
        for (const period of input.periods) {
          const job: BatchJob = { strategy, formula, instrument, timeframe, period };
          const k = jobKey(job);
          if (seen.has(k)) continue;
          seen.add(k);
          jobs.push(job);
        }
      }
    }
  }
  return jobs;
}

function emptyProgress(total: number): BatchProgress {
  return {
    total,
    completed: 0,
    failed: 0,
    skipped: 0,
    running: 0,
    queued: total,
    cancelled: 0,
    currentJobs: [],
    startedAt: null,
    finishedAt: null,
    etaMs: null,
  };
}

function initialRecord(job: BatchJob): BatchJobRecord {
  return {
    key: jobKey(job),
    job,
    status: "queued",
    attempts: 0,
    startedAt: null,
    finishedAt: null,
    runId: null,
    dataHash: null,
    result: null,
    error: null,
  };
}

function toError(e: unknown): BatchJobError {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return {
      code: String((e as { code: unknown }).code ?? "BATCH_JOB_ERROR"),
      message: String((e as { message: unknown }).message ?? "unknown"),
    };
  }
  if (e instanceof Error) return { code: "BATCH_JOB_ERROR", message: e.message };
  return { code: "BATCH_JOB_ERROR", message: String(e) };
}

export function createBatchOrchestrator(
  input: BatchOrchestratorInput,
  deps: BatchOrchestratorDeps,
): BatchController {
  const now = deps.now ?? (() => Date.now());
  const plan = buildExecutionPlan(input);
  const records = new Map<string, BatchJobRecord>();
  for (const job of plan) records.set(jobKey(job), initialRecord(job));

  let paused = false;
  let cancelled = false;
  let startedAt: number | null = null;
  let finishedAt: number | null = null;
  let abort: AbortController | null = null;
  const runningKeys = new Set<string>();
  const listeners = new Set<(s: BatchOrchestratorState) => void>();
  let runningPromise: Promise<void> | null = null;

  function snapshot(): BatchOrchestratorState {
    const recArr = [...records.values()];
    const completed = recArr.filter((r) => r.status === "completed").length;
    const failed = recArr.filter((r) => r.status === "failed").length;
    const skipped = recArr.filter((r) => r.status === "skipped").length;
    const cancelledN = recArr.filter((r) => r.status === "cancelled").length;
    const running = recArr.filter((r) => r.status === "running").length;
    const queued = recArr.filter((r) => r.status === "queued").length;
    const currentJobs = recArr.filter((r) => r.status === "running").map((r) => r.job);
    const done = completed + failed + skipped + cancelledN;
    let etaMs: number | null = null;
    if (startedAt !== null && done > 0 && done < recArr.length) {
      const elapsed = now() - startedAt;
      const perJob = elapsed / done;
      etaMs = Math.round(perJob * (recArr.length - done));
    }
    return {
      records: recArr,
      progress: {
        total: recArr.length,
        completed,
        failed,
        skipped,
        cancelled: cancelledN,
        running,
        queued,
        currentJobs,
        startedAt,
        finishedAt,
        etaMs,
      },
      paused,
      cancelled,
    };
  }

  function emit() {
    const s = snapshot();
    for (const l of listeners) l(s);
  }

  function update(key: string, patch: Partial<BatchJobRecord>) {
    const cur = records.get(key);
    if (!cur) return;
    records.set(key, { ...cur, ...patch });
  }

  function nextQueuedKey(): string | null {
    for (const [k, r] of records) {
      if (r.status === "queued" && !runningKeys.has(k)) return k;
    }
    return null;
  }

  async function runOne(key: string): Promise<void> {
    const rec = records.get(key);
    if (!rec) return;
    runningKeys.add(key);
    update(key, {
      status: "running",
      startedAt: now(),
      attempts: rec.attempts + 1,
    });
    emit();
    try {
      if (!abort) abort = new AbortController();
      const result = await deps.execute(rec.job, {
        signal: abort.signal,
        costs: input.costs,
        source: input.source,
      });
      if (cancelled) {
        update(key, { status: "cancelled", finishedAt: now() });
      } else {
        update(key, {
          status: "completed",
          finishedAt: now(),
          result,
          runId: result.runId,
          dataHash:
            (result.formulaMeta as { dataHash?: string } | undefined)?.dataHash ?? null,
        });
      }
    } catch (e) {
      if (cancelled) {
        update(key, { status: "cancelled", finishedAt: now(), error: toError(e) });
      } else {
        update(key, { status: "failed", finishedAt: now(), error: toError(e) });
      }
    } finally {
      runningKeys.delete(key);
      emit();
    }
  }

  async function drive(): Promise<void> {
    if (startedAt === null) startedAt = now();
    const conc = input.concurrency;
    while (!cancelled) {
      if (paused) {
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }
      const capacity = conc - runningKeys.size;
      if (capacity <= 0) {
        // Wait for at least one job to settle before scheduling more.
        await new Promise<void>((resolve) => {
          const off = subscribe(() => {
            if (runningKeys.size < conc) {
              off();
              resolve();
            }
          });
        });
        continue;
      }
      const batch: string[] = [];
      for (let i = 0; i < capacity; i++) {
        const k = nextQueuedKey();
        if (!k) break;
        batch.push(k);
        runningKeys.add(k); // reserve so nextQueuedKey doesn't hand it out twice
      }
      if (batch.length === 0) {
        if (runningKeys.size === 0) break;
        await new Promise<void>((resolve) => {
          const off = subscribe(() => {
            off();
            resolve();
          });
        });
        continue;
      }
      // Release the reservation and let runOne re-add + flip status.
      for (const k of batch) runningKeys.delete(k);
      await Promise.all(batch.map((k) => runOne(k)));
    }
    // Mark any still-queued jobs as cancelled if cancel flag was set.
    if (cancelled) {
      for (const [k, r] of records) {
        if (r.status === "queued") update(k, { status: "cancelled", finishedAt: now() });
      }
    }
    finishedAt = now();
    emit();
  }

  function subscribe(listener: (state: BatchOrchestratorState) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener) as unknown as void;
  }

  return {
    async start() {
      if (runningPromise) return runningPromise;
      cancelled = false;
      paused = false;
      abort = new AbortController();
      emit();
      runningPromise = drive().finally(() => {
        runningPromise = null;
      });
      return runningPromise;
    },
    pause() {
      paused = true;
      emit();
    },
    resume() {
      paused = false;
      emit();
    },
    cancel() {
      cancelled = true;
      paused = false;
      if (abort) abort.abort();
      emit();
    },
    restartFailed() {
      for (const [k, r] of records) {
        if (r.status === "failed" || r.status === "cancelled") {
          update(k, {
            status: "queued",
            startedAt: null,
            finishedAt: null,
            error: null,
            result: null,
            runId: null,
            dataHash: null,
          });
        }
      }
      emit();
    },
    restartAll() {
      for (const [k, r] of records) {
        update(k, {
          status: "queued",
          attempts: 0,
          startedAt: null,
          finishedAt: null,
          error: null,
          result: null,
          runId: null,
          dataHash: null,
        });
        void r;
      }
      startedAt = null;
      finishedAt = null;
      emit();
    },
    getState() {
      return snapshot();
    },
    subscribe,
    getResults() {
      const out = new Map<string, BatchJobRecord>();
      for (const [k, r] of records) if (r.status === "completed") out.set(k, r);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Batch summary — pure aggregation over completed records. Best-of picks
// mirror the cross-asset ranking rules (Phase 21.7 Stage 1) but stay scoped
// to the batch and never touch existing exports.

export type BatchSummary = {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly cancelled: number;
  readonly coveragePct: number;
  readonly bestStrategy: string | null;
  readonly bestInstrument: string | null;
  readonly bestTimeframe: string | null;
  readonly bestPeriod: string | null;
  readonly highestNetPnl: number | null;
};

export function summarizeBatch(state: BatchOrchestratorState): BatchSummary {
  const recs = state.records;
  const completed = recs.filter((r) => r.status === "completed");
  const failed = recs.filter((r) => r.status === "failed").length;
  const skipped = recs.filter((r) => r.status === "skipped").length;
  const cancelled = recs.filter((r) => r.status === "cancelled").length;
  const total = recs.length;
  const coverage = total > 0 ? Math.round((completed.length / total) * 10000) / 100 : 0;

  let bestStrategy: string | null = null;
  let bestInstrument: string | null = null;
  let bestTimeframe: string | null = null;
  let bestPeriod: string | null = null;
  let highest: number | null = null;
  for (const r of completed) {
    const trades = r.result?.trades ?? [];
    const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
    if (highest === null || netPnl > highest) {
      highest = netPnl;
      bestStrategy = r.job.strategy;
      bestInstrument = r.job.instrument;
      bestTimeframe = r.job.timeframe;
      bestPeriod = r.job.period.label;
    }
  }

  return {
    total,
    completed: completed.length,
    failed,
    skipped,
    cancelled,
    coveragePct: coverage,
    bestStrategy,
    bestInstrument,
    bestTimeframe,
    bestPeriod,
    highestNetPnl: highest === null ? null : Math.round(highest * 100) / 100,
  };
}
