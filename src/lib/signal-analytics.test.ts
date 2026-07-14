import { describe, it, expect } from "vitest";
import { computeAnalytics, buildInsights } from "./signal-analytics";
import type { BacktestResult, BacktestTrade } from "./backtest.functions";

function trade(overrides: Partial<BacktestTrade>): BacktestTrade {
  return {
    date: "2024-01-02",
    time: "09:15",
    symbol: "NIFTY50",
    signal: "BUY",
    strength: "STRONG",
    confidence: 70,
    entry: 100,
    exit: 101,
    high: 102,
    low: 99,
    target: 102,
    stop: 98,
    targetHit: true,
    stopHit: false,
    result: "WIN",
    pnl: 2,
    pnlPct: 2,
    moonSign: "Aries",
    moonNakshatra: "Ashwini",
    retroCount: 0,
    nearest: "Sun Support",
    dayOfWeek: "Mon",
    month: "2024-01",
    ...overrides,
  };
}

function fakeResult(trades: BacktestTrade[]): BacktestResult {
  return {
    symbol: "NIFTY50",
    yahooSymbol: "^NSEI",
    label: "NIFTY 50",
    from: "2024-01-01",
    to: "2024-12-31",
    candles: trades.length + 1,
    trades,
    summary: {
      totalSignals: trades.length,
      buy: trades.filter((t) => t.signal === "BUY").length,
      sell: trades.filter((t) => t.signal === "SELL").length,
      wait: trades.filter((t) => t.signal === "WAIT").length,
      taken: trades.filter((t) => t.result === "WIN" || t.result === "LOSS" || t.result === "FLAT").length,
      wins: trades.filter((t) => t.result === "WIN").length,
      losses: trades.filter((t) => t.result === "LOSS").length,
      flats: trades.filter((t) => t.result === "FLAT").length,
      winRate: 0, lossRate: 0, accuracy: 0,
      avgProfit: 0, avgLoss: 0,
      profitFactor: 0, netProfit: 0, maxDrawdown: 0,
      maxConsecWins: 0, maxConsecLosses: 0, avgHoldingDays: 1,
      bestMonth: null, worstMonth: null,
    },
    monthly: [],
    insights: {
      bestNakshatra: null, worstNakshatra: null,
      bestMoonSign: null, worstMoonSign: null,
      bestRetroCombo: null, worstRetroCombo: null,
      mostSuccessfulSignal: null, mostFailedSignal: null,
    },
    equityCurve: trades.map((_, i) => ({ date: `2024-01-${String(i + 1).padStart(2, "0")}`, cumulative: i })),
    generatedAt: new Date(0).toISOString(),
    runId: "test",
    engineVersion: "1.0.0",
    formulaVersion: "astro-levels@1",
    astroFormulaVersion: "GANN_NIFTY_ASTRO_V1_1",
    configHash: "aaaaaaaa",
    executionMeta: {
      policy: "conservative",
      invalidSetupPolicy: "fabricate",
      costs: { slippagePct: 0, brokerageFlat: 0, brokeragePct: 0, taxesPct: 0 },
      astroAnchor: "09:00 IST",
      entryTime: "09:15 IST",
      exitAssumption: "test",
      dataSource: "Test",
      timezone: "Asia/Kolkata",
      candleTimeframe: "1d",
    },
    dataQuality: {
      expectedSessions: trades.length, loadedSessions: trades.length,
      missingSessions: 0, invalidSessions: 0, coveragePct: 100,
      dataSource: "Test", adjusted: "unadjusted",
    },
    stats: {
      sampleSize: trades.length, sampleWarning: "INSUFFICIENT",
      expectancy: 0, median: 0, stddev: 0,
      sharpeLike: 0, sortinoLike: 0, payoffRatio: 0, recoveryFactor: 0, exposurePct: 0,
    },
    benchmark: null,
    ambiguousCount: 0, invalidSetupCount: 0,
    disclaimers: [],
  };
}

