import { describe, it, expect } from "vitest";
import {
  calculateMaxPain,
  classifyStrikeBuildup,
  analyzeOiBuildup,
  computeGammaExposure,
  synthesizeDealerPositioning,
} from "./index";

describe("Derivatives Analytics Engine", () => {
  describe("Max Pain Engine", () => {
    it("returns null for empty strikes", () => {
      const res = calculateMaxPain({ strikes: [], spotPrice: 24500 });
      expect(res.maxPainStrike).toBeNull();
      expect(res.bias).toBe("UNKNOWN");
    });

    it("correctly identifies the minimum loss strike for writers", () => {
      // 3 strikes: 24000, 24100, 24200
      // 24000: CE OI = 100, PE OI = 500
      // 24100: CE OI = 300, PE OI = 300
      // 24200: CE OI = 500, PE OI = 100
      //
      // If expires at 24000:
      // Call Loss: 0
      // Put Loss: 300*(24100-24000) + 100*(24200-24000) = 30000 + 20000 = 50,000
      // Total = 50,000
      //
      // If expires at 24100:
      // Call Loss: 100*(24100-24000) = 10,000
      // Put Loss: 100*(24200-24100) = 10,000
      // Total = 20,000  <-- Minimum
      //
      // If expires at 24200:
      // Call Loss: 100*(24200-24000) + 300*(24200-24100) = 20000 + 30000 = 50,000
      // Put Loss: 0
      // Total = 50,000
      const strikes = [
        { strike: 24000, callOi: 100, putOi: 500 },
        { strike: 24100, callOi: 300, putOi: 300 },
        { strike: 24200, callOi: 500, putOi: 100 },
      ];

      const res = calculateMaxPain({ strikes, spotPrice: 24100 });
      expect(res.maxPainStrike).toBe(24100);
      expect(res.minPayoff).toBe(20000);
      expect(res.bias).toBe("AT_SPOT");
      expect(res.distanceFromSpot).toBe(0);
    });

    it("evaluates bias when Max Pain is above spot", () => {
      const strikes = [
        { strike: 24000, callOi: 100, putOi: 1000 },
        { strike: 24500, callOi: 500, putOi: 500 },
      ];
      const res = calculateMaxPain({ strikes, spotPrice: 24000 });
      expect(res.maxPainStrike).toBe(24500);
      expect(res.bias).toBe("ABOVE_SPOT");
      expect(res.distanceFromSpot).toBe(500);
    });
  });

  describe("OI Buildup Engine", () => {
    it("classifies all 4 fundamental buildup quadrants", () => {
      // Long Buildup: Price ↑, OI ↑
      expect(classifyStrikeBuildup(10, 500, "CE").regime).toBe("LONG_BUILDUP");
      expect(classifyStrikeBuildup(10, 500, "CE").sentiment).toBe("BULLISH");

      // Short Buildup: Price ↓, OI ↑
      expect(classifyStrikeBuildup(-10, 500, "CE").regime).toBe("SHORT_BUILDUP");
      expect(classifyStrikeBuildup(-10, 500, "CE").sentiment).toBe("BEARISH");

      // Short Covering: Price ↑, OI ↓
      expect(classifyStrikeBuildup(10, -500, "CE").regime).toBe("SHORT_COVERING");
      expect(classifyStrikeBuildup(10, -500, "CE").sentiment).toBe("BULLISH");

      // Long Unwinding: Price ↓, OI ↓
      expect(classifyStrikeBuildup(-10, -500, "CE").regime).toBe("LONG_UNWINDING");
      expect(classifyStrikeBuildup(-10, -500, "CE").sentiment).toBe("BEARISH");
    });

    it("analyzes aggregate chain buildup", () => {
      const legs = [
        { strike: 24000, side: "CE" as const, ltp: 120, priceChange: 15, oi: 10000, changeOi: 2000 },
        { strike: 24100, side: "CE" as const, ltp: 60, priceChange: 10, oi: 15000, changeOi: 1500 },
        { strike: 24000, side: "PE" as const, ltp: 40, priceChange: -8, oi: 20000, changeOi: 3000 },
      ];

      const agg = analyzeOiBuildup(legs);
      expect(agg.counts.longBuildup).toBe(2);
      expect(agg.counts.shortBuildup).toBe(1);
      expect(agg.institutionalSentiment).toBe("BULLISH");
    });
  });

  describe("Gamma Exposure Engine", () => {
    it("computes Net GEX and identifies zero flip", () => {
      const strikes = [
        { strike: 24000, callOi: 2000, putOi: 10000 },
        { strike: 24100, callOi: 5000, putOi: 5000 },
        { strike: 24200, callOi: 12000, putOi: 2000 },
      ];

      const res = computeGammaExposure(strikes, 24100, 2);
      expect(res.strikes.length).toBe(3);
      expect(res.gammaWallStrike).toBeDefined();
      expect(res.zeroGammaFlipLevel).toBeDefined();
      expect(res.totalNetGex).toBeDefined();
    });
  });

  describe("Dealer Positioning Synthesizer", () => {
    it("synthesizes strong bullish conditions", () => {
      const res = synthesizeDealerPositioning({
        pcrOi: 1.35,
        maxPainStrike: 24300,
        spotPrice: 24100,
        totalNetGex: 50000000,
        zeroGammaFlipLevel: 24050,
        gammaWallStrike: 24500,
        institutionalSentiment: "BULLISH",
      });

      expect(res.bias).toBe("STRONG_BULLISH");
      expect(res.institutionalScore).toBeGreaterThan(0.4);
      expect(res.factors.pcr.status).toBe("BULLISH");
      expect(res.factors.maxPain.status).toBe("BULLISH");
      expect(res.factors.gamma.status).toBe("BULLISH");
      expect(res.factors.buildup.status).toBe("BULLISH");
    });

    it("synthesizes neutral equilibrium gracefully", () => {
      const res = synthesizeDealerPositioning({
        pcrOi: 1.0,
        maxPainStrike: 24100,
        spotPrice: 24100,
        totalNetGex: 0,
        zeroGammaFlipLevel: 24100,
        gammaWallStrike: 24100,
        institutionalSentiment: "NEUTRAL",
      });

      expect(res.bias).toBe("NEUTRAL");
      expect(Math.abs(res.institutionalScore)).toBeLessThan(0.15);
    });
  });
});

