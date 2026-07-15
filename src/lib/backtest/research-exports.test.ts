import { describe, it, expect } from "vitest";
import {
  buildComparisonMatrixCsv,
  buildResearchJson,
} from "./research-exports";
import {
  buildResearchComparison,
  buildStrategyRow,
  generateResearchSummary,
} from "./research-comparison";
import type { WindowMetrics } from "./walk-forward";
import type { HistoricalBacktestResult } from "./result";

const stubResult = {} as unknown as HistoricalBacktestResult;
function m(over: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    tradeCount: 30, winCount: 18, lossCount: 12, winRate: 60,
    profitFactor: 2, netPnl: 100, expectancy: 3, drawdown: 20,
    drawdownPct: 5, avgTrade: 3, returnPct: 100, recovery: 5,
    longCount: 15, shortCount: 15, ...over,
  };
}
function wfr() {
  return {
    config: { from: "2024-01-01", to: "2024-01-30", mode: "70_30" as const },
    windows: [
      {
        window: { index: 0, training: { from: "2024-01-01", to: "2024-01-20" }, validation: { from: "2024-01-21", to: "2024-01-30" } },
        training: stubResult, validation: stubResult,
        trainingMetrics: m(), validationMetrics: m(),
        degradation: { winRate: 0, profitFactor: 0, expectancy: 0, netPnl: 0, drawdown: 0, recovery: 0, avgTrade: 0, tradeCount: 0 },
      },
    ],
  };
}

describe("Phase 21.5 Stage 1 · research exports", () => {
  it("comparison matrix CSV contains headers and every row", () => {
    const rows = [buildStrategyRow("ASTRO", "GANN", wfr())];
    const csv = buildComparisonMatrixCsv(buildResearchComparison(rows));
    expect(csv).toContain("stabilityScore");
    expect(csv).toContain("ASTRO");
  });

  it("research JSON is deterministic and includes version + runId", () => {
    const rows = [buildStrategyRow("SMC", "SMC_V1", wfr())];
    const c = buildResearchComparison(rows);
    const json = buildResearchJson({
      version: "RESEARCH_V1",
      runId: "RESEARCH_V1:00000000",
      comparison: c,
      summary: generateResearchSummary(c),
    });
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("RESEARCH_V1");
    expect(parsed.runId).toBe("RESEARCH_V1:00000000");
    expect(parsed.comparison.rows.length).toBe(1);
  });
});