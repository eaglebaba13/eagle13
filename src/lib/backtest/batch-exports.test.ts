import { describe, it, expect } from "vitest";
import {
  buildBatchResultsCsv,
  buildBatchFailuresCsv,
  buildBatchCoverageCsv,
  buildBatchSummaryJson,
  buildBatchResultsJson,
} from "./batch-exports";
import {
  createBatchOrchestrator,
  type BatchExecuteFn,
  type BatchJob,
  type BatchOrchestratorInput,
} from "./cross-asset-orchestrator";
import type { HistoricalBacktestResult } from "./result";

function fakeResult(job: BatchJob, pnl: number): HistoricalBacktestResult {
  return {
    formulaVersion: job.formula, engineVersion: "e", executionVersion: "x",
    cubeVersion: "c", policyVersion: "p", runId: `rid-${job.instrument}`,
    generatedAt: "t", instrument: job.instrument, from: job.period.from, to: job.period.to,
    dataGranularity: job.timeframe, source: "s", dataQuality: null,
    trades: [{ id: "1", date: job.period.from, side: "BUY", entry: 1, stop: 1, target: 1,
      exit: 1, outcome: "WIN", pnl, mfe: null, mae: null, holdingTime: null,
      formulaVersion: job.formula, source: "s", ambiguous: false, reasons: [], metadata: {} }],
    stats: {}, monthly: [], equityCurve: [], drawdown: { max: 0, maxPct: 0 },
    benchmark: null, methodology: "", disclaimers: [],
    formulaMeta: { dataHash: `dh-${job.instrument}` },
  } as unknown as HistoricalBacktestResult;
}

function input(): BatchOrchestratorInput {
  return {
    strategies: ["SMC"],
    formulas: { SMC: "SMC_V1" as never },
    instruments: ["NIFTY50", "BANKNIFTY"],
    timeframes: ["5m"],
    periods: [{ label: "3M", from: "2025-01-01", to: "2025-03-31" }],
    concurrency: 2,
  };
}

describe("Phase 21.7 Stage 2 · batch exports", () => {
  it("emits deterministic CSV + JSON containing all records", async () => {
    const execute: BatchExecuteFn = async (job) =>
      fakeResult(job, job.instrument === "NIFTY50" ? 200 : 50);
    const ctrl = createBatchOrchestrator(input(), { execute });
    await ctrl.start();
    const prov = { generatedAt: "2026-07-16", source: "test" };
    const csv = buildBatchResultsCsv(ctrl.getState(), prov);
    expect(csv).toContain("NIFTY50");
    expect(csv).toContain("BANKNIFTY");
    expect(csv).toContain("CROSS_ASSET_ORCHESTRATOR_V1");
    const coverage = buildBatchCoverageCsv(ctrl.getState(), prov);
    expect(coverage).toContain("100");
    const json = JSON.parse(buildBatchSummaryJson(ctrl.getState(), prov));
    expect(json.summary.completed).toBe(2);
    expect(json.summary.bestInstrument).toBe("NIFTY50");
    const rjson = JSON.parse(buildBatchResultsJson(ctrl.getState(), prov));
    expect(rjson.records).toHaveLength(2);
  });

  it("failures CSV only lists failed/cancelled records", async () => {
    const execute: BatchExecuteFn = async (job) => {
      if (job.instrument === "BANKNIFTY") throw new Error("boom");
      return fakeResult(job, 100);
    };
    const ctrl = createBatchOrchestrator(input(), { execute });
    await ctrl.start();
    const csv = buildBatchFailuresCsv(ctrl.getState(), { generatedAt: "t", source: "s" });
    expect(csv).toContain("BANKNIFTY");
    expect(csv).not.toMatch(/NIFTY50,/);
    expect(csv).toContain("boom");
  });
});
