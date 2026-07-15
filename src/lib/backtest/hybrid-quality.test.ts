import { describe, it, expect } from "vitest";
import { computeHybridQuality, HYBRID_QUALITY_FORMULAS } from "./hybrid-quality";
import { computeThreeWayAttribution } from "./attribution";
import type { HistoricalTrade } from "./result";

function t(
  date: string,
  side: "BUY" | "SELL",
  outcome: HistoricalTrade["outcome"],
  pnl: number,
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

describe("Phase 21.4 Stage 4C · hybrid quality metrics", () => {
  it("HYBRID_QUALITY_FORMULAS exposes every metric as human-readable string", () => {
    for (const v of Object.values(HYBRID_QUALITY_FORMULAS)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("computes retention/filtering/missed/false-agreement rates", () => {
    const astro = [
      t("2024-06-04", "BUY", "WIN", 10),
      t("2024-06-05", "SELL", "LOSS", -5),
      t("2024-06-06", "BUY", "WIN", 8),
      t("2024-06-07", "BUY", "LOSS", -7),
    ];
    const hybrid = [
      t("2024-06-04", "BUY", "WIN", 10),
      t("2024-06-07", "BUY", "LOSS", -7),
    ];
    const attribution = computeThreeWayAttribution(astro, [], hybrid);
    const q = computeHybridQuality(
      {
        BUY: 2,
        SELL: 0,
        WAIT: 4,
        CONFLICT: 1,
        DATA_INCOMPLETE: 1,
        FORMULA_MISMATCH: 0,
      },
      hybrid.length,
      attribution,
    );
    expect(q.totalDecisions).toBe(8);
    expect(q.agreementRate).toBe(25);
    expect(q.conflictRate).toBe(12.5);
    expect(q.waitRate).toBe(50);
    expect(q.winnerRetentionRate).toBe(50); // 1 kept / 2 winners total
    expect(q.loserFilteringRate).toBe(50); // 1 filtered / 2 losers total
    expect(q.missedWinnerRate).toBe(50);
    expect(q.falseAgreementRate).toBe(50); // 1 kept loser / 2 kept
    expect(q.hybridConversionRate).toBe(100);
  });
});