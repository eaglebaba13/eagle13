import { describe, it, expect } from "vitest";
import {
  BACKTEST_ENGINE_VERSION,
  BACKTEST_FORMULA_VERSION,
  ZERO_COSTS,
  assertCausal,
  buildStats,
  computeRunId,
  expectedTradingSessions,
  hashConfig,
  median,
  pickTargetStop,
  resolveOutcome,
  sampleWarning,
  stddev,
  validateCandle,
  type LevelPoint,
} from "./backtest-engine";

/* ------------------------------------------------------------------ */
/* Look-ahead / causality                                             */
/* ------------------------------------------------------------------ */

describe("assertCausal — no future data leakage", () => {
  const T = (h: number) => new Date(`2024-01-15T${String(h).padStart(2, "0")}:00:00Z`).getTime();
  it("passes when signal < entry < exit and data is not newer than signal", () => {
    expect(assertCausal({ signalTs: T(9), entryTs: T(10), exitTs: T(15), dataAvailableTs: T(8) })).toEqual({ ok: true });
  });
  it("fails when input datum is newer than the signal (data leakage)", () => {
    const r = assertCausal({ signalTs: T(9), entryTs: T(10), exitTs: T(15), dataAvailableTs: T(12) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/DATA_LEAKAGE_ERROR/);
  });
  it("fails when signal is produced after entry", () => {
    const r = assertCausal({ signalTs: T(11), entryTs: T(10), exitTs: T(15), dataAvailableTs: T(8) });
    expect(r.ok).toBe(false);
  });
  it("fails when entry is after exit", () => {
    const r = assertCausal({ signalTs: T(9), entryTs: T(16), exitTs: T(15), dataAvailableTs: T(8) });
    expect(r.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Target / stop selection                                            */
/* ------------------------------------------------------------------ */

describe("pickTargetStop", () => {
  const board: LevelPoint[] = [
    { value: 100, isResistance: false }, // S3
    { value: 105, isResistance: false }, // S2
    { value: 108, isResistance: false }, // S1 (nearest support below 110)
    { value: 112, isResistance: true },  // R1 (nearest resistance above 110)
    { value: 116, isResistance: true },
    { value: 120, isResistance: true },
  ];

  it("picks nearest resistance above as BUY target and nearest support below as BUY stop", () => {
    expect(pickTargetStop(board, 110, "BUY")).toEqual({ target: 112, stop: 108 });
  });
  it("picks nearest support below as SELL target and nearest resistance above as SELL stop", () => {
    expect(pickTargetStop(board, 110, "SELL")).toEqual({ target: 108, stop: 112 });
  });
  it("returns null/null for WAIT", () => {
    expect(pickTargetStop(board, 110, "WAIT")).toEqual({ target: null, stop: null });
  });
  it("returns null when no valid level exists on the required side (no fabrication)", () => {
    const above: LevelPoint[] = [{ value: 90, isResistance: false }];
    expect(pickTargetStop(above, 100, "BUY")).toEqual({ target: null, stop: 90 });
    const below: LevelPoint[] = [{ value: 110, isResistance: true }];
    expect(pickTargetStop(below, 100, "BUY")).toEqual({ target: 110, stop: null });
  });
  it("ignores same-side wrong-type levels", () => {
    const b: LevelPoint[] = [
      { value: 105, isResistance: true },  // resistance BELOW entry — ignored for BUY target
      { value: 115, isResistance: false }, // support ABOVE entry — ignored for BUY stop
      { value: 112, isResistance: true },
      { value: 108, isResistance: false },
    ];
    expect(pickTargetStop(b, 110, "BUY")).toEqual({ target: 112, stop: 108 });
  });
});

/* ------------------------------------------------------------------ */
/* Outcome resolution                                                 */
/* ------------------------------------------------------------------ */

describe("resolveOutcome — deterministic execution model", () => {
  const base = { entry: 100, target: 102, stop: 98, policy: "conservative" as const };

  it("BUY: target-only touched → WIN at target", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 103, low: 99, close: 101 });
    expect(r).toMatchObject({ result: "WIN", exit: 102, targetHit: true, stopHit: false, ambiguous: false, grossPnl: 2 });
  });
  it("BUY: stop-only touched → LOSS at stop", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 101, low: 97, close: 99 });
    expect(r).toMatchObject({ result: "LOSS", exit: 98, grossPnl: -2 });
  });
  it("BUY: neither touched → FLAT at close", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 101.5, low: 99, close: 100.5 });
    expect(r).toMatchObject({ result: "FLAT", exit: 100.5, grossPnl: 0.5 });
  });
  it("SELL: symmetric target/stop resolution", () => {
    // For SELL, target=98 (below), stop=102 (above)
    const cfg = { entry: 100, target: 98, stop: 102, policy: "conservative" as const, signal: "SELL" as const };
    const win  = resolveOutcome({ ...cfg, high: 101, low: 97, close: 99 });
    expect(win).toMatchObject({ result: "WIN", exit: 98, grossPnl: 2 });
    const loss = resolveOutcome({ ...cfg, high: 103, low: 99, close: 101 });
    expect(loss).toMatchObject({ result: "LOSS", exit: 102, grossPnl: -2 });
  });

  describe("both-touched policy (daily-OHLC ambiguity)", () => {
    const bothIn = { high: 103, low: 97, close: 100 };
    it("conservative → LOSS at stop (default, worst-case)", () => {
      const r = resolveOutcome({ ...base, signal: "BUY", ...bothIn, policy: "conservative" });
      expect(r).toMatchObject({ result: "LOSS", exit: 98, ambiguous: true });
    });
    it("optimistic → WIN at target", () => {
      const r = resolveOutcome({ ...base, signal: "BUY", ...bothIn, policy: "optimistic" });
      expect(r).toMatchObject({ result: "WIN", exit: 102, ambiguous: true });
    });
    it("exclude_ambiguous → AMBIGUOUS (not counted in win/loss)", () => {
      const r = resolveOutcome({ ...base, signal: "BUY", ...bothIn, policy: "exclude_ambiguous" });
      expect(r).toMatchObject({ result: "AMBIGUOUS", ambiguous: true });
    });
  });

  it("BUY: gap above target → still WIN (target within [low,high])", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 110, low: 105, close: 108 });
    expect(r).toMatchObject({ result: "WIN", exit: 102, ambiguous: false });
  });
  it("BUY: gap below stop → LOSS", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 95, low: 90, close: 92 });
    expect(r).toMatchObject({ result: "LOSS", exit: 98 });
  });

  it("WAIT → SKIP", () => {
    const r = resolveOutcome({ ...base, signal: "WAIT", high: 105, low: 95, close: 100 });
    expect(r.result).toBe("SKIP");
  });
  it("missing target or stop → INVALID_SETUP (no fabricated level)", () => {
    expect(resolveOutcome({ signal: "BUY", entry: 100, target: null, stop: 98, high: 103, low: 97, close: 101, policy: "conservative" }).result).toBe("INVALID_SETUP");
    expect(resolveOutcome({ signal: "BUY", entry: 100, target: 102, stop: null, high: 103, low: 97, close: 101, policy: "conservative" }).result).toBe("INVALID_SETUP");
  });

  it("does not read future data: unused close on a win exits at target, not at close", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 103, low: 99, close: 999999 });
    expect(r.exit).toBe(102);
    expect(r.grossPnl).toBe(2);
  });

  it("zero costs preserve grossPnl === netPnl (byte-identical to legacy)", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 103, low: 99, close: 101, costs: ZERO_COSTS });
    expect(r.netPnl).toBe(r.grossPnl);
    expect(r.costs).toBe(0);
  });
  it("non-zero slippage subtracts from netPnl", () => {
    const r = resolveOutcome({
      ...base, signal: "BUY", high: 103, low: 99, close: 101,
      costs: { ...ZERO_COSTS, slippagePct: 0.05 },
    });
    expect(r.costs).toBeGreaterThan(0);
    expect(r.netPnl).toBeLessThan(r.grossPnl);
  });
});

