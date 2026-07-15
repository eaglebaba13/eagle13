import { describe, it, expect } from "vitest";
import { computeThreeWayAttribution } from "./attribution";
import type { HistoricalTrade } from "./result";

function trade(
  date: string,
  side: "BUY" | "SELL",
  outcome: HistoricalTrade["outcome"],
  pnl: number,
  overrides: Partial<HistoricalTrade> = {},
): HistoricalTrade {
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
    mfe: pnl > 0 ? pnl : 1,
    mae: pnl < 0 ? pnl : -1,
    holdingTime: 30,
    formulaVersion: "SMC_V1" as HistoricalTrade["formulaVersion"],
    source: "test",
    ambiguous: false,
    reasons: [],
    metadata: {},
    ...overrides,
  };
}

describe("Phase 21.4 Stage 4C · three-way attribution", () => {
  it("classifies kept winners, filtered losers, missed winners and kept losers", () => {
    const astro = [
      trade("2024-06-04", "BUY", "WIN", 10),  // hybrid kept & won
      trade("2024-06-05", "SELL", "LOSS", -5), // hybrid filtered
      trade("2024-06-06", "BUY", "WIN", 8),   // hybrid missed
      trade("2024-06-07", "BUY", "LOSS", -7), // hybrid kept & lost
    ];
    const smc: HistoricalTrade[] = [];
    const hybrid = [
      trade("2024-06-04", "BUY", "WIN", 10),
      trade("2024-06-07", "BUY", "LOSS", -7),
    ];
    const a = computeThreeWayAttribution(astro, smc, hybrid);
    expect(a.HYBRID_KEPT_ASTRO_WINNER.count).toBe(1);
    expect(a.HYBRID_FILTERED_ASTRO_LOSER.count).toBe(1);
    expect(a.HYBRID_MISSED_ASTRO_WINNER.count).toBe(1);
    expect(a.HYBRID_KEPT_ASTRO_LOSER.count).toBe(1);
    expect(a.totals.count).toBe(2);
  });

  it("splits ASTRO_ONLY vs SMC_ONLY", () => {
    const astro = [trade("2024-06-04", "BUY", "WIN", 10)];
    const smc = [trade("2024-06-05", "SELL", "WIN", 12)];
    const a = computeThreeWayAttribution(astro, smc, []);
    expect(a.ASTRO_ONLY.count).toBe(1);
    expect(a.SMC_ONLY.count).toBe(1);
  });

  it("carries non-trade counters from diagnostics", () => {
    const a = computeThreeWayAttribution([], [], [], {
      agreementNoTradeCount: 7,
      conflictBlockedCount: 3,
      dataIncompleteCount: 2,
    });
    expect(a.AGREEMENT_NO_TRADE.count).toBe(7);
    expect(a.CONFLICT_BLOCKED.count).toBe(3);
    expect(a.DATA_INCOMPLETE.count).toBe(2);
  });

  it("computes profit factor and expectancy", () => {
    const astro = [
      trade("2024-06-04", "BUY", "WIN", 20),
      trade("2024-06-05", "BUY", "LOSS", -10),
    ];
    const hybrid = [
      trade("2024-06-04", "BUY", "WIN", 20),
      trade("2024-06-05", "BUY", "LOSS", -10),
    ];
    const a = computeThreeWayAttribution(astro, [], hybrid);
    expect(a.totals.count).toBe(2);
    expect(a.totals.profitFactor).toBe(2);
    expect(a.totals.expectancy).toBe(5);
  });
});