import { describe, it, expect } from "vitest";
import {
  PROFILE_DEFAULTS,
  defaultsForProfile,
  calcPositionSize,
  suggestStopAndTarget,
  computePortfolioHeat,
  dailyLimitCheck,
  riskMeter,
  positionQuality,
  preTradeChecklist,
  summariseJournal,
  filterJournalByRange,
  type JournalEntry,
} from "./risk-engine";

describe("defaultsForProfile", () => {
  it("returns preset defaults", () => {
    expect(defaultsForProfile("CONSERVATIVE")).toBe(PROFILE_DEFAULTS.CONSERVATIVE);
    expect(defaultsForProfile("AGGRESSIVE").maxOpenTrades).toBeGreaterThan(
      PROFILE_DEFAULTS.CONSERVATIVE.maxOpenTrades,
    );
  });
  it("CUSTOM falls back to MODERATE", () => {
    expect(defaultsForProfile("CUSTOM")).toEqual(PROFILE_DEFAULTS.MODERATE);
  });
});

describe("calcPositionSize", () => {
  it("rounds down to whole lots and computes risk correctly", () => {
    const r = calcPositionSize({
      capital: 500_000,
      riskPct: 1,
      entry: 24000,
      stopLoss: 23950, // ₹50 per unit
      lotSize: 75,
      brokeragePerLot: 40,
    });
    expect(r.riskAmount).toBe(5000);
    expect(r.perUnitRisk).toBe(50);
    // 5000 / 50 = 100 units → 1 lot of 75 (rounded down)
    expect(r.lots).toBe(1);
    expect(r.quantity).toBe(75);
    expect(r.brokerage).toBe(40);
    expect(r.valid).toBe(true);
  });
  it("marks invalid when stop equals entry", () => {
    const r = calcPositionSize({
      capital: 100000,
      riskPct: 1,
      entry: 100,
      stopLoss: 100,
      lotSize: 50,
    });
    expect(r.valid).toBe(false);
  });
  it("marks invalid when risk budget too small", () => {
    const r = calcPositionSize({
      capital: 1000,
      riskPct: 1,
      entry: 24000,
      stopLoss: 23000,
      lotSize: 75,
    });
    expect(r.valid).toBe(false);
    expect(r.lots).toBe(0);
  });
  it("respects capital/risk validation", () => {
    expect(calcPositionSize({ capital: 0, riskPct: 1, entry: 1, stopLoss: 0.5, lotSize: 1 }).valid).toBe(false);
    expect(calcPositionSize({ capital: 1, riskPct: 0, entry: 1, stopLoss: 0.5, lotSize: 1 }).valid).toBe(false);
  });
});

describe("suggestStopAndTarget", () => {
  it("LONG uses nearest support below entry and nearest resistance above", () => {
    const r = suggestStopAndTarget({
      entry: 24000,
      direction: "LONG",
      supports: [23800, 23500],
      resistances: [24200, 24500],
    });
    expect(r.stop).toBeLessThan(23800); // buffer applied
    expect(r.target).toBe(24200);
    expect(r.riskReward! > 0).toBe(true);
  });
  it("SHORT mirrors direction", () => {
    const r = suggestStopAndTarget({
      entry: 24000,
      direction: "SHORT",
      supports: [23800],
      resistances: [24100, 24500],
    });
    expect(r.stop!).toBeGreaterThan(24100);
    expect(r.target).toBe(23800);
  });
  it("falls back to minRR target when no resistance", () => {
    const r = suggestStopAndTarget({
      entry: 24000,
      direction: "LONG",
      supports: [23900],
      resistances: [],
      minRiskReward: 2,
    });
    expect(r.target).not.toBeNull();
    expect(r.riskReward!).toBeGreaterThanOrEqual(2);
  });
  it("returns null when no support below entry (LONG)", () => {
    expect(
      suggestStopAndTarget({ entry: 100, direction: "LONG", supports: [], resistances: [110] }).stop,
    ).toBeNull();
  });
});

describe("computePortfolioHeat", () => {
  it("sums risk / exposure / sector / direction", () => {
    const heat = computePortfolioHeat(
      [
        { id: "a", symbol: "NIFTY", sector: "INDEX", direction: "LONG", riskAmount: 3000, capitalUsed: 100000 },
        { id: "b", symbol: "BANKNIFTY", sector: "BANK", direction: "SHORT", riskAmount: 2000, capitalUsed: 80000 },
      ],
      500000,
      3,
    );
    expect(heat.usedRisk).toBe(5000);
    expect(heat.exposure).toBe(180000);
    expect(heat.dailyCap).toBe(15000);
    expect(heat.directionalExposure).toEqual({ long: 3000, short: 2000 });
    expect(heat.sectorExposure).toEqual({ INDEX: 100000, BANK: 80000 });
  });
  it("handles empty portfolio", () => {
    const heat = computePortfolioHeat([], 100000, 2);
    expect(heat.usedRisk).toBe(0);
    expect(heat.remainingRisk).toBe(2000);
  });
});