/* ------------------------------------------------------------------ */
/* OHLC validation                                                    */
/* ------------------------------------------------------------------ */

describe("validateCandle", () => {
  it("accepts a well-formed candle", () => {
    expect(validateCandle({ date: "d", open: 100, high: 105, low: 99, close: 103 }).valid).toBe(true);
  });
  it("rejects high < low", () => {
    const r = validateCandle({ date: "d", open: 100, high: 90, low: 99, close: 95 });
    expect(r).toEqual({ valid: false, reason: "high < low" });
  });
  it("rejects open outside [low,high]", () => {
    expect(validateCandle({ date: "d", open: 200, high: 105, low: 99, close: 103 }).valid).toBe(false);
  });
  it("rejects close outside [low,high]", () => {
    expect(validateCandle({ date: "d", open: 100, high: 105, low: 99, close: 200 }).valid).toBe(false);
  });
  it("rejects non-finite values", () => {
    expect(validateCandle({ date: "d", open: NaN, high: 105, low: 99, close: 103 }).valid).toBe(false);
  });
});

describe("expectedTradingSessions", () => {
  it("counts weekdays only by default", () => {
    // Mon 2024-01-01 → Sun 2024-01-07 → 5 weekdays
    expect(expectedTradingSessions("2024-01-01", "2024-01-07")).toBe(5);
  });
  it("returns 0 for reversed range", () => {
    expect(expectedTradingSessions("2024-01-07", "2024-01-01")).toBe(0);
  });
  it("includes weekends when requested (BTC UTC boundary)", () => {
    expect(expectedTradingSessions("2024-01-01", "2024-01-07", true)).toBe(7);
  });
});

