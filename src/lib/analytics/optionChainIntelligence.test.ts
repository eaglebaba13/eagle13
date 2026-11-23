import { describe, it, expect } from "vitest";
import {
  computeOptionChainIntelligence,
  isOpeningSettlementWindow,
  resolveStrikeStep,
  type OptionChainIntelligenceInput,
} from "./optionChainIntelligence";
import type { StrikeDominance } from "@/lib/options/ltp-calculator-engine.server";

describe("optionChainIntelligence Engine", () => {
  const mockCallStrikes: StrikeDominance[] = [
    { strike: 25200, volume: 10000, volPct: 20, oi: 20000, oiPct: 25, ltp: 220, iv: 13.5, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25420 },
    { strike: 25300, volume: 30000, volPct: 60, oi: 45000, oiPct: 56, ltp: 140, iv: 13.8, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25440 },
    { strike: 25400, volume: 50000, volPct: 100, oi: 80000, oiPct: 100, ltp: 80, iv: 14.1, isMaxVol: true, isMaxOi: true, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25480 },
    { strike: 25500, volume: 40000, volPct: 80, oi: 64000, oiPct: 80, ltp: 35, iv: 14.5, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25535 },
  ];

  const mockPutStrikes: StrikeDominance[] = [
    { strike: 25200, volume: 42000, volPct: 84, oi: 68000, oiPct: 85, ltp: 38, iv: 14.2, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25162 },
    { strike: 25300, volume: 50000, volPct: 100, oi: 80000, oiPct: 100, ltp: 85, iv: 14.0, isMaxVol: true, isMaxOi: true, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25215 },
    { strike: 25400, volume: 25000, volPct: 50, oi: 35000, oiPct: 43, ltp: 145, iv: 13.9, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25255 },
    { strike: 25500, volume: 10000, volPct: 20, oi: 15000, oiPct: 18, ltp: 225, iv: 13.6, isMaxVol: false, isMaxOi: false, isWttVol: false, isWtbVol: false, isWttOi: false, isWtbOi: false, reversalPrice: 25275 },
  ];

  it("resolves correct strike steps for index and symbols", () => {
    expect(resolveStrikeStep("NIFTY")).toBe(50);
    expect(resolveStrikeStep("BANKNIFTY")).toBe(100);
    expect(resolveStrikeStep("SENSEX")).toBe(100);
    expect(resolveStrikeStep("MIDCPNIFTY")).toBe(25);
    expect(resolveStrikeStep("CUSTOM", undefined, [1000, 1020, 1040])).toBe(20);
  });

  it("computes Primary Anchor Zones (PAZ-Sup and PAZ-Res)", () => {
    const res = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25350,
      atmStrike: 25350,
      callStrikes: mockCallStrikes,
      putStrikes: mockPutStrikes,
      timestamp: "2026-11-23T11:30:00.000Z",
    });

    expect(res.pazSup.strike).toBe(25300);
    expect(res.pazSup.factor).toBe("BOTH");
    expect(res.pazSup.reversalPrice).toBe(25215);

    expect(res.pazRes.strike).toBe(25400);
    expect(res.pazRes.factor).toBe("BOTH");
    expect(res.pazRes.reversalPrice).toBe(25480);
  });

  it("calculates Pressure Drift Index (PDI) with >= 75% drift detection", () => {
    const res = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25350,
      atmStrike: 25350,
      callStrikes: mockCallStrikes,
      putStrikes: mockPutStrikes,
      timestamp: "2026-11-23T11:30:00.000Z",
    });

    // Call side: 25500 has 64000/80000 = 80% (>= 75% higher strike -> TOP)
    expect(res.pdiTop.isDrifting).toBe(true);
    expect(res.pdiTop.direction).toBe("TOP");
    expect(res.pdiTop.driftPct).toBe(80.0);
    expect(res.pdiTop.label).toContain("WTT ↗");

    // Put side: 25200 has 68000/80000 = 85% (>= 75% lower strike -> BOTTOM)
    expect(res.pdiBot.isDrifting).toBe(true);
    expect(res.pdiBot.direction).toBe("BOTTOM");
    expect(res.pdiBot.driftPct).toBe(85.0);
    expect(res.pdiBot.label).toContain("WTB ↘");
  });

  it("evaluates OVM-9 Momentum Surge and Cascade Breakdown regimes correctly", () => {
    // Momentum surge: huge put additions, negative call change
    const bullishLegs = [
      { strike: 25300, side: "CE" as const, oi: 50000, changeOi: -15000, volume: 40000, ltp: 100, changePct: 10, iv: 14, bid: null, ask: null },
      { strike: 25300, side: "PE" as const, oi: 90000, changeOi: 45000, volume: 60000, ltp: 80, changePct: -10, iv: 14, bid: null, ask: null },
    ];

    const bullRes = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25300,
      legs: bullishLegs,
      timestamp: "2026-11-23T11:30:00.000Z",
    });

    expect(bullRes.ovm9.regime).toBe("Momentum Surge");
    expect(bullRes.ovm9.sentiment).toBe("BULLISH");
    expect(bullRes.rsbExecution.side).toBe("BUY_CE");

    // Cascade breakdown: huge call additions, negative put change
    const bearishLegs = [
      { strike: 25300, side: "CE" as const, oi: 95000, changeOi: 50000, volume: 65000, ltp: 110, changePct: 15, iv: 14, bid: null, ask: null },
      { strike: 25300, side: "PE" as const, oi: 40000, changeOi: -20000, volume: 30000, ltp: 70, changePct: -15, iv: 14, bid: null, ask: null },
    ];

    const bearRes = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25300,
      legs: bearishLegs,
      timestamp: "2026-11-23T11:30:00.000Z",
    });

    expect(bearRes.ovm9.regime).toBe("Cascade Breakdown");
    expect(bearRes.ovm9.sentiment).toBe("BEARISH");
    expect(bearRes.rsbExecution.side).toBe("BUY_PE");
    expect(bearRes.rsbExecution.invalidatedLevels).toContain("conservativeEntry");
  });

  it("handles RSB-Ext extension when intraday support migrates bottom-to-top", () => {
    const res = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25350,
      atmStrike: 25350,
      callStrikes: mockCallStrikes,
      putStrikes: mockPutStrikes,
      intradayShiftHistory: [
        {
          timestamp: "2026-11-23T09:45:00.000Z",
          side: "PUT",
          fromStrike: 25200,
          toStrike: 25300,
          type: "BOTTOM_TO_TOP",
        },
      ],
      timestamp: "2026-11-23T11:30:00.000Z",
    });

    expect(res.rsbExecution.extendedTolerance).toBe(true);
    expect(res.rsbExecution.extensionStrikes).toBe(1);
    // Upper target 3 should be extended by +1 strike (50 pts)
    expect(res.rsbExecution.target3).toBe(25480 + 50);
  });

  it("enforces R:R filter and opening settlement window (09:15 - 09:20 IST)", () => {
    // 09:17 IST is 03:47 UTC
    const openingUtc = "2026-11-23T03:47:00.000Z";
    expect(isOpeningSettlementWindow(openingUtc)).toBe(true);

    const openingRes = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25350,
      callStrikes: mockCallStrikes,
      putStrikes: mockPutStrikes,
      timestamp: openingUtc,
    });

    expect(openingRes.rsbExecution.tradable).toBe(false);
    expect(openingRes.rsbExecution.tradeReason).toContain("Opening Settlement 09:15-09:20");
  });

  it("calculates Top-Down Range Matrix with Greeks/IV Weekly Range and 09:20 Day Range", () => {
    const res = computeOptionChainIntelligence({
      underlying: "NIFTY",
      spotPrice: 25000,
      atmStrike: 25000,
      callStrikes: mockCallStrikes,
      putStrikes: mockPutStrikes,
      timestamp: "2026-11-23T11:30:00.000Z",
      expiry: "2026-11-28",
      static0920Snapshot: {
        eos: 24850,
        eosMinus1: 24800,
        eor: 25150,
        eorPlus1: 25200,
        sModerate: 24850,
        sRisky: 24900,
        rModerate: 25150,
        rRisky: 25100,
        supportStrike: 24900,
        resistanceStrike: 25100,
        spotPrice: 25000,
        maxPainSl: 24750,
        maxGainTarget: 25300,
      },
    });

    expect(res.topDownRange.weeklyRange.low).toBeLessThan(25000);
    expect(res.topDownRange.weeklyRange.high).toBeGreaterThan(25000);
    expect(res.topDownRange.dayRange0920.low).toBe(24850);
    expect(res.topDownRange.dayRange0920.high).toBe(25150);
    expect(res.topDownRange.dayRange0920.source).toBe("STATIC_0920");
  });
});
