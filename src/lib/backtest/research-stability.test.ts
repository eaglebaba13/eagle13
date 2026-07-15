import { describe, it, expect } from "vitest";
import {
  aggregateStability,
  classifyStatus,
  computeStabilityForWindow,
  STABILITY_WEIGHTS,
} from "./research-stability";
import type { WindowMetrics } from "./walk-forward";

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

describe("Phase 21.5 Stage 1 · stability", () => {
  it("weights sum to 1.0", () => {
    const sum = Object.values(STABILITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it("identical training + validation produces high stability score", () => {
    const m = metrics();
    const report = computeStabilityForWindow(m, m, {
      winRate: 0,
      profitFactor: 0,
      expectancy: 0,
      netPnl: 0,
      drawdown: 0,
      recovery: 0,
      avgTrade: 0,
      tradeCount: 0,
    });
    expect(report.score).toBeGreaterThan(90);
    expect(report.status).toBe("EXCELLENT");
  });

  it("large negative degradation lowers score", () => {
    const m = metrics();
    const report = computeStabilityForWindow(m, metrics({ netPnl: -100 }), {
      winRate: -50,
      profitFactor: -75,
      expectancy: -100,
      netPnl: -200,
      drawdown: 50,
      recovery: -100,
      avgTrade: -50,
      tradeCount: 0,
    });
    expect(report.score).toBeLessThan(50);
  });

  it("classifyStatus flags insufficient data", () => {
    expect(classifyStatus(90, 5)).toBe("INSUFFICIENT_DATA");
    expect(classifyStatus(90, 30)).toBe("EXCELLENT");
    expect(classifyStatus(70, 30)).toBe("GOOD");
    expect(classifyStatus(55, 30)).toBe("AVERAGE");
    expect(classifyStatus(35, 30)).toBe("WEAK");
    expect(classifyStatus(10, 30)).toBe("UNSTABLE");
  });

  it("aggregateStability averages window reports", () => {
    const m = metrics();
    const wfr = {
      config: { from: "a", to: "b", mode: "70_30" as const },
      windows: [
        {
          window: { index: 0, training: { from: "a", to: "b" }, validation: { from: "c", to: "d" } },
          training: {} as never,
          validation: {} as never,
          trainingMetrics: m,
          validationMetrics: m,
          degradation: {
            winRate: 0, profitFactor: 0, expectancy: 0, netPnl: 0,
            drawdown: 0, recovery: 0, avgTrade: 0, tradeCount: 0,
          },
        },
      ],
    };
    const r = aggregateStability(wfr);
    expect(r.score).toBeGreaterThan(90);
  });
});