describe("computeAnalytics — pure aggregation over BacktestTrade[]", () => {
  const trades: BacktestTrade[] = [
    trade({ date: "2024-01-01", dayOfWeek: "Mon", moonNakshatra: "Ashwini", moonSign: "Aries", retroCount: 0, signal: "BUY",  result: "WIN",  pnl: 5 }),
    trade({ date: "2024-01-02", dayOfWeek: "Tue", moonNakshatra: "Ashwini", moonSign: "Aries", retroCount: 1, signal: "BUY",  result: "LOSS", pnl: -3 }),
    trade({ date: "2024-02-15", dayOfWeek: "Thu", moonNakshatra: "Bharani", moonSign: "Aries", retroCount: 2, signal: "SELL", result: "WIN",  pnl: 4 }),
    trade({ date: "2024-05-20", dayOfWeek: "Mon", moonNakshatra: "Rohini",  moonSign: "Taurus", retroCount: 3, signal: "WAIT", result: "SKIP", pnl: 0 }),
    trade({ date: "2024-05-21", dayOfWeek: "Tue", moonNakshatra: "Ashwini", moonSign: "Aries",  retroCount: 0, signal: "BUY",  result: "FLAT", pnl: 0.5 }),
  ];
  const a = computeAnalytics(fakeResult(trades));

  it("nakshatra bucket sums to decided trades only", () => {
    const ash = a.nakshatra.find((b) => b.key === "Ashwini")!;
    expect(ash.trades).toBe(3); // WIN + LOSS + FLAT
    expect(ash.wins).toBe(1);
    expect(ash.losses).toBe(1);
    expect(ash.flats).toBe(1);
  });

  it("signal breakdown separates BUY / SELL / WAIT", () => {
    const sig = new Map(a.signalBreakdown.map((b) => [b.key, b]));
    expect(sig.get("BUY")!.trades).toBe(3);
    expect(sig.get("SELL")!.trades).toBe(1);
    // WAIT trades are SKIP and therefore never decided; the bucket may be absent.
    expect(sig.get("WAIT")?.trades ?? 0).toBe(0);
  });

  it("retrograde buckets use the ordered labels", () => {
    const keys = a.retrograde.map((b) => b.key);
    for (const k of keys) expect(["0 Retro", "1 Retro", "2 Retro", "3+ Retro"]).toContain(k);
  });

  it("weekday order stays Mon → Sun", () => {
    const keys = a.dayOfWeek.map((b) => b.key);
    const expected = ["Mon", "Tue", "Thu"]; // only these weekdays present
    expect(keys).toEqual(expected);
  });

  it("month order follows Jan → Dec", () => {
    const keys = a.month.map((b) => b.key);
    expect(keys).toEqual(["Jan", "Feb", "May"]);
  });

  it("confusion matrix counts correct/failed per signal", () => {
    const buy = a.confusion.find((c) => c.signal === "BUY")!;
    expect(buy.correct).toBe(1);
    expect(buy.failed).toBe(1);
    expect(buy.flat).toBe(1);
    expect(buy.total).toBe(3);
    const wait = a.confusion.find((c) => c.signal === "WAIT")!;
    expect(wait.correct).toBe(1);
  });

  it("drawdown returns non-negative summary for a monotonic curve", () => {
    expect(a.drawdown.maxDrawdown).toBe(0);
  });

  it("planet grouping uses the first word of the `nearest` field", () => {
    // All test trades have nearest = "Sun Support" → all in the Sun bucket
    expect(a.planet[0].key).toBe("Sun");
    expect(a.planet[0].trades).toBe(4); // 5 rows, 1 is a WAIT/SKIP and dropped
  });

  it("top summary reflects the input trades", () => {
    expect(a.top.wins).toBe(2);
    expect(a.top.losses).toBe(1);
    expect(a.top.flats).toBe(1);
  });

  it("buildInsights produces at least one bull and one bear insight", () => {
    const ins = buildInsights(a);
    expect(ins.some((i) => i.tone === "bull")).toBe(true);
    expect(ins.some((i) => i.tone === "bear")).toBe(true);
  });
});

describe("computeAnalytics — drawdown with a peak/trough", () => {
  const trades: BacktestTrade[] = [
    trade({ date: "2024-01-01", result: "WIN", pnl: 10 }),
    trade({ date: "2024-01-02", result: "LOSS", pnl: -4 }),
    trade({ date: "2024-01-03", result: "LOSS", pnl: -3 }),
    trade({ date: "2024-01-04", result: "WIN", pnl: 8 }),
  ];
  const r = {
    ...({} as BacktestResult),
    trades,
    equityCurve: [
      { date: "2024-01-01", cumulative: 10 },
      { date: "2024-01-02", cumulative: 6 },
      { date: "2024-01-03", cumulative: 3 },
      { date: "2024-01-04", cumulative: 11 },
    ],
    summary: {
      totalSignals: 4, buy: 4, sell: 0, wait: 0, taken: 4,
      wins: 2, losses: 2, flats: 0,
      winRate: 50, lossRate: 50, accuracy: 50,
      avgProfit: 9, avgLoss: 3.5, profitFactor: 2.57,
      netProfit: 11, maxDrawdown: 7,
      maxConsecWins: 1, maxConsecLosses: 2, avgHoldingDays: 1,
      bestMonth: null, worstMonth: null,
    },
    stats: { sampleSize: 4, sampleWarning: "INSUFFICIENT" as const, expectancy: 2.75, median: 0, stddev: 0, sharpeLike: 0, sortinoLike: 0, payoffRatio: 0, recoveryFactor: 0, exposurePct: 0 },
  };
  const a = computeAnalytics(r as unknown as BacktestResult);
  it("captures the peak-to-trough drop", () => {
    expect(a.drawdown.maxDrawdown).toBe(7); // 10 → 3
  });
  it("reports recovery days from the trough", () => {
    expect(a.drawdown.recoveryDays).toBe(1); // trough at idx 2, back above peak at idx 3
  });
});