/* ------------------------------------------------------------------ */
/* Reproducibility                                                    */
/* ------------------------------------------------------------------ */

describe("hashConfig / computeRunId", () => {
  const cfg = {
    symbol: "NIFTY50", from: "2024-01-01", to: "2024-06-30",
    policy: "conservative" as const, invalidSetupPolicy: "fabricate" as const,
    costs: ZERO_COSTS, dataSource: "yahoo", timezone: "Asia/Kolkata",
  };
  it("hashConfig is deterministic across calls", () => {
    expect(hashConfig({ a: 1, b: 2 })).toBe(hashConfig({ a: 1, b: 2 }));
  });
  it("computeRunId is deterministic for the same config", () => {
    expect(computeRunId(cfg)).toBe(computeRunId({ ...cfg }));
  });
  it("computeRunId changes when the policy changes", () => {
    expect(computeRunId(cfg)).not.toBe(computeRunId({ ...cfg, policy: "optimistic" }));
  });
  it("computeRunId embeds engine and formula versions", () => {
    const id = computeRunId(cfg);
    expect(id).toContain(BACKTEST_ENGINE_VERSION);
    expect(id).toContain(BACKTEST_FORMULA_VERSION);
  });
});

/* ------------------------------------------------------------------ */
/* Statistics                                                         */
/* ------------------------------------------------------------------ */

describe("statistics", () => {
  it("median handles odd and even sample sizes", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it("stddev is 0 for a single sample and positive for scatter", () => {
    expect(stddev([5])).toBe(0);
    expect(stddev([1, 1, 1])).toBe(0);
    expect(stddev([1, 5, 9])).toBeGreaterThan(0);
  });
  it("sampleWarning uses the stated thresholds", () => {
    expect(sampleWarning(10)).toBe("INSUFFICIENT");
    expect(sampleWarning(30)).toBe("LIMITED");
    expect(sampleWarning(99)).toBe("LIMITED");
    expect(sampleWarning(100)).toBe("MEANINGFUL");
  });
  it("buildStats reports positive expectancy for a winning distribution", () => {
    const trades = [
      { result: "WIN", pnl: 2, pnlPct: 2 },
      { result: "WIN", pnl: 2, pnlPct: 2 },
      { result: "LOSS", pnl: -1, pnlPct: -1 },
    ];
    const s = buildStats(trades, 3, 3, 1);
    expect(s.expectancy).toBeGreaterThan(0);
    expect(s.payoffRatio).toBe(2);
    expect(s.recoveryFactor).toBe(3);
    expect(s.exposurePct).toBe(100);
    expect(s.sampleSize).toBe(3);
    expect(s.sampleWarning).toBe("INSUFFICIENT");
  });
});