import { describe, it, expect } from "vitest";
import {
  resolveInstrument,
  isUpstoxSupported,
  UPSTOX_SUPPORTED_SYMBOLS,
} from "./provider-foundation/upstox/upstox-instruments.server";
import {
  UPSTOX_INSTRUMENT_MAP,
  REVERSE_INSTRUMENT_MAP,
} from "./provider-foundation/upstox/upstox-ws-adapter.server";
import { LIVE_SYMBOLS, validSelection } from "./live-candle-contract";
import { getInstrumentPolicy } from "./gann-intraday-policy";
import { computeCycleBounds } from "./gann-absolute-levels";
import { computeLevels } from "./levels";
import { MockOptionChainProvider } from "./option-chain/mock-provider";
import { calculateMaxPain } from "./derivatives-analytics/max-pain";
import { computeGammaExposure } from "./derivatives-analytics/gamma-exposure";

describe("Priority 6: BSE SENSEX Expansion Verification Suite", () => {
  describe("1. Upstox V3 Market Feed & Streaming Foundation", () => {
    it("resolves canonical BSE SENSEX instrument from master", () => {
      expect(isUpstoxSupported("SENSEX")).toBe(true);
      expect(UPSTOX_SUPPORTED_SYMBOLS).toContain("SENSEX");

      const inst = resolveInstrument("SENSEX");
      expect(inst).not.toBeNull();
      expect(inst?.instrumentKey).toBe("BSE_INDEX|SENSEX");
      expect(inst?.exchange).toBe("BSE");
      expect(inst?.tradingSymbol).toBe("SENSEX");
      expect(inst?.name).toBe("BSE SENSEX");
      expect(inst?.instrumentType).toBe("INDEX");
      expect(inst?.timezone).toBe("Asia/Kolkata");
    });

    it("maps SENSEX in Upstox WebSocket forward and reverse instrument maps", () => {
      expect(UPSTOX_INSTRUMENT_MAP["SENSEX"]).toBe("BSE_INDEX|SENSEX");
      expect(REVERSE_INSTRUMENT_MAP["BSE_INDEX|SENSEX"]).toBe("SENSEX");
      expect(REVERSE_INSTRUMENT_MAP["BSE_INDEX|Sensex"]).toBe("SENSEX");
      expect(REVERSE_INSTRUMENT_MAP["BSE_INDEX|1"]).toBe("SENSEX");
    });

    it("preserves canonical NIFTY50, BANKNIFTY, and INDIA_VIX feeds unaffected", () => {
      expect(UPSTOX_INSTRUMENT_MAP["NIFTY50"]).toBe("NSE_INDEX|Nifty 50");
      expect(UPSTOX_INSTRUMENT_MAP["BANKNIFTY"]).toBe("NSE_INDEX|Nifty Bank");
      expect(UPSTOX_INSTRUMENT_MAP["INDIA_VIX"]).toBe("NSE_INDEX|India VIX");
      expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|Nifty 50"]).toBe("NIFTY50");
      expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|Nifty Bank"]).toBe("BANKNIFTY");
      expect(REVERSE_INSTRUMENT_MAP["NSE_INDEX|India VIX"]).toBe("INDIA_VIX");
    });

    it("authorizes SENSEX in live candle contract and selection validator", () => {
      expect(LIVE_SYMBOLS).toContain("SENSEX");
      expect(validSelection("SENSEX", 60000)).toBe(true);
      expect(validSelection("SENSEX", 180000)).toBe(true);
      expect(validSelection("SENSEX", 300000)).toBe(true);
      expect(validSelection("SENSEX", 900000)).toBe(true);
      expect(validSelection("SENSEX", 3600000)).toBe(true);
      expect(validSelection("SENSEX", 86400000)).toBe(true);
      expect(validSelection("SENSEX", 42000)).toBe(false); // invalid interval
    });
  });

  describe("2. SENSEX Weekly Option Chain & Derivatives Analytics", () => {
    it("generates calibrated SENSEX option chain with 100-pt strike increments at 80,000 spot", async () => {
      const provider = new MockOptionChainProvider({ scenario: "SIDEWAYS" });
      const res = await provider.fetchSnapshot({ underlying: "SENSEX" });

      expect(res.ok).toBe(true);
      expect(res.snapshot).not.toBeNull();
      const snap = res.snapshot!;
      expect(snap.instrument).toBe("SENSEX");
      expect(snap.spotPrice).toBe(80_000);
      expect(snap.strikes.length).toBeGreaterThanOrEqual(15);

      // Verify 100-pt strike increments
      const strikes = snap.strikes.map((s) => s.strike);
      for (let i = 1; i < strikes.length; i++) {
        expect(strikes[i] - strikes[i - 1]).toBe(100);
      }

      // Verify ATM strike is centered near 80,000
      expect(strikes).toContain(80_000);
    });

    it("calculates Max Pain for SENSEX strikes", async () => {
      const provider = new MockOptionChainProvider({ scenario: "SIDEWAYS" });
      const res = await provider.fetchSnapshot({ underlying: "SENSEX" });
      const snap = res.snapshot!;

      const maxPainInput = {
        spotPrice: snap.spotPrice,
        strikes: snap.strikes.map((s) => ({
          strike: s.strike,
          callOi: s.call.oi ?? 0,
          putOi: s.put.oi ?? 0,
        })),
      };

      const result = calculateMaxPain(maxPainInput);
      expect(result.maxPainStrike).toBeGreaterThan(75_000);
      expect(result.maxPainStrike).toBeLessThan(85_000);
      expect(result.minPayoff).toBeGreaterThan(0);
      expect(result.payoffTable.length).toBe(snap.strikes.length);
    });

    it("computes Net Gamma Exposure and Zero-Gamma flip level for SENSEX", async () => {
      const provider = new MockOptionChainProvider({ scenario: "BULLISH" });
      const res = await provider.fetchSnapshot({ underlying: "SENSEX" });
      const snap = res.snapshot!;

      const strikesInput = snap.strikes.map((s) => ({
        strike: s.strike,
        callOi: s.call.oi ?? 0,
        putOi: s.put.oi ?? 0,
        callGamma: s.call.greeks?.gamma,
        putGamma: s.put.greeks?.gamma,
        callIv: s.call.iv ?? 0.15,
        putIv: s.put.iv ?? 0.15,
      }));

      const gex = computeGammaExposure(strikesInput, snap.spotPrice ?? 80_000, 3);

      expect(gex.regime).toBeDefined();
      expect(gex.totalCallGex).toBeGreaterThan(0);
      expect(gex.strikes.length).toBe(snap.strikes.length);
      expect(Number.isFinite(gex.totalNetGex)).toBe(true);
    });
  });

  describe("3. Quantitative Astro & Gann Square of 9 Adaptation", () => {
    it("calibrates Gann Intraday policy for SENSEX in 80,000+ spot territory", () => {
      const policy = getInstrumentPolicy("SENSEX");
      expect(policy.symbol).toBe("SENSEX");
      expect(policy.safeDistance).toBe(350);
      expect(policy.clusterTolerancePoints).toBe(15);
      expect(policy.exact360TolerancePoints).toBe(25);
      expect(policy.maximumEntryDeviation).toBe(35);
      expect(policy.stopLossPoints).toBe(125);
      expect(policy.targetPoints).toBe(125);
    });

    it("computes 360° cycle bounds for SENSEX spot", () => {
      const bounds = computeCycleBounds(80234);
      expect(bounds.lowerCycleIndex).toBe(222);
      expect(bounds.upperCycleIndex).toBe(223);
      expect(bounds.lowerMultiple).toBe(222 * 360); // 79,920
      expect(bounds.upperMultiple).toBe(223 * 360); // 80,280
      expect(bounds.previousClose).toBe(80234);
      expect(bounds.lowerMultiple).toBeLessThan(80234);
      expect(bounds.upperMultiple).toBeGreaterThan(80234);
    });

    it("calibrates Gann Square of 9 projections from close price for SENSEX", () => {
      const ohlc = {
        open: 80100,
        high: 80450,
        low: 79950,
        close: 80200,
        date: "2026-11-05",
      };

      const levels = computeLevels(ohlc, 350);

      // Pivot / CPR levels
      expect(levels.pivot).toBeCloseTo((80450 + 79950 + 80200) / 3, 2);
      expect(levels.safeBuy).toBe(80200 + 350);
      expect(levels.safeSell).toBe(80200 - 350);

      // Gann Square of 9 projections: (sqrt(80200) + 1)^2
      const sq = Math.sqrt(80200);
      const expectedUp = Math.round(Math.pow(sq + 1, 2) * 100) / 100;
      const expectedDown = Math.round(Math.pow(sq - 1, 2) * 100) / 100;

      expect(levels.gannUp).toBe(expectedUp);
      expect(levels.gannDown).toBe(expectedDown);
      expect(levels.gannUp).toBeGreaterThan(80200);
      expect(levels.gannDown).toBeLessThan(80200);

      // Verify 8 rotation angles: 45°, 90°, 135°, 180°, 225°, 270°, 315°, 360°
      expect(levels.gannCycle).toHaveLength(8);
      expect(levels.gannCycle[0].deg).toBe(45);
      expect(levels.gannCycle[7].deg).toBe(360);
      for (const step of levels.gannCycle) {
        expect(step.up).toBeGreaterThan(80200);
        expect(step.down).toBeLessThan(80200);
      }
    });
  });
});
