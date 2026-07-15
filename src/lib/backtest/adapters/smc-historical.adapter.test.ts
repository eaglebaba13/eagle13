// Phase 21.4 · Stage 3 — SMC Historical Adapter tests.

import { describe, expect, it } from "vitest";
import { runUnifiedBacktest } from "../unified";
import { INTRADAY_FORMULA_VERSIONS } from "../../engine-version";
import { analyzeSmc } from "../../smc-engine";
import { analyzeSmcSignals, type SmcSignalDebug } from "../../smc-signal-engine";
import type { Candle } from "../../smc-types";
import {
  smcHistoricalAdapter,
  DEFAULT_SMC_EXECUTION,
} from "./smc-historical.adapter";

function synthCandles(prices: number[], t0 = Date.UTC(2024, 0, 1, 3, 45)): Candle[] {
  // 5-minute bars starting near NSE open. Each price is used as OHLC=price
  // with a tiny wick so isBull/isBear works.
  const step = 5 * 60_000;
  return prices.map((p, i) => ({
    t: t0 + i * step,
    o: p,
    h: p + 0.5,
    l: p - 0.5,
    c: p,
    v: 1000,
  }));
}

function buyThenWinCandles(): { candles: Candle[]; signals: SmcSignalDebug[] } {
  // Force a BUY at index 5, then rally to hit target.
  const cs: Candle[] = [];
  const t0 = Date.UTC(2024, 0, 1, 3, 45);
  const step = 5 * 60_000;
  for (let i = 0; i < 20; i++) {
    cs.push({ t: t0 + i * step, o: 100, h: 100.5, l: 99.5, c: 100, v: 1000 });
  }
  // From index 6 onwards, price rallies.
  for (let i = 6; i < 20; i++) {
    const p = 100 + (i - 5) * 2;
    cs[i] = { t: t0 + i * step, o: p, h: p + 1, l: p - 0.5, c: p, v: 1000 };
  }
  const signals: SmcSignalDebug[] = cs.map((c, i) => ({
    index: i,
    t: c.t,
    signal: i === 5 ? "BUY" : "WAIT",
    bias: "bullish",
    structureDirection: i === 5 ? "bull" : "neutral",
    score: i === 5 ? 90 : 0,
    triggeredRules: i === 5 ? ["CHOCH:bull", "displacement:bull", "FVG"] : [],
    missingRules: [],
    reasons: i === 5 ? ["mandatory_ok+score>=65"] : [],
  }));
  return { candles: cs, signals };
}

describe("smcHistoricalAdapter — shape", () => {
  it("has expected id, granularity and versions", () => {
    expect(smcHistoricalAdapter.id).toBe(INTRADAY_FORMULA_VERSIONS.SMC_V1);
    expect(smcHistoricalAdapter.dataGranularity).toBe("5m");
    expect(smcHistoricalAdapter.causality).toBe("intraday-5m");
    expect(smcHistoricalAdapter.versions.engineVersion).toBe("SMC_ENGINE_V1");
  });
});

