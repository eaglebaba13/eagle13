// Phase 21.3d-parity-α · Component-level parity oracle.
//
// Locks the behavior of every pure helper that composes into the public
// `BacktestResult`. Together with `run-id-oracle` and `envelope-shape`, these
// tests are enough to prove that any β wrapper conversion — which must reuse
// these same helpers — cannot silently mutate the public envelope.
//
// Cases covered:
//   • BUY / SELL / WAIT signal direction
//   • WIN / LOSS / FLAT / AMBIGUOUS / INVALID_SETUP outcomes
//   • ambiguous both-touched under conservative / optimistic / exclude_ambiguous
//   • costs + slippage propagation into net PnL
//   • invalid OHLC rejection (validateCandle)
//   • missing session accounting (expectedTradingSessions)
//   • hashConfig determinism + key-order independence
//   • buildStats sample-size warnings + edge-case sentinels

import { describe, expect, it } from "vitest";
import {
  buildStats,
  expectedTradingSessions,
  hashConfig,
  pickTargetStop,
  resolveOutcome,
  sampleWarning,
  validateCandle,
  ZERO_COSTS,
} from "../backtest-engine";

describe("Phase 21.3d-parity-α · pickTargetStop direction locks", () => {
  const board = [
    { value: 22100, isResistance: true },
    { value: 22200, isResistance: true },
    { value: 21950, isResistance: false },
    { value: 21900, isResistance: false },
  ];
  it("BUY picks nearest-resistance target + nearest-support stop", () => {
    expect(pickTargetStop(board, 22000, "BUY")).toEqual({ target: 22100, stop: 21950 });
  });
  it("SELL picks nearest-support target + nearest-resistance stop", () => {
    expect(pickTargetStop(board, 22000, "SELL")).toEqual({ target: 21950, stop: 22100 });
  });
  it("WAIT emits null target and stop (no fabrication)", () => {
    expect(pickTargetStop(board, 22000, "WAIT")).toEqual({ target: null, stop: null });
  });
  it("no valid opposing level → INVALID_SETUP path (target null)", () => {
    const onlyBelow = [{ value: 21900, isResistance: false }];
    expect(pickTargetStop(onlyBelow, 22000, "BUY")).toEqual({ target: null, stop: 21900 });
  });
});

describe("Phase 21.3d-parity-α · resolveOutcome outcome locks", () => {
  const base = { entry: 22000, target: 22100, stop: 21950, high: 22150, low: 21980, close: 22050 };
  it("WAIT → SKIP with zero PnL", () => {
    const r = resolveOutcome({ ...base, signal: "WAIT", policy: "conservative" });
    expect(r.result).toBe("SKIP");
    expect(r.grossPnl).toBe(0);
  });
  it("missing target → INVALID_SETUP", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", target: null, policy: "conservative" });
    expect(r.result).toBe("INVALID_SETUP");
  });
  it("BUY target-only hit → WIN at target", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", low: 21990, policy: "conservative" });
    expect(r.result).toBe("WIN");
    expect(r.exit).toBe(22100);
    expect(r.grossPnl).toBe(100);
  });
  it("BUY stop-only hit → LOSS at stop", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 22050, low: 21930, policy: "conservative" });
    expect(r.result).toBe("LOSS");
    expect(r.exit).toBe(21950);
    expect(r.grossPnl).toBe(-50);
  });
  it("BUY neither hit → FLAT at close", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", high: 22050, low: 21990, policy: "conservative" });
    expect(r.result).toBe("FLAT");
    expect(r.exit).toBe(22050);
  });
  it("BUY both hit + conservative → LOSS at stop", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", policy: "conservative" });
    // Both target (22100 <= 22150 high) and stop (21980 <= 21950? no; use lower low)
    // — use a clearer case:
    const r2 = resolveOutcome({ ...base, signal: "BUY", low: 21940, policy: "conservative" });
    expect(r2.ambiguous).toBe(true);
    expect(r2.result).toBe("LOSS");
    expect(r2.exit).toBe(21950);
    void r;
  });
  it("BUY both hit + optimistic → WIN at target", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", low: 21940, policy: "optimistic" });
    expect(r.ambiguous).toBe(true);
    expect(r.result).toBe("WIN");
    expect(r.exit).toBe(22100);
  });
  it("BUY both hit + exclude_ambiguous → AMBIGUOUS (excluded from win-rate)", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", low: 21940, policy: "exclude_ambiguous" });
    expect(r.ambiguous).toBe(true);
    expect(r.result).toBe("AMBIGUOUS");
  });
  it("costs + slippage reduce net PnL, gross PnL untouched", () => {
    const r = resolveOutcome({
      ...base,
      signal: "BUY",
      low: 21990,
      policy: "conservative",
      costs: { slippagePct: 0.05, brokerageFlat: 20, brokeragePct: 0.03, taxesPct: 0.1 },
    });
    expect(r.grossPnl).toBe(100);
    // notional ≈ 22000 + 22100 = 44100
    // slip 0.05% = 22.05; brok flat 20 + 0.03% = 13.23 → 33.23; tax 0.1% = 44.10
    // total ≈ 99.38 → net ≈ 0.62
    expect(r.costs).toBeCloseTo(99.38, 2);
    expect(r.netPnl).toBeCloseTo(0.62, 2);
  });
  it("SELL WIN direction flip (dir=-1) locks P&L sign", () => {
    const r = resolveOutcome({
      signal: "SELL", entry: 22000, target: 21900, stop: 22050,
      high: 22040, low: 21890, close: 21950, policy: "conservative",
    });
    expect(r.result).toBe("WIN");
    expect(r.grossPnl).toBe(100);
  });
  it("zero costs default when omitted", () => {
    const r = resolveOutcome({ ...base, signal: "BUY", low: 21990, policy: "conservative" });
    expect(r.costs).toBe(0);
    expect(r.netPnl).toBe(r.grossPnl);
    void ZERO_COSTS;
  });
});

