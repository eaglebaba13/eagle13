// Unit tests for ChronoWheel Algorithmic Trade Execution Engine & AI Assistant
import { describe, it, expect } from "vitest";
import {
  evaluateInstrumentCyclePerformance,
  getInstrumentLotSize,
  type FOInstrument,
} from "./cycle-performance.server";
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
    expect(getInstrumentLotSize("RELIANCE")).toBe(250);
    expect(getInstrumentLotSize("HDFCBANK")).toBe(550);
    expect(getInstrumentLotSize("TCS")).toBe(175);
    expect(getInstrumentLotSize("UNKNOWN_EQUITY", 1000)).toBeGreaterThan(0);
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
    expect(plan.lotSize).toBe(250);
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
});
