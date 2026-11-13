import { describe, it, expect } from "vitest";
import {
  classifyCoaScenario,
  evaluateSideDominance,
  calculateReversalLevels,
  computeStockFourLine,
  processOptionChainToLtpCalculator,
  type ShiftingState,
} from "./ltp-calculator-engine.server";
import { makeStrike, type OptionChainStrike, type OptionChainSnapshot } from "../option-chain/types";

describe("EagleBABA LTP Calculator & COA 1.0 Engine", () => {
  describe("Chart of Accuracy (COA 1.0) 9-Scenario Classifier", () => {
    it("Scenario 1: Support STRONG & Resistance STRONG -> Ideal Range", () => {
      const res = classifyCoaScenario("STRONG", "STRONG");
      expect(res.scenarioId).toBe(1);
      expect(res.sentiment).toBe("RANGEBOUND");
      expect(res.color).toBe("gold");
      expect(res.badgeText).toContain("COA #1");
      expect(res.recommendation).toContain("Buy Call at EOS");
      expect(res.recommendation).toContain("Buy Put at EOR");
    });

    it("Scenario 2: Support STRONG & Resistance WTT -> Bullish Breakout", () => {
      const res = classifyCoaScenario("STRONG", "WTT");
      expect(res.scenarioId).toBe(2);
      expect(res.sentiment).toBe("BULLISH");
      expect(res.color).toBe("emerald");
      expect(res.badgeText).toContain("COA #2");
      expect(res.recommendation).toContain("EOR+1");
    });

    it("Scenario 3: Support STRONG & Resistance WTB -> Bearish Shift", () => {
      const res = classifyCoaScenario("STRONG", "WTB");
      expect(res.scenarioId).toBe(3);
      expect(res.sentiment).toBe("BEARISH");
      expect(res.color).toBe("rose");
      expect(res.badgeText).toContain("COA #3");
      expect(res.recommendation).toContain("EOS-1");
    });

    it("Scenario 4: Support WTT & Resistance STRONG -> Bullish Shift", () => {
      const res = classifyCoaScenario("WTT", "STRONG");
      expect(res.scenarioId).toBe(4);
      expect(res.sentiment).toBe("BULLISH");
      expect(res.color).toBe("emerald");
      expect(res.badgeText).toContain("COA #4");
      expect(res.recommendation).toContain("Support is climbing");
    });

    it("Scenario 5: Support WTB & Resistance STRONG -> Bearish Shift", () => {
      const res = classifyCoaScenario("WTB", "STRONG");
      expect(res.scenarioId).toBe(5);
      expect(res.sentiment).toBe("BEARISH");
      expect(res.color).toBe("rose");
      expect(res.badgeText).toContain("COA #5");
      expect(res.recommendation).toContain("EOS-1");
    });

    it("Scenario 6: Support WTT & Resistance WTB -> Converging Range / Both Side Risky", () => {
      const res = classifyCoaScenario("WTT", "WTB");
      expect(res.scenarioId).toBe(6);
      expect(res.sentiment).toBe("BOTH_SIDE_RISKY");
      expect(res.color).toBe("amber");
      expect(res.badgeText).toContain("COA #6");
    });

    it("Scenario 7: Support WTT & Resistance WTT -> Pure Bull Run (Strict No Puts)", () => {
      const res = classifyCoaScenario("WTT", "WTT");
      expect(res.scenarioId).toBe(7);
      expect(res.sentiment).toBe("EXTREMELY_BULLISH");
      expect(res.color).toBe("emerald");
      expect(res.badgeText).toContain("COA #7");
      expect(res.recommendation).toContain("STRICT NO PUTS");
    });

    it("Scenario 8: Support WTB & Resistance WTB -> Pure Blood Bath (Strict No Calls)", () => {
      const res = classifyCoaScenario("WTB", "WTB");
      expect(res.scenarioId).toBe(8);
      expect(res.sentiment).toBe("EXTREMELY_BEARISH");
      expect(res.color).toBe("rose");
      expect(res.badgeText).toContain("COA #8");
      expect(res.recommendation).toContain("STRICT NO CALLS");
    });

    it("Scenario 9: Support WTB & Resistance WTT -> Diverging Expansion / Both Side Risky", () => {
      const res = classifyCoaScenario("WTB", "WTT");
      expect(res.scenarioId).toBe(9);
      expect(res.sentiment).toBe("BOTH_SIDE_RISKY");
      expect(res.color).toBe("amber");
      expect(res.badgeText).toContain("COA #9");
    });
  });

  describe("Dominance & Shifting Thresholds (75% Matrix)", () => {
    it("classifies as STRONG when second highest strike is under 75%", () => {
      const strikes: OptionChainStrike[] = [
        makeStrike(25000, { volume: 100000, oi: 50000, ltp: 120 }),
        makeStrike(25100, { volume: 74000, oi: 30000, ltp: 60 }), // 74% < 75%
        makeStrike(25200, { volume: 40000, oi: 20000, ltp: 25 }),
      ];

      const res = evaluateSideDominance(strikes, "CALL", 25050);
      expect(res.state).toBe("STRONG");
      expect(res.dominantStrike).toBe(25000);
      expect(res.items[0].isMaxVol).toBe(true);
      expect(res.items[1].isWttVol).toBe(false);
    });

    it("classifies as WTT (Weak Towards Top) when challenger >= 75% at higher strike", () => {
      const strikes: OptionChainStrike[] = [
        makeStrike(25000, { volume: 100000, oi: 80000, ltp: 130 }), // max
        makeStrike(25100, { volume: 82000, oi: 40000, ltp: 75 }), // 82% at higher strike -> WTT
        makeStrike(25200, { volume: 20000, oi: 10000, ltp: 30 }),
      ];

      const res = evaluateSideDominance(strikes, "CALL", 25050);
      expect(res.state).toBe("WTT");
      expect(res.dominantStrike).toBe(25000);
      expect(res.items[1].isWttVol).toBe(true);
      expect(res.items[1].volPct).toBe(82);
    });

    it("classifies as WTB (Weak Towards Bottom) when challenger >= 75% at lower strike", () => {
      const strikes: OptionChainStrike[] = [
        makeStrike(25000, { volume: 40000, oi: 85000, ltp: 40 }), // 85% at lower strike -> WTB
        makeStrike(25100, { volume: 60000, oi: 100000, ltp: 80 }), // max OI at 25100
        makeStrike(25200, { volume: 20000, oi: 30000, ltp: 140 }),
      ];

      const res = evaluateSideDominance(strikes, "CALL", 25050);
      expect(res.state).toBe("WTB");
      expect(res.items[0].isWtbOi).toBe(true);
      expect(res.items[0].oiPct).toBe(85);
    });
  });

  describe("Exact Reversal & Diversion Calculations", () => {
    it("calculates exact dot-to-dot reversal prices anchored to live LTP", () => {
      const strikes: OptionChainStrike[] = [
        makeStrike(25100, { ltp: 145 }, { ltp: 45 }),
        makeStrike(25200, { ltp: 80 }, { ltp: 80 }),
        makeStrike(25300, { ltp: 35 }, { ltp: 135 }),
      ];

      const levels = calculateReversalLevels(strikes, 25200, 25200, 25300);

      // Support strike 25200 with Put LTP 80:
      // EOS = 25200 - 80 = 25120
      expect(levels.eos).toBe(25120);

      // EOS - 1 (at 25100 with Put LTP 45):
      // EOS - 1 = 25100 - 45 = 25055
      expect(levels.eosMinus1).toBe(25055);

      // Resistance strike 25300 with Call LTP 35:
      // EOR = 25300 + 35 = 25335
      expect(levels.eor).toBe(25335);

      // Safe entries
      expect(levels.sModerate).toBe(25120);
      expect(levels.rModerate).toBe(25335);

      // Risky entries have 0.25 strike buffer
      expect(levels.sRisky).toBeGreaterThan(levels.sModerate);
      expect(levels.rRisky).toBeLessThan(levels.rModerate);
    });
  });

  describe("Stocks 4-Line Mode & Risk Scoring", () => {
    it("computes P2, P1, C1, C2 and low risk score when stock trades near trigger lines", () => {
      const inst = {
        symbol: "RELIANCE",
        name: "Reliance Industries",
        sector: "Energy",
        category: "FO_EQUITY" as const,
        marketCap: "Large Cap" as const,
        beta: 1.05,
        baseIV: 18.5,
        defaultPrice: 1250.0,
      };

      const res = computeStockFourLine(inst, 1250.0);

      expect(res.symbol).toBe("RELIANCE");
      expect(res.p2).toBeGreaterThan(res.p1);
      expect(res.p1).toBeGreaterThan(res.c1);
      expect(res.c1).toBeGreaterThan(res.c2);

      // Entry targets and SL
      expect(res.bullishEntry).toBe(res.c1);
      expect(res.bullishSl).toBeLessThan(res.c2);
      expect(res.bullishTarget1).toBe(res.p1);

      expect(res.bearishEntry).toBe(res.p1);
      expect(res.bearishSl).toBeGreaterThan(res.p2);
      expect(res.bearishTarget1).toBe(res.c1);

      // When price is forced right at C1, bullish risk is minimal (0)
      const atC1 = computeStockFourLine(inst, res.c1);
      expect(atC1.bullishRisk).toBeLessThanOrEqual(1);
      expect(atC1.isAtTrigger).toBe(true);
      expect(atC1.triggerType).toBe("BULLISH_C1_C2");

      // When price is forced right at P1, bearish risk is minimal (0)
      const atP1 = computeStockFourLine(inst, res.p1);
      expect(atP1.bearishRisk).toBeLessThanOrEqual(1);
      expect(atP1.isAtTrigger).toBe(true);
      expect(atP1.triggerType).toBe("BEARISH_P1_P2");
    });
  });

  describe("End-to-End Master Process", () => {
    it("processes complete OptionChainSnapshot into LtpCalculatorOutput", () => {
      const strikes: OptionChainStrike[] = [
        makeStrike(25000, { volume: 50000, oi: 20000, ltp: 180 }, { volume: 100000, oi: 90000, ltp: 30 }),
        makeStrike(25100, { volume: 80000, oi: 50000, ltp: 110 }, { volume: 80000, oi: 75000, ltp: 60 }),
        makeStrike(25200, { volume: 150000, oi: 120000, ltp: 55 }, { volume: 40000, oi: 30000, ltp: 110 }),
        makeStrike(25300, { volume: 120000, oi: 95000, ltp: 20 }, { volume: 15000, oi: 10000, ltp: 175 }),
      ];

      const snapshot: OptionChainSnapshot = {
        instrument: "NIFTY",
        spotPrice: 25150,
        timestamp: new Date().toISOString(),
        provider: "UPSTOX",
        expiry: "2026-11-19",
        availableExpiries: ["2026-11-19"],
        marketSession: "OPEN",
        dataQuality: "OK",
        strikes,
      };

      const out = processOptionChainToLtpCalculator(snapshot);

      expect(out.underlying).toBe("NIFTY");
      expect(out.spotPrice).toBe(25150);
      expect(out.atmStrike).toBe(25100);
      expect(out.coaScenario).toBeDefined();
      expect(out.reversalLevels.eos).toBeGreaterThan(0);
      expect(out.reversalLevels.eor).toBeGreaterThan(0);
      expect(out.callStrikes.length).toBe(4);
      expect(out.putStrikes.length).toBe(4);
      // Reversal prices attached
      expect(out.callStrikes[0].reversalPrice).toBe(25000 + 180);
      expect(out.putStrikes[0].reversalPrice).toBe(25000 - 30);
    });
  });
});