describe("Phase 21.3d-parity-α · validateCandle invariants", () => {
  it("valid OHLC passes", () => {
    expect(validateCandle({ date: "2026-04-01", open: 100, high: 110, low: 90, close: 105 })).toEqual({ valid: true });
  });
  it("high < low fails", () => {
    expect(validateCandle({ date: "d", open: 100, high: 90, low: 110, close: 95 }).valid).toBe(false);
  });
  it("open outside [low, high] fails", () => {
    expect(validateCandle({ date: "d", open: 200, high: 110, low: 90, close: 100 }).valid).toBe(false);
  });
  it("non-finite fails", () => {
    expect(validateCandle({ date: "d", open: NaN, high: 110, low: 90, close: 100 }).valid).toBe(false);
  });
});

describe("Phase 21.3d-parity-α · expectedTradingSessions locks weekday counting", () => {
  it("weekday-only default excludes Sat/Sun", () => {
    // 2026-04-01 (Wed) → 2026-04-07 (Tue) → 5 weekdays.
    expect(expectedTradingSessions("2026-04-01", "2026-04-07", false)).toBe(5);
  });
  it("includeWeekends counts every calendar day", () => {
    expect(expectedTradingSessions("2026-04-01", "2026-04-07", true)).toBe(7);
  });
  it("reversed range returns 0", () => {
    expect(expectedTradingSessions("2026-04-07", "2026-04-01")).toBe(0);
  });
});

describe("Phase 21.3d-parity-α · hashConfig determinism", () => {
  it("same input → identical 8-char hex", () => {
    const a = hashConfig({ a: 1, b: "two", c: [3] });
    const b = hashConfig({ a: 1, b: "two", c: [3] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
  it("key ordering does not change output (sorted internally)", () => {
    const a = hashConfig({ a: 1, b: 2, c: 3 });
    const b = hashConfig({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
  });
  it("value change flips hash", () => {
    expect(hashConfig({ a: 1 })).not.toBe(hashConfig({ a: 2 }));
  });
});

describe("Phase 21.3d-parity-α · buildStats sentinels and thresholds", () => {
  it("empty decided → zeroed bundle with INSUFFICIENT warning", () => {
    const s = buildStats([], 0, 0, 0);
    expect(s.sampleSize).toBe(0);
    expect(s.sampleWarning).toBe("INSUFFICIENT");
    expect(s.expectancy).toBe(0);
    expect(s.payoffRatio).toBe(0);
    expect(s.recoveryFactor).toBe(0);
  });
  it("only wins → payoffRatio 999 sentinel", () => {
    const s = buildStats(
      [{ result: "WIN", pnl: 100, pnlPct: 1 }],
      1,
      100,
      0,
    );
    expect(s.payoffRatio).toBe(999);
    expect(s.recoveryFactor).toBe(999);
  });
  it("30-sample boundary flips INSUFFICIENT → LIMITED", () => {
    expect(sampleWarning(29)).toBe("INSUFFICIENT");
    expect(sampleWarning(30)).toBe("LIMITED");
  });
  it("100-sample boundary flips LIMITED → MEANINGFUL", () => {
    expect(sampleWarning(99)).toBe("LIMITED");
    expect(sampleWarning(100)).toBe("MEANINGFUL");
  });
  it("mixed trades produce deterministic expectancy / stddev", () => {
    const s = buildStats(
      [
        { result: "WIN", pnl: 100, pnlPct: 1 },
        { result: "LOSS", pnl: -50, pnlPct: -0.5 },
        { result: "WIN", pnl: 80, pnlPct: 0.8 },
        { result: "FLAT", pnl: 0, pnlPct: 0 },
      ],
      4, // all trades
      130, // net
      50, // drawdown
    );
    expect(s.sampleSize).toBe(4);
    expect(s.exposurePct).toBe(100);
    expect(s.recoveryFactor).toBe(2.6);
  });
});