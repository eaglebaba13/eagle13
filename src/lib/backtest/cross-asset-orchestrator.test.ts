import { describe, it, expect } from "vitest";
import {
  buildExecutionPlan,
  createBatchOrchestrator,
  jobKey,
  summarizeBatch,
  type BatchExecuteFn,
  type BatchJob,
  type BatchOrchestratorInput,
} from "./cross-asset-orchestrator";
import type { HistoricalBacktestResult } from "./result";

function makeInput(overrides: Partial<BatchOrchestratorInput> = {}): BatchOrchestratorInput {
  return {
    strategies: ["SMC", "ASTRO"],
    formulas: {
      SMC: "SMC_V1" as HistoricalBacktestResult["formulaVersion"],
      ASTRO: "GANN_SIGN_DEGREE_TABLE_V1_1" as HistoricalBacktestResult["formulaVersion"],
    },
    instruments: ["NIFTY50", "BANKNIFTY"],
    timeframes: ["5m"],
    periods: [
      { label: "3M", from: "2025-01-01", to: "2025-03-31" },
      { label: "6M", from: "2025-01-01", to: "2025-06-30" },
    ],
    concurrency: 2,
    ...overrides,
  };
}

function fakeResult(job: BatchJob, netPnl = 100): HistoricalBacktestResult {
  return {
    formulaVersion: job.formula,
    engineVersion: "e",
    executionVersion: "x",
    cubeVersion: "c",
    policyVersion: "p",
    runId: `${job.formula}:${jobKey(job)}`,
    generatedAt: "2026-07-16T00:00:00Z",
    instrument: job.instrument,
    from: job.period.from,
    to: job.period.to,
    dataGranularity: job.timeframe,
    source: "test",
    dataQuality: null,
    trades: [
      {
        id: "1", date: job.period.from, side: "BUY",
        entry: 100, stop: 90, target: 120, exit: 100 + netPnl,
        outcome: "WIN", pnl: netPnl, mfe: null, mae: null, holdingTime: null,
        formulaVersion: job.formula, source: "test", ambiguous: false, reasons: [], metadata: {},
      },
    ],
    stats: {},
    monthly: [],
    equityCurve: [],
    drawdown: { max: 0, maxPct: 0 },
    benchmark: null,
    methodology: "",
    disclaimers: [],
    formulaMeta: { dataHash: `hash-${job.instrument}-${job.timeframe}-${job.period.from}` },
  } as unknown as HistoricalBacktestResult;
}

describe("Phase 21.7 Stage 2 · execution plan", () => {
  it("is deterministic and unique", () => {
    const a = buildExecutionPlan(makeInput());
    const b = buildExecutionPlan(makeInput());
    expect(a).toEqual(b);
    // 2 strategies × 2 instruments × 1 tf × 2 periods = 8
    expect(a).toHaveLength(8);
    expect(new Set(a.map(jobKey)).size).toBe(8);
  });

  it("skips strategies without a formula mapping", () => {
    const plan = buildExecutionPlan(makeInput({ formulas: { SMC: "SMC_V1" as never } }));
    expect(plan.every((j) => j.strategy === "SMC")).toBe(true);
    expect(plan).toHaveLength(4);
  });
});

describe("Phase 21.7 Stage 2 · orchestrator concurrency & determinism", () => {
  it("never exceeds the concurrency limit and completes every job exactly once", async () => {
    let peak = 0;
    let inFlight = 0;
    const seen = new Set<string>();
    const execute: BatchExecuteFn = async (job) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      expect(seen.has(jobKey(job))).toBe(false);
      seen.add(jobKey(job));
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return fakeResult(job);
    };
    const ctrl = createBatchOrchestrator(makeInput({ concurrency: 4 }), { execute });
    await ctrl.start();
    const state = ctrl.getState();
    expect(state.progress.completed).toBe(8);
    expect(state.progress.failed).toBe(0);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(0);
  });

  it("isolates failures and continues remaining jobs", async () => {
    const execute: BatchExecuteFn = async (job) => {
      if (job.instrument === "BANKNIFTY") throw new Error("provider offline");
      return fakeResult(job);
    };
    const ctrl = createBatchOrchestrator(makeInput({ concurrency: 2 }), { execute });
    await ctrl.start();
    const s = ctrl.getState();
    expect(s.progress.failed).toBe(4);
    expect(s.progress.completed).toBe(4);
    const failures = s.records.filter((r) => r.status === "failed");
    expect(failures.every((f) => f.error?.message === "provider offline")).toBe(true);
  });
});

describe("Phase 21.7 Stage 2 · pause / resume / cancel / restart", () => {
  it("cancel stops remaining queued jobs and marks them cancelled", async () => {
    const execute: BatchExecuteFn = async (job, ctx) => {
      await new Promise((r) => setTimeout(r, 20));
      if (ctx.signal.aborted) throw new Error("aborted");
      return fakeResult(job);
    };
    const ctrl = createBatchOrchestrator(makeInput({ concurrency: 1 }), { execute });
    const p = ctrl.start();
    await new Promise((r) => setTimeout(r, 5));
    ctrl.cancel();
    await p;
    const s = ctrl.getState();
    expect(s.cancelled).toBe(true);
    expect(s.progress.cancelled + s.progress.completed).toBeGreaterThan(0);
    expect(s.progress.queued).toBe(0);
  });

  it("restartFailed requeues failed jobs and leaves completed ones alone", async () => {
    let fail = true;
    const execute: BatchExecuteFn = async (job) => {
      if (job.instrument === "BANKNIFTY" && fail) throw new Error("temp");
      return fakeResult(job);
    };
    const ctrl = createBatchOrchestrator(makeInput({ concurrency: 2 }), { execute });
    await ctrl.start();
    expect(ctrl.getState().progress.failed).toBe(4);
    fail = false;
    ctrl.restartFailed();
    await ctrl.start();
    const s = ctrl.getState();
    expect(s.progress.completed).toBe(8);
    expect(s.progress.failed).toBe(0);
  });
});

describe("Phase 21.7 Stage 2 · deduplication & summary", () => {
  it("execute is called exactly once per unique key", async () => {
    const calls = new Map<string, number>();
    const execute: BatchExecuteFn = async (job) => {
      const k = jobKey(job);
      calls.set(k, (calls.get(k) ?? 0) + 1);
      return fakeResult(job);
    };
    const ctrl = createBatchOrchestrator(makeInput(), { execute });
    await ctrl.start();
    for (const [, n] of calls) expect(n).toBe(1);
    expect(calls.size).toBe(8);
  });

  it("summarizeBatch reports coverage and best net-pnl", async () => {
    const execute: BatchExecuteFn = async (job) =>
      fakeResult(job, job.instrument === "NIFTY50" ? 500 : 100);
    const ctrl = createBatchOrchestrator(makeInput(), { execute });
    await ctrl.start();
    const sum = summarizeBatch(ctrl.getState());
    expect(sum.total).toBe(8);
    expect(sum.completed).toBe(8);
    expect(sum.coveragePct).toBe(100);
    expect(sum.bestInstrument).toBe("NIFTY50");
    expect(sum.highestNetPnl).toBe(500);
  });
});
