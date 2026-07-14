import { describe, it, expect } from "vitest";
import {
  visibleCandles,
  assertNoFutureAccess,
  resolveTrade,
  computeReplayRunId,
  summarizeSession,
  type Candle,
  type ReplayConfig,
} from "./replay-engine";

function mkCandles(rows: [number, number, number, number, number][]): Candle[] {
  return rows.map(([o, h, l, c, v], i) => ({
    ts: 1_700_000_000_000 + i * 60_000,
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  }));
}

describe("visibleCandles / causality", () => {
  const cs = mkCandles([
    [1, 2, 0, 1.5, 10],
    [1.5, 3, 1, 2, 10],
    [2, 2.5, 1.5, 2.2, 10],
  ]);

  it("returns nothing before the first candle", () => {
    expect(visibleCandles(cs, -1)).toHaveLength(0);
  });
  it("returns candles inclusive of the current index", () => {
    expect(visibleCandles(cs, 1)).toHaveLength(2);
  });
  it("never leaks future candles beyond currentIndex", () => {
    const v = visibleCandles(cs, 0);
    expect(v).toHaveLength(1);
    expect(v[0].ts).toBe(cs[0].ts);
  });
  it("throws when a caller peeks at a future index", () => {
    expect(() => assertNoFutureAccess(3, 1)).toThrow(/REPLAY_CAUSALITY_ERROR/);
  });
  it("allows the current index", () => {
    expect(() => assertNoFutureAccess(1, 1)).not.toThrow();
  });
});

describe("resolveTrade", () => {
  const cs = mkCandles([
    [100, 101, 99, 100.5, 10], // signal candle
    [100.5, 105, 100, 104, 10], // next candle: target hit
    [104, 106, 103, 105, 10],
  ]);

  it("marks INVALID_SETUP without target/stop", () => {
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "next_open",
      target: null,
      stop: null,
      candles: cs,
      currentIndex: 2,
      policy: "conservative",
    });
    expect(r.status).toBe("INVALID_SETUP");
  });

  it("entry-mode next_open enters at next candle open", () => {
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "next_open",
      target: 104.5,
      stop: 99,
      candles: cs,
      currentIndex: 2,
      policy: "conservative",
    });
    expect(r.entryIndex).toBe(1);
    expect(r.entry).toBe(100.5);
  });

  it("hits target when high exceeds target before stop", () => {
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "next_open",
      target: 104.5,
      stop: 99,
      candles: cs,
      currentIndex: 2,
      policy: "conservative",
    });
    expect(r.status).toBe("TARGET_HIT");
    expect(r.exit).toBe(104.5);
  });

  it("hits stop when low breaks stop", () => {
    const bear = mkCandles([
      [100, 101, 99, 100, 10],
      [100, 100, 95, 96, 10],
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "signal_close",
      target: 110,
      stop: 97,
      candles: bear,
      currentIndex: 1,
      policy: "conservative",
    });
    expect(r.status).toBe("STOP_HIT");
    expect(r.exit).toBe(97);
  });

  it("both-touched → conservative policy maps to STOP", () => {
    const both = mkCandles([
      [100, 100, 100, 100, 10],
      [100, 110, 90, 100, 10],
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "next_open",
      target: 105,
      stop: 95,
      candles: both,
      currentIndex: 1,
      policy: "conservative",
    });
    expect(r.ambiguous).toBe(true);
    expect(r.status).toBe("STOP_HIT");
  });

  it("both-touched → optimistic policy maps to TARGET", () => {
    const both = mkCandles([
      [100, 100, 100, 100, 10],
      [100, 110, 90, 100, 10],
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "next_open",
      target: 105,
      stop: 95,
      candles: both,
      currentIndex: 1,
      policy: "optimistic",
    });
    expect(r.ambiguous).toBe(true);
    expect(r.status).toBe("TARGET_HIT");
  });

  it("remains ACTIVE while no target/stop hit yet", () => {
    const flat = mkCandles([
      [100, 101, 99, 100, 10],
      [100, 101, 99, 100, 10],
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "signal_close",
      target: 200,
      stop: 50,
      candles: flat,
      currentIndex: 1,
      policy: "conservative",
    });
    expect(r.status).toBe("ACTIVE");
    expect(r.exit).toBeNull();
  });

  it("tracks MFE and MAE correctly", () => {
    const path = mkCandles([
      [100, 100, 100, 100, 10],
      [100, 103, 98, 102, 10],
      [102, 104, 100, 101, 10],
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "signal_close",
      target: 200,
      stop: 50,
      candles: path,
      currentIndex: 2,
      policy: "conservative",
    });
    expect(r.mfe).toBeGreaterThanOrEqual(4);
    expect(r.mae).toBeLessThanOrEqual(-2);
  });

  it("does not read future candles beyond currentIndex", () => {
    const path = mkCandles([
      [100, 100, 100, 100, 10],
      [100, 101, 99, 100, 10],
      [100, 200, 0, 120, 10], // huge future candle
    ]);
    const r = resolveTrade({
      signal: "BUY",
      signalIndex: 0,
      entryMode: "signal_close",
      target: 150,
      stop: 50,
      candles: path,
      currentIndex: 1,
      policy: "conservative",
    });
    expect(r.status).toBe("ACTIVE");
    expect(r.exit).toBeNull();
  });
});

describe("computeReplayRunId", () => {
  const cfg: ReplayConfig = {
    symbol: "NIFTY50",
    date: "2024-01-05",
    timeframe: "5m",
    provider: "yahoo",
    entryMode: "next_open",
    policy: "conservative",
    costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0 },
  };

  it("is deterministic for identical configs", () => {
    expect(computeReplayRunId(cfg)).toBe(computeReplayRunId({ ...cfg }));
  });
  it("changes when any config field changes", () => {
    const a = computeReplayRunId(cfg);
    const b = computeReplayRunId({ ...cfg, timeframe: "15m" });
    expect(a).not.toBe(b);
  });
});

describe("summarizeSession", () => {
  it("aggregates PnL, wins, losses and drawdown", () => {
    const s = summarizeSession(
      [
        { signal: "BUY", entry: 100, exit: 105, pnl: 5, status: "TARGET_HIT", ambiguous: false },
        { signal: "SELL", entry: 100, exit: 103, pnl: -3, status: "STOP_HIT", ambiguous: false },
        { signal: "BUY", entry: 100, exit: 102, pnl: 2, status: "TARGET_HIT", ambiguous: true },
      ],
      { buy: 2, sell: 1, wait: 3 },
    );
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.ambiguous).toBe(1);
    expect(s.netPnl).toBe(4);
    expect(s.totalSignals).toBe(6);
    expect(s.maxDrawdown).toBe(3);
  });
});
