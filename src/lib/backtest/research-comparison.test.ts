import { describe, it, expect } from "vitest";
import {
  buildResearchComparison,
  buildStrategyRow,
  generateResearchSummary,
} from "./research-comparison";
import type { WalkForwardResult } from "./walk-forward";
import type { WindowMetrics } from "./walk-forward";
import type { HistoricalBacktestResult } from "./result";

const stubResult = {} as unknown as HistoricalBacktestResult;

function metrics(over: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    tradeCount: 30,
    winCount: 18,
    lossCount: 12,
    winRate: 60,
    profitFactor: 2,
    netPnl: 100,
    expectancy: 3,
    drawdown: 20,
    drawdownPct: 5,
    avgTrade: 3,
    returnPct: 100,
    recovery: 5,
    longCount: 15,
    shortCount: 15,
    ...over,
  };
}

function wfr(training: WindowMetrics, validation: WindowMetrics): WalkForwardResult {
  return {
    config: { from: "2024-01-01", to: "2024-01-30", mode: "70_30" },
    windows: [
      {
        window: { index: 0, training: { from: "2024-01-01", to: "2024-01-20" }, validation: { from: "2024-01-21", to: "2024-01-30" } },
        training: stubResult,
        validation: stubResult,
        trainingMetrics: training,
        validationMetrics: validation,
        degradation: {
          winRate: 0, profitFactor: 0, expectancy: 0, netPnl: 0,
          drawdown: 0, recovery: 0, avgTrade: 0, tradeCount: 0,
        },
      },
    ],
  };
}

describe("Phase 21.5 Stage 1 · research comparison", () => {
  it("builds a strategy row with averaged metrics", () => {
    const row = buildStrategyRow("SMC", "SMC_V1", wfr(metrics(), metrics()));
    expect(row.strategy).toBe("SMC");
    expect(row.training.tradeCount).toBe(30);
    expect(row.stability.score).toBeGreaterThan(90);
  });

  it("summary picks most / least stable", () => {
    const strong = buildStrategyRow("ASTRO", "GANN", wfr(metrics(), metrics()));
    const weak = buildStrategyRow(
      "SMC",
      "SMC_V1",
      wfr(metrics(), metrics({ tradeCount: 5, netPnl: -50 })),
    );
    const summary = generateResearchSummary(buildResearchComparison([strong, weak]));
    expect(summary.mostStable).toBe("ASTRO");
    expect(summary.leastStable).toBe("SMC");
    expect(summary.weaknesses.length).toBeGreaterThan(0);
  });

  it("empty comparison returns empty summary", () => {
    const s = generateResearchSummary(buildResearchComparison([]));
    expect(s.bestExpectancy).toBeNull();
    expect(s.mostStable).toBeNull();
  });
});