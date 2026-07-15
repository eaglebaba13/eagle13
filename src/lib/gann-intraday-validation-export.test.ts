import { describe, it, expect } from "vitest";
import {
  historyToSummaryCsv,
  historyToJson,
  historyExportFilename,
} from "./gann-intraday-validation-export";
import type { HistoryResult } from "./gann-intraday-history.functions";
import { GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION } from "./engine-version";

const sample: HistoryResult = {
  version: GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION,
  runId: "GANN_ASTRO_INTRADAY_ABSOLUTE_V1:deadbeef",
  instrument: "NIFTY50",
  months: 3,
  from: "2026-04-01",
  to: "2026-06-30",
  ambiguousPolicy: "conservative",
  attempted: 2,
  loaded: 2,
  failed: 0,
  sessionsSummary: [
    { tradingDate: "2026-06-29", status: "HISTORICAL_LOCKED", candles: 75, missing: 0, totalTrades: 2, wins: 1, losses: 1, netPnL: 0 },
    { tradingDate: "2026-06-30", status: "HISTORICAL_LOCKED", candles: 75, missing: 0, totalTrades: 1, wins: 1, losses: 0, netPnL: 51 },
  ],
  metrics: {
    sessions: 2, totalTrades: 3, wins: 2, losses: 1, ambiguous: 0, buys: 2, sells: 1,
    missedChase: 0, cubeApproved: 3, cubeRejected: 0,
    firstTouches: 3, confirmed: 3, retest: 3,
    winRate: 2 / 3, profitFactor: 2, expectancy: 17, netPnL: 51,
    maxDrawdown: 51, maxConsecutiveWins: 1, maxConsecutiveLosses: 1,
    avgMfe: 40, avgMae: -10,
  },
  causalityFailures: 0,
  labeledAs: "VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION",
  generatedAt: "2026-07-15T00:00:00.000Z",
};

describe("Phase 21.2 Stage 5 · validation exports", () => {
  it("CSV is deterministic for identical input", () => {
    expect(historyToSummaryCsv(sample)).toBe(historyToSummaryCsv(sample));
  });
  it("JSON is deterministic for identical input", () => {
    expect(historyToJson(sample)).toBe(historyToJson(sample));
  });
  it("CSV embeds version, run id, and validation label", () => {
    const csv = historyToSummaryCsv(sample);
    expect(csv).toContain(GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION);
    expect(csv).toContain(sample.runId);
    expect(csv).toContain("VALIDATION_ONLY_NOT_A_LIVE_TRADE_RECOMMENDATION");
  });
  it("Filename follows convention", () => {
    expect(historyExportFilename(sample, "csv")).toBe(
      "GANN_ABSOLUTE_INTRADAY_VALIDATION_NIFTY50_2026-04-01_2026-06-30.csv",
    );
  });
});