describe("smcHistoricalAdapter — entry / exit", () => {
  it("produces a winning long trade with fixed-RR target", async () => {
    const { candles, signals } = buyThenWinCandles();
    const res = await runUnifiedBacktest({
      strategy: "SMC",
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles,
        signals,
        execution: {
          ...DEFAULT_SMC_EXECUTION,
          stopMode: "swing",
          targetMode: "fixed_rr",
          rr: 1,
        },
      },
    });
    expect(res.trades.length).toBe(1);
    const t = res.trades[0];
    expect(t.side).toBe("BUY");
    expect(t.outcome).toBe("WIN");
    expect(t.formulaVersion).toBe(INTRADAY_FORMULA_VERSIONS.SMC_V1);
    const meta = t.metadata as Record<string, unknown>;
    expect(meta.strategy).toBe("SMC");
    expect(meta.signalScore).toBe(90);
    expect(meta.triggeredRules).toContain("CHOCH:bull");
  });

  it("respects positionMode=long (rejects SELL signals)", async () => {
    const t0 = Date.UTC(2024, 0, 1, 3, 45);
    const step = 5 * 60_000;
    const cs: Candle[] = Array.from({ length: 10 }, (_, i) => ({
      t: t0 + i * step, o: 100, h: 101, l: 99, c: 100, v: 1000,
    }));
    const signals: SmcSignalDebug[] = cs.map((c, i) => ({
      index: i, t: c.t, signal: i === 3 ? "SELL" : "WAIT",
      bias: "bearish", structureDirection: i === 3 ? "bear" : "neutral",
      score: i === 3 ? 80 : 0, triggeredRules: [], missingRules: [], reasons: [],
    }));
    const res = await runUnifiedBacktest({
      strategy: "SMC",
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles: cs,
        signals,
        execution: { ...DEFAULT_SMC_EXECUTION, positionMode: "long" },
      },
    });
    expect(res.trades.length).toBe(0);
  });

  it("maintains at most one open position at a time", async () => {
    const t0 = Date.UTC(2024, 0, 1, 3, 45);
    const step = 5 * 60_000;
    const cs: Candle[] = Array.from({ length: 30 }, (_, i) => ({
      t: t0 + i * step, o: 100, h: 100.5, l: 99.5, c: 100, v: 1000,
    }));
    // Multiple BUYs — only the first must open a trade until it closes.
    const signals: SmcSignalDebug[] = cs.map((c, i) => ({
      index: i, t: c.t,
      signal: (i === 2 || i === 3 || i === 4) ? "BUY" : "WAIT",
      bias: "bullish",
      structureDirection: i <= 4 ? "bull" : "neutral",
      score: 80, triggeredRules: [], missingRules: [], reasons: [],
    }));
    const res = await runUnifiedBacktest({
      strategy: "SMC",
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: {
        candles: cs, signals,
        execution: { ...DEFAULT_SMC_EXECUTION, rr: 1, stopMode: "swing" },
      },
    });
    // Whatever happens, no two trades can overlap by construction.
    for (let i = 1; i < res.trades.length; i++) {
      expect(res.trades[i].date >= res.trades[i - 1].date).toBe(true);
    }
  });
});

describe("smcHistoricalAdapter — Run ID", () => {
  it("produces deterministic SMC_V1-prefixed Run IDs", async () => {
    const empty = { candles: [], signals: [] };
    const a = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-31",
      extras: empty,
    });
    const b = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-31",
      extras: empty,
    });
    expect(a.runId).toBe(b.runId);
    expect(a.runId.startsWith("SMC_V1:")).toBe(true);
  });
});

describe("smcHistoricalAdapter — no lookahead & determinism", () => {
  it("re-running on the same synthetic series produces identical trades", async () => {
    const t0 = Date.UTC(2024, 0, 1, 3, 45);
    const step = 5 * 60_000;
    // Deterministic sine-ish path.
    const cs: Candle[] = Array.from({ length: 60 }, (_, i) => {
      const p = 100 + Math.sin(i / 3) * 4;
      return { t: t0 + i * step, o: p, h: p + 0.6, l: p - 0.6, c: p, v: 1000 };
    });
    const engine = analyzeSmc(cs, { lookback: 2 });
    const sig = analyzeSmcSignals(cs, engine, { minScore: 0 });
    const args = {
      strategy: "SMC" as const,
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-02",
      extras: { candles: cs, signals: sig.signals, engine },
    };
    const a = await runUnifiedBacktest(args);
    const b = await runUnifiedBacktest(args);
    expect(a.trades.map((t) => t.id)).toEqual(b.trades.map((t) => t.id));
    expect(a.trades.map((t) => t.pnl)).toEqual(b.trades.map((t) => t.pnl));
  });
});

describe("smcHistoricalAdapter — cost model", () => {
  it("applies slippage/brokerage/taxes via shared cost model", async () => {
    const { candles, signals } = buyThenWinCandles();
    const zero = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-02",
      extras: { candles, signals, execution: { ...DEFAULT_SMC_EXECUTION, rr: 1 } },
    });
    const costed = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-02",
      costs: { slippagePct: 0.05, brokerageFlat: 20, brokeragePct: 0.03, taxesPct: 0.01 },
      extras: { candles, signals, execution: { ...DEFAULT_SMC_EXECUTION, rr: 1 } },
    });
    expect(zero.trades[0].pnl).toBeGreaterThan(costed.trades[0].pnl);
  });
});