describe("dailyLimitCheck", () => {
  const cap = { capital: 100000, dailyRiskPct: 3, maxTradesPerDay: 5, maxDailyLossPct: 3 };
  it("passes below all limits", () => {
    expect(
      dailyLimitCheck({ trades: 1, wins: 1, losses: 0, pnl: 500, riskUsed: 500 }, cap).stopTrading,
    ).toBe(false);
  });
  it("stops on daily risk budget consumed", () => {
    const r = dailyLimitCheck({ trades: 1, wins: 0, losses: 1, pnl: -100, riskUsed: 3000 }, cap);
    expect(r.stopTrading).toBe(true);
  });
  it("stops on max trades reached", () => {
    expect(
      dailyLimitCheck({ trades: 5, wins: 3, losses: 2, pnl: 100, riskUsed: 100 }, cap).stopTrading,
    ).toBe(true);
  });
  it("stops on daily loss limit", () => {
    expect(
      dailyLimitCheck({ trades: 3, wins: 0, losses: 3, pnl: -3500, riskUsed: 100 }, cap).stopTrading,
    ).toBe(true);
  });
});

describe("riskMeter", () => {
  it("bands correctly", () => {
    expect(riskMeter(0.5, 3)).toBe("LOW");
    expect(riskMeter(1.5, 3)).toBe("MEDIUM");
    expect(riskMeter(2.4, 3)).toBe("HIGH");
    expect(riskMeter(3, 3)).toBe("CRITICAL");
    expect(riskMeter(0, 3, 3)).toBe("CRITICAL");
  });
});

describe("positionQuality", () => {
  it("assigns A+ for excellent setups", () => {
    const r = positionQuality({
      decisionConfidence: 90,
      historicalAccuracy: 80,
      optionsAgreement: true,
      riskReward: 3,
      riskPct: 1,
    });
    expect(r.grade).toBe("A+");
  });
  it("assigns D for poor setups", () => {
    const r = positionQuality({
      decisionConfidence: 20,
      historicalAccuracy: 30,
      optionsAgreement: false,
      riskReward: 1,
      riskPct: 3,
    });
    expect(r.grade).toBe("D");
  });
});

describe("preTradeChecklist", () => {
  const defaults = defaultsForProfile("MODERATE");
  const goodPosition = calcPositionSize({
    capital: 500000,
    riskPct: 1,
    entry: 24000,
    stopLoss: 23950,
    lotSize: 75,
  });
  const heat = computePortfolioHeat([], 500000, defaults.dailyRiskPct);
  const daily = dailyLimitCheck(
    { trades: 0, wins: 0, losses: 0, pnl: 0, riskUsed: 0 },
    { capital: 500000, dailyRiskPct: defaults.dailyRiskPct, maxTradesPerDay: 5, maxDailyLossPct: 3 },
  );
  it("all pass on clean setup", () => {
    const r = preTradeChecklist({
      position: goodPosition,
      heat,
      daily,
      defaults,
      openPositions: 0,
      sameDirectionOpen: 0,
      decisionConfidence: 80,
      riskReward: 2,
    });
    expect(r.allPass).toBe(true);
  });
  it("fails when confidence below threshold", () => {
    const r = preTradeChecklist({
      position: goodPosition,
      heat,
      daily,
      defaults,
      openPositions: 0,
      sameDirectionOpen: 0,
      decisionConfidence: 40,
      riskReward: 2,
    });
    expect(r.allPass).toBe(false);
    expect(r.items.find((i) => i.key === "conf")!.pass).toBe(false);
  });
  it("fails when RR too low", () => {
    const r = preTradeChecklist({
      position: goodPosition,
      heat,
      daily,
      defaults,
      openPositions: 0,
      sameDirectionOpen: 0,
      decisionConfidence: 80,
      riskReward: 1,
    });
    expect(r.items.find((i) => i.key === "rr")!.pass).toBe(false);
  });
});

describe("journal helpers", () => {
  const entries: JournalEntry[] = [
    { id: "1", createdAt: "2026-07-14T05:00:00Z", symbol: "NIFTY", direction: "LONG", entry: 24000, exit: 24100, quantity: 75, pnl: 7500, reason: "", riskAmount: 3000, outcome: "WIN" },
    { id: "2", createdAt: "2026-07-14T06:00:00Z", symbol: "NIFTY", direction: "LONG", entry: 24100, exit: 24050, quantity: 75, pnl: -3750, reason: "", riskAmount: 3750, outcome: "LOSS" },
    { id: "3", createdAt: "2026-07-14T07:00:00Z", symbol: "NIFTY", direction: "LONG", entry: 24200, exit: null, quantity: 75, pnl: null, reason: "", riskAmount: 3000, outcome: "OPEN" },
  ];
  it("summarises closed trades", () => {
    const r = summariseJournal(entries);
    expect(r.trades).toBe(2);
    expect(r.wins).toBe(1);
    expect(r.losses).toBe(1);
    expect(r.open).toBe(1);
    expect(r.totalPnl).toBe(3750);
    expect(r.winRatePct).toBe(50);
    expect(r.profitFactor).toBe(2);
  });
  it("filters by weekly range", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    expect(filterJournalByRange(entries, "WEEKLY", now).length).toBe(3);
    expect(filterJournalByRange(entries, "MONTHLY", now).length).toBe(3);
  });
});