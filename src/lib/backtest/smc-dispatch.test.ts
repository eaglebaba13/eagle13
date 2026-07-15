import { describe, it, expect } from "vitest";
import { runUnifiedBacktest } from "./unified";
import { INTRADAY_FORMULA_VERSIONS } from "../engine-version";
import { computeConflictBuckets } from "../../components/backtest/CompareAstroSmc";

describe("Phase 21.4 Stage 4A · SMC unified dispatch", () => {
  it("same config + same candles + same signals → identical Run ID (determinism)", async () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({
      t: i * 300_000, o: 100, h: 102, l: 99, c: 101, v: 10,
    }));
    const signals = candles.map((_, i) => ({
      index: i, signal: "WAIT" as const, direction: null,
      score: 0, bias: "neutral" as const, structureDirection: null,
      reasons: [], triggeredRules: [], missingRules: [],
    }));
    const args = {
      strategy: "SMC" as const,
      formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50",
      from: "2024-01-01",
      to: "2024-01-31",
      source: "Zerodha#abcd1234#5m",
      extras: { candles, signals },
    };
    const a = await runUnifiedBacktest(args);
    const b = await runUnifiedBacktest(args);
    expect(a.runId).toBe(b.runId);
  });

  it("data hash change (different source string) → different Run ID", async () => {
    const candles = Array.from({ length: 10 }, (_, i) => ({
      t: i * 300_000, o: 100, h: 102, l: 99, c: 101, v: 10,
    }));
    const signals = candles.map((_, i) => ({
      index: i, signal: "WAIT" as const, direction: null,
      score: 0, bias: "neutral" as const, structureDirection: null,
      reasons: [], triggeredRules: [], missingRules: [],
    }));
    const a = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-31",
      source: "Zerodha#hash-a#5m",
      extras: { candles, signals },
    });
    const b = await runUnifiedBacktest({
      strategy: "SMC", formula: INTRADAY_FORMULA_VERSIONS.SMC_V1,
      instrument: "NIFTY50", from: "2024-01-01", to: "2024-01-31",
      source: "Zerodha#hash-b#5m",
      extras: { candles, signals },
    });
    expect(a.runId).not.toBe(b.runId);
  });
});

describe("Phase 21.4 Stage 4A · Compare conflict buckets", () => {
  it("aligns Astro/SMC signals per date without merging trades", () => {
    const astro = new Map<string, "BUY" | "SELL" | "WAIT">([
      ["2024-06-01", "BUY"],
      ["2024-06-02", "SELL"],
      ["2024-06-03", "BUY"],
      ["2024-06-04", "WAIT"],
      ["2024-06-05", "BUY"],
    ]);
    const smc = new Map<string, "BUY" | "SELL">([
      ["2024-06-01", "BUY"],
      ["2024-06-02", "BUY"],
      ["2024-06-03", "SELL"],
      ["2024-06-06", "SELL"],
    ]);
    const b = computeConflictBuckets(astro, smc);
    expect(b.astroBuySmcBuy).toBe(1); // 06-01
    expect(b.astroSellSmcBuy).toBe(1); // 06-02
    expect(b.astroBuySmcSell).toBe(1); // 06-03
    expect(b.astroSellSmcSell).toBe(0);
    expect(b.astroOnly).toBe(1); // 06-05 astro BUY, no SMC
    expect(b.smcOnly).toBe(1); // 06-06 SMC only
  });
});