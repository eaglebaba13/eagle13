import { describe, it, expect } from "vitest";
import {
  assertNoLeakage,
  computeDegradation,
  computeWindowMetrics,
  planWalkForwardWindows,
  runWalkForward,
  type WalkForwardConfig,
} from "./walk-forward";
import type { HistoricalBacktestResult, HistoricalTrade } from "./result";

function makeResult(trades: HistoricalTrade[]): HistoricalBacktestResult {
  let peak = 0, eq = 0, dd = 0;
  for (const t of trades) {
    eq += t.pnl;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  return {
    formulaVersion: "SMC_V1" as HistoricalBacktestResult["formulaVersion"],
    engineVersion: "e",
    executionVersion: "x",
    cubeVersion: "n/a",
    policyVersion: "p",
    runId: "test",
    generatedAt: "2024-06-04T00:00:00Z",
    instrument: "NIFTY50",
    from: trades[0]?.date ?? "2024-06-04",
    to: trades[trades.length - 1]?.date ?? "2024-06-04",
    dataGranularity: "5m",
    source: "test",
    dataQuality: null,
    trades,
    stats: {},
    monthly: [],
    equityCurve: [],
    drawdown: { max: dd, maxPct: 0 },
    benchmark: null,
    methodology: "",
    disclaimers: [],
    formulaMeta: {},
  };
}

function tr(date: string, side: "BUY" | "SELL", outcome: HistoricalTrade["outcome"], pnl: number): HistoricalTrade {
  return {
    id: `${date}-${side}`,
    date,
    side,
    entry: 100,
    stop: 99,
    target: 102,
    exit: outcome === "WIN" ? 102 : 99,
    outcome,
    pnl,
    mfe: null,
    mae: null,
    holdingTime: 30,
    formulaVersion: "SMC_V1" as HistoricalTrade["formulaVersion"],
    source: "test",
    ambiguous: false,
    reasons: [],
    metadata: {},
  };
}

describe("Phase 21.5 Stage 1 · walk-forward", () => {
  it("70/30 split is contiguous and non-overlapping", () => {
    const wins = planWalkForwardWindows({
      from: "2024-01-01",
      to: "2024-01-10",
      mode: "70_30",
    });
    expect(wins.length).toBe(1);
    expect(wins[0].training.from).toBe("2024-01-01");
    expect(wins[0].training.to).toBe("2024-01-07");
    expect(wins[0].validation.from).toBe("2024-01-08");
    expect(wins[0].validation.to).toBe("2024-01-10");
    assertNoLeakage(wins);
  });

  it("60/40 and 80/20 produce different train sizes", () => {
    const cfg: WalkForwardConfig = { from: "2024-01-01", to: "2024-01-10", mode: "60_40" };
    const a = planWalkForwardWindows(cfg);
    const b = planWalkForwardWindows({ ...cfg, mode: "80_20" });
    expect(a[0].training.to).toBe("2024-01-06");
    expect(b[0].training.to).toBe("2024-01-08");
  });

  it("rolling produces multiple non-overlapping validation windows", () => {
    const wins = planWalkForwardWindows({
      from: "2024-01-01",
      to: "2024-01-31",
      mode: "ROLLING",
      windowDays: 10,
      stepDays: 10,
    });
    expect(wins.length).toBeGreaterThan(1);
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i].validation.from > wins[i - 1].validation.to).toBe(true);
    }
    assertNoLeakage(wins);
  });

  it("expanding grows training window each step", () => {
    const wins = planWalkForwardWindows({
      from: "2024-01-01",
      to: "2024-01-31",
      mode: "EXPANDING",
      windowDays: 10,
      stepDays: 5,
    });
    expect(wins.length).toBeGreaterThan(1);
    // training.from is anchored to global from
    for (const w of wins) expect(w.training.from).toBe("2024-01-01");
    // training.to strictly grows
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i].training.to > wins[i - 1].training.to).toBe(true);
    }
    assertNoLeakage(wins);
  });

  it("assertNoLeakage detects future-leakage in a hand-crafted window", () => {
    expect(() =>
      assertNoLeakage([
        {
          index: 0,
          training: { from: "2024-01-01", to: "2024-01-10" },
          validation: { from: "2024-01-10", to: "2024-01-15" },
        },
      ]),
    ).toThrow(/leakage/);
  });

  it("computeWindowMetrics + degradation are deterministic", () => {
    const train = makeResult([
      tr("2024-01-01", "BUY", "WIN", 10),
      tr("2024-01-02", "SELL", "LOSS", -5),
      tr("2024-01-03", "BUY", "WIN", 10),
    ]);
    const val = makeResult([
      tr("2024-01-08", "BUY", "WIN", 8),
      tr("2024-01-09", "BUY", "LOSS", -4),
    ]);
    const tm = computeWindowMetrics(train);
    const vm = computeWindowMetrics(val);
    expect(tm.tradeCount).toBe(3);
    expect(vm.tradeCount).toBe(2);
    expect(tm.profitFactor).toBe(4);
    const deg = computeDegradation(tm, vm);
    expect(typeof deg.winRate).toBe("number");
    expect(typeof deg.profitFactor).toBe("number");
  });

  it("runWalkForward invokes runner training-first for each window", async () => {
    const cfg: WalkForwardConfig = {
      from: "2024-01-01",
      to: "2024-01-31",
      mode: "ROLLING",
      windowDays: 10,
      stepDays: 10,
    };
    const calls: string[] = [];
    const result = await runWalkForward(cfg, async (win, phase) => {
      calls.push(`${phase}:${win.from}->${win.to}`);
      return makeResult([tr(win.from, "BUY", "WIN", 5)]);
    });
    expect(result.windows.length).toBeGreaterThan(0);
    // Each window: training call before validation call.
    for (let i = 0; i < result.windows.length; i++) {
      expect(calls[i * 2].startsWith("training:")).toBe(true);
      expect(calls[i * 2 + 1].startsWith("validation:")).toBe(true);
    }
  });
});