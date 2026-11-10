// Unit tests for ChronoWheel Algorithmic Trade Execution Engine & AI Assistant
import { describe, it, expect } from "vitest";
import {
  evaluateInstrumentCyclePerformance,
  getInstrumentLotSize,
  FO_UNIVERSE,
  type FOInstrument,
} from "./cycle-performance.server";
import {
  sliceWindowFromRealCandles,
  type InstrumentMarketData,
  type RealCandle,
} from "./market-data-adapter.server";
import type { HistoricalLunarWindow } from "./lunar-cycle-engine.server";
import {
  generateDeterministicAIResponse,
  type ChronoWheelAIRequest,
} from "./chronowheel-ai.server";

describe("ChronoWheel Algorithmic Trade Execution Engine", () => {
  const mockInstrument: FOInstrument = {
    symbol: "RELIANCE",
    name: "Reliance Industries Ltd",
    sector: "Oil & Gas",
    category: "FO_EQUITY",
    marketCap: "Large Cap",
    beta: 1.02,
    baseIV: 18.5,
    defaultPrice: 2740,
  };

  const mockWindows: HistoricalLunarWindow[] = [
    {
      year: 2024,
      relativeYear: "T-1",
      startDate: "2024-11-01",
      endDate: "2024-11-04",
      rawStartDate: "2024-11-01T00:00:00Z",
      rawEndDate: "2024-11-04T00:00:00Z",
      tradingSessions: 3,
      phaseAngleStart: 45.2,
      phaseAngleEnd: 82.5,
      tithiStart: "Shukla Pratipada",
      tithiEnd: "Shukla Chaturthi",
      isAdhikMaas: false,
      weekendAdjusted: true,
      phaseShiftToleranceDeg: 1.0,
    },
    {
      year: 2023,
      relativeYear: "T-2",
      startDate: "2023-11-01",
      endDate: "2023-11-04",
      rawStartDate: "2023-11-01T00:00:00Z",
      rawEndDate: "2023-11-04T00:00:00Z",
      tradingSessions: 3,
      phaseAngleStart: 44.8,
      phaseAngleEnd: 81.9,
      tithiStart: "Shukla Pratipada",
      tithiEnd: "Shukla Chaturthi",
      isAdhikMaas: false,
      weekendAdjusted: true,
      phaseShiftToleranceDeg: 1.0,
    },
    {
      year: 2022,
      relativeYear: "T-3",
      startDate: "2022-11-01",
      endDate: "2022-11-04",
      rawStartDate: "2022-11-01T00:00:00Z",
      rawEndDate: "2022-11-04T00:00:00Z",
      tradingSessions: 3,
      phaseAngleStart: 45.0,
      phaseAngleEnd: 82.0,
      tithiStart: "Shukla Pratipada",
      tithiEnd: "Shukla Chaturthi",
      isAdhikMaas: false,
      weekendAdjusted: true,
      phaseShiftToleranceDeg: 1.0,
    },
  ];

  it("maps correct F&O lot sizes for standard instruments", () => {
    expect(getInstrumentLotSize("NIFTY")).toBe(25);
    expect(getInstrumentLotSize("BANKNIFTY")).toBe(15);
    expect(getInstrumentLotSize("RELIANCE")).toBe(500);
    expect(getInstrumentLotSize("HDFCBANK")).toBe(550);
    expect(getInstrumentLotSize("TCS")).toBe(175);
    expect(getInstrumentLotSize("AUBANK")).toBe(500); // Official NSE F&O contract lot size
    expect(getInstrumentLotSize("UNKNOWN_EQUITY", 1000)).toBeGreaterThan(0);
  });

  it("binds AUBANK to real baseline price ₹929.00 and generates realistic trade plan", () => {
    const aubank = FO_UNIVERSE.find((i) => i.symbol === "AUBANK");
    expect(aubank).toBeDefined();
    expect(aubank!.defaultPrice).toBe(929.0);

    const perf = evaluateInstrumentCyclePerformance(aubank!, mockWindows);
    expect(perf.currentPrice).toBe(929.0);
    expect(perf.executionPlan.entryPrice).toBe(929.0);
    expect(perf.executionPlan.lotSize).toBe(500);
    expect(perf.executionPlan.capitalRequirementPerLot).toBe(Math.round(929.0 * 500 * 0.20));

    // Entry trigger zone buffer is 0.25% (around 926.68 - 931.32)
    expect(perf.executionPlan.entryTriggerZone.min).toBeLessThanOrEqual(929.0);
    expect(perf.executionPlan.entryTriggerZone.max).toBeGreaterThanOrEqual(929.0);
    expect(perf.executionPlan.entryTriggerZone.max - perf.executionPlan.entryTriggerZone.min).toBeCloseTo(929 * 0.005, 1);
  });

  it("slices real historical candles and validates exact Open, Close, High, Low, and returns", () => {
    const mockRealCandles: RealCandle[] = [
      {
        date: "2024-11-01",
        timestamp: 1730419200000,
        open: 617.9,
        high: 621.0,
        low: 615.65,
        close: 617.35,
        volume: 1250000,
      },
      {
        date: "2024-11-04",
        timestamp: 1730678400000,
        open: 619.95,
        high: 628.4,
        low: 616.4,
        close: 625.45,
        volume: 1560000,
      },
    ];

    const sliced = sliceWindowFromRealCandles(mockRealCandles, "2024-11-01", "2024-11-04", 929.0);
    expect(sliced.hasRealData).toBe(true);
    expect(sliced.startPrice).toBe(617.9);
    expect(sliced.endPrice).toBe(625.45);
    expect(sliced.windowHigh).toBe(628.4);
    expect(sliced.windowLow).toBe(615.65);
    expect(sliced.returnPct).toBeCloseTo(1.22, 2);
    expect(sliced.tradingSessions).toBe(2);

    // Ingest into evaluateInstrumentCyclePerformance via marketData
    const mockMarketData: InstrumentMarketData = {
      symbol: "AUBANK",
      marketSymbol: "AUBANK.NS",
      ltp: 929.0,
      candles: mockRealCandles,
      fetchedAt: Date.now(),
      dataSource: "YAHOO_FINANCE",
    };

    const aubank = FO_UNIVERSE.find((i) => i.symbol === "AUBANK")!;
    const perfWithRealData = evaluateInstrumentCyclePerformance(aubank, mockWindows, mockMarketData);

    expect(perfWithRealData.currentPrice).toBe(929.0);
    const win2024 = perfWithRealData.yearlyBreakdown.find((y) => y.year === 2024);
    expect(win2024).toBeDefined();
    expect(win2024!.startPrice).toBe(617.9);
    expect(win2024!.endPrice).toBe(625.45);
    expect(win2024!.returnPct).toBeCloseTo(1.22, 2);
  });

  it("generates exact execution levels (Entry, SL, TP1, TP2, TP3, R:R) for bullish bias", () => {
    const perf = evaluateInstrumentCyclePerformance(mockInstrument, mockWindows);

    expect(perf).toBeDefined();
    expect(perf.executionPlan).toBeDefined();

    const plan = perf.executionPlan!;
    expect(["LONG", "SHORT"]).toContain(plan.direction);
    expect(plan.entryPrice).toBeGreaterThan(0);
    expect(plan.entryTriggerZone.min).toBeLessThanOrEqual(plan.entryTriggerZone.max);

    if (plan.direction === "LONG") {
      expect(plan.stopLoss).toBeLessThan(plan.entryPrice);
      expect(plan.tp1).toBeGreaterThan(plan.entryPrice);
      expect(plan.tp2).toBeGreaterThan(plan.tp1);
      expect(plan.tp3).toBeGreaterThan(plan.tp2);
    } else {
      expect(plan.stopLoss).toBeGreaterThan(plan.entryPrice);
      expect(plan.tp1).toBeLessThan(plan.entryPrice);
      expect(plan.tp2).toBeLessThan(plan.tp1);
      expect(plan.tp3).toBeLessThan(plan.tp2);
    }

    expect(plan.riskRewardRatio).toBe("1 : 2.5");
    expect(plan.lotSize).toBe(500);
    expect(plan.capitalRequirementPerLot).toBeGreaterThan(0);
  });

  it("calculates 10-year trade hit-rate backtest summary and yearly outcomes", () => {
    const perf = evaluateInstrumentCyclePerformance(mockInstrument, mockWindows);

    const hit = perf.hitRateSummary;
    expect(hit).toBeDefined();
    expect(hit!.tp1Hits).toBeGreaterThanOrEqual(0);
    expect(hit!.tp2Hits).toBeGreaterThanOrEqual(0);
    expect(hit!.tp3Hits).toBeGreaterThanOrEqual(0);
    expect(hit!.slHits).toBeGreaterThanOrEqual(0);
    expect(hit!.profitFactor).toBeGreaterThan(0);

    // Yearly breakdowns must contain hitOutcome and rMultipleAchieved
    expect(perf.yearlyBreakdown.length).toBe(mockWindows.length);
    for (const yb of perf.yearlyBreakdown) {
      expect(["TP3_HIT", "TP2_HIT", "TP1_HIT", "SL_HIT", "SCRATCH"]).toContain(yb.hitOutcome);
      expect(typeof yb.rMultipleAchieved).toBe("number");
      expect(typeof yb.hitOutcomeLabel).toBe("string");
    }
  });

  it("generates deterministic AI response with structured trade plan", () => {
    const request: ChronoWheelAIRequest = {
      query: "Generate a trade plan with entry, stop loss, and targets",
      stockContext: {
        symbol: "RELIANCE",
        name: "Reliance Industries Ltd",
        sector: "Oil & Gas",
        category: "FO_EQUITY",
        currentPrice: 2450,
        winRate: 85,
        avgReturn: 4.25,
        confluenceBias: "HIGH_BULLISH",
        liveIv: 21.5,
        ivPercentile: 28,
        executionPlan: {
          direction: "LONG",
          entryPrice: 2450,
          entryTriggerZone: { min: 2442.65, max: 2457.35 },
          stopLoss: 2388.75,
          stopLossPct: 2.5,
          riskPerShare: 61.25,
          tp1: 2541.88,
          tp1Pct: 3.75,
          tp2: 2603.13,
          tp2Pct: 6.25,
          tp3: 2695.0,
          tp3Pct: 10.0,
          riskRewardRatio: "1 : 2.5",
          lotSize: 250,
          capitalRequirementPerLot: 122500,
        },
        hitRateSummary: {
          tp1Hits: 8,
          tp1HitRate: 80,
          tp2Hits: 7,
          tp2HitRate: 70,
          tp3Hits: 5,
          tp3HitRate: 50,
          slHits: 1,
          slHitRate: 10,
          profitFactor: 4.2,
        },
      },
      cycleContext: {
        startDate: "2025-11-01",
        endDate: "2025-11-04",
        tithi: "Shukla Dashami",
        phaseAngle: 112.5,
        phaseName: "Waxing Gibbous",
        lookbackYears: 10,
      },
      accountContext: {
        capital: 200000,
        riskPct: 2.0,
      },
    };

    const aiRes = generateDeterministicAIResponse(request);

    expect(aiRes.answer).toContain("RELIANCE");
    expect(aiRes.answer).toContain("2388.75");
    expect(aiRes.structuredTradePlan).toBeDefined();
    expect(aiRes.structuredTradePlan!.direction).toBe("LONG");
    expect(aiRes.structuredTradePlan!.riskReward).toBe("1 : 2.5");
    expect(aiRes.bullets?.length).toBeGreaterThan(0);
  });

  it("calculates invariant lot sizing in AI response based on capital and risk %", () => {
    const request: ChronoWheelAIRequest = {
      query: "Calculate my lot size based on capital and risk",
      stockContext: {
        symbol: "TCS",
        name: "Tata Consultancy Services",
        sector: "Information Technology",
        category: "FO_EQUITY",
        currentPrice: 4000,
        winRate: 80,
        avgReturn: 3.5,
        confluenceBias: "HIGH_BULLISH",
        liveIv: 18.0,
        ivPercentile: 32,
        executionPlan: {
          direction: "LONG",
          entryPrice: 4000,
          entryTriggerZone: { min: 3988, max: 4012 },
          stopLoss: 3900,
          stopLossPct: 2.5,
          riskPerShare: 100,
          tp1: 4150,
          tp1Pct: 3.75,
          tp2: 4250,
          tp2Pct: 6.25,
          tp3: 4400,
          tp3Pct: 10.0,
          riskRewardRatio: "1 : 2.5",
          lotSize: 175,
          capitalRequirementPerLot: 140000,
        },
      },
      accountContext: {
        capital: 100000,
        riskPct: 2.0, // ₹2,000 risk
      },
    };

    const aiRes = generateDeterministicAIResponse(request);

    // ₹2,000 risk / ₹100 per share = 20 shares
    expect(aiRes.answer).toContain("20 Shares");
    expect(aiRes.answer).toContain("₹2,000");
  });

  it("binds PNB to calibrated real market price ₹132.17 and includes live LTP and day change", () => {
    const pnb = FO_UNIVERSE.find((i) => i.symbol === "PNB");
    expect(pnb).toBeDefined();
    expect(pnb!.defaultPrice).toBe(132.17);

    const mockLivePnbData: InstrumentMarketData = {
      symbol: "PNB",
      marketSymbol: "PNB.NS",
      ltp: 132.17,
      prevClose: 126.55,
      changePct: 4.44,
      isLive: true,
      candles: [],
      fetchedAt: Date.now(),
      dataSource: "YAHOO_FINANCE",
    };

    const perf = evaluateInstrumentCyclePerformance(pnb!, mockWindows, mockLivePnbData);
    expect(perf.currentPrice).toBe(132.17);
    expect(perf.prevClose).toBe(126.55);
    expect(perf.dayChangePct).toBe(4.44);
    expect(perf.isLive).toBe(true);

    // Entry Zone buffer around 132.17 (+-0.25%)
    expect(perf.executionPlan.entryPrice).toBe(132.17);
    expect(perf.executionPlan.entryTriggerZone.min).toBeLessThanOrEqual(132.17);
    expect(perf.executionPlan.entryTriggerZone.max).toBeGreaterThanOrEqual(132.17);
  });

  it("answers 'check what is LTP price' explicitly with live LTP and anchored trade levels in AI assistant", () => {
    const request: ChronoWheelAIRequest = {
      query: "check what is LTP price for PNB",
      stockContext: {
        symbol: "PNB",
        name: "Punjab National Bank",
        sector: "Banking",
        category: "FO_EQUITY",
        currentPrice: 132.17,
        prevClose: 126.55,
        dayChangePct: 4.44,
        isLive: true,
        winRate: 80,
        avgReturn: 3.2,
        confluenceBias: "HIGH_BULLISH",
        liveIv: 28.5,
        ivPercentile: 45,
        executionPlan: {
          direction: "LONG",
          entryPrice: 132.17,
          entryTriggerZone: { min: 131.84, max: 132.50 },
          stopLoss: 128.87,
          stopLossPct: 2.5,
          riskPerShare: 3.3,
          tp1: 137.12,
          tp1Pct: 3.75,
          tp2: 140.42,
          tp2Pct: 6.25,
          tp3: 145.37,
          tp3Pct: 10.0,
          riskRewardRatio: "1 : 2.5",
          lotSize: 4500,
          capitalRequirementPerLot: 118953,
        },
      },
    };

    const aiRes = generateDeterministicAIResponse(request);

    expect(aiRes.answer).toContain("PNB");
    expect(aiRes.answer).toContain("₹132.17");
    expect(aiRes.answer).toContain("+4.44%");
    expect(aiRes.answer).toContain("Real-Time Market Quote");
    expect(aiRes.answer).toContain("131.84");
    expect(aiRes.answer).toContain("140.42");
    expect(aiRes.modelUsed).toContain("Real-Time Market Quote Engine");
  });
});
