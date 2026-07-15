// Phase 21.3d-parity-α · Envelope shape oracle.
//
// Locks every top-level and nested key of `BacktestResult` and `HistoryResult`.
// A field rename, removal, or addition in production surfaces here as a
// failing test before parity-β is allowed to swap wrappers.

import { describe, expect, it } from "vitest";
import {
  BACKTEST_BENCHMARK_KEYS,
  BACKTEST_DATA_QUALITY_KEYS,
  BACKTEST_EXECUTION_META_KEYS,
  BACKTEST_GOLDEN,
  BACKTEST_INSIGHTS_KEYS,
  BACKTEST_RESULT_KEYS,
  BACKTEST_STATS_KEYS,
  BACKTEST_SUMMARY_KEYS,
  BACKTEST_TRADE_KEYS,
} from "../__fixtures__/parity/backtest-golden";
import {
  HISTORY_GOLDEN,
  HISTORY_METRICS_KEYS,
  HISTORY_RESULT_KEYS,
  HISTORY_SESSION_KEYS_REQUIRED,
} from "../__fixtures__/parity/history-golden";

function keySet<T extends object>(obj: T): string[] {
  return Object.keys(obj).sort();
}

describe("Phase 21.3d-parity-α · BacktestResult shape oracle", () => {
  it("top-level keys locked", () => {
    expect(keySet(BACKTEST_GOLDEN)).toEqual([...BACKTEST_RESULT_KEYS].sort());
  });
  it("trade keys locked (all optional fields present)", () => {
    for (const t of BACKTEST_GOLDEN.trades) {
      expect(keySet(t)).toEqual([...BACKTEST_TRADE_KEYS].sort());
    }
  });
  it("summary keys locked", () => {
    expect(keySet(BACKTEST_GOLDEN.summary)).toEqual([...BACKTEST_SUMMARY_KEYS].sort());
  });
  it("executionMeta keys locked", () => {
    expect(keySet(BACKTEST_GOLDEN.executionMeta)).toEqual([...BACKTEST_EXECUTION_META_KEYS].sort());
  });
  it("dataQuality keys locked", () => {
    expect(keySet(BACKTEST_GOLDEN.dataQuality)).toEqual([...BACKTEST_DATA_QUALITY_KEYS].sort());
  });
  it("insights keys locked (all 8 slots present, nullability honoured)", () => {
    expect(keySet(BACKTEST_GOLDEN.insights)).toEqual([...BACKTEST_INSIGHTS_KEYS].sort());
  });
  it("stats keys locked", () => {
    expect(keySet(BACKTEST_GOLDEN.stats)).toEqual([...BACKTEST_STATS_KEYS].sort());
  });
  it("benchmark keys locked when non-null", () => {
    expect(BACKTEST_GOLDEN.benchmark).not.toBeNull();
    expect(keySet(BACKTEST_GOLDEN.benchmark!)).toEqual([...BACKTEST_BENCHMARK_KEYS].sort());
  });
  it("disclaimers are an ordered non-empty tuple", () => {
    expect(BACKTEST_GOLDEN.disclaimers).toHaveLength(3);
    expect(BACKTEST_GOLDEN.disclaimers[0].startsWith("Historical results are simulated")).toBe(true);
    expect(BACKTEST_GOLDEN.disclaimers[1].startsWith("Daily OHLC data")).toBe(true);
    expect(BACKTEST_GOLDEN.disclaimers[2].startsWith("Backtests are informational")).toBe(true);
  });
  it("equityCurve entries carry (date, cumulative) only", () => {
    for (const p of BACKTEST_GOLDEN.equityCurve) {
      expect(keySet(p)).toEqual(["cumulative", "date"]);
    }
  });
  it("monthly rows carry (month, trades, wins, losses, pnl, accuracy) only", () => {
    for (const m of BACKTEST_GOLDEN.monthly) {
      expect(keySet(m)).toEqual(["accuracy", "losses", "month", "pnl", "trades", "wins"]);
    }
  });
  it("bestMonth / worstMonth carry (month, pnl) only when non-null", () => {
    expect(keySet(BACKTEST_GOLDEN.summary.bestMonth!)).toEqual(["month", "pnl"]);
    expect(keySet(BACKTEST_GOLDEN.summary.worstMonth!)).toEqual(["month", "pnl"]);
  });
});

describe("Phase 21.3d-parity-α · HistoryResult shape oracle", () => {
  it("top-level keys locked", () => {
    expect(keySet(HISTORY_GOLDEN)).toEqual([...HISTORY_RESULT_KEYS].sort());
  });
  it("sessionsSummary success rows carry required keys", () => {
    const success = HISTORY_GOLDEN.sessionsSummary.find((s) => !s.error);
    expect(success).toBeDefined();
    const keys = keySet(success!);
    for (const k of HISTORY_SESSION_KEYS_REQUIRED) expect(keys).toContain(k);
    // success rows must NOT carry an error property
    expect(keys).not.toContain("error");
  });
  it("sessionsSummary failure rows carry required keys plus error", () => {
    const failure = HISTORY_GOLDEN.sessionsSummary.find((s) => !!s.error);
    expect(failure).toBeDefined();
    const keys = keySet(failure!);
    for (const k of HISTORY_SESSION_KEYS_REQUIRED) expect(keys).toContain(k);
    expect(keys).toContain("error");
  });
  it("metrics keys locked", () => {
    expect(keySet(HISTORY_GOLDEN.metrics)).toEqual([...HISTORY_METRICS_KEYS].sort());
  });
  it("labeledAs is the exact validation constant", () => {
    expect(HISTORY_GOLDEN.labeledAs).toBe(
      "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
    );
  });
  it("attempted / loaded / failed accounting is consistent", () => {
    expect(HISTORY_GOLDEN.attempted).toBe(HISTORY_GOLDEN.sessionsSummary.length);
    expect(HISTORY_GOLDEN.failed).toBe(
      HISTORY_GOLDEN.sessionsSummary.filter((s) => !!s.error).length,
    );
  });
});