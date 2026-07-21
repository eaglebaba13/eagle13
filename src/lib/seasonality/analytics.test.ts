import { describe, it, expect } from "vitest";
import type { SeasonalityData } from "@/lib/seasonality.functions";
import {
  computeIntelligence,
  seasonalityScore,
  tradeSuggestions,
  aiInsight,
  toCsv,
  MONTH_NAMES,
} from "./analytics";

function fixture(): SeasonalityData {
  // 4 years of synthetic data — Jan strong, Jul weak.
  return {
    years: [
      { year: 2024, months: [ 3.0, 1.0, 2.5, 0.5, -0.5,  1.0, -2.0, 0.5,  1.5, -0.5, 0.5, 2.0] },
      { year: 2023, months: [ 2.0, 0.5, 1.5, 0.2,  0.4, -0.5, -1.5, 0.8,  0.9,  0.1, 0.6, 1.2] },
      { year: 2022, months: [ 4.0, -0.5, 0.8, -0.3, 0.9, 0.2, -3.0, 1.2,  0.5,  1.0, 0.8, 0.9] },
      { year: 2021, months: [ 5.0, 2.0, 1.2, 1.0,  1.5, 0.8,  0.5, -0.5, 1.1,  0.7, 0.4, 1.5] },
    ],
    avg: Array(12).fill(0),
    fetchedAt: "2024-07-15T00:00:00Z",
  };
}

describe("seasonality analytics", () => {
  const data = fixture();
  const intel = computeIntelligence(data, "2024-07-15T00:00:00Z");

  it("highlights current month", () => {
    expect(intel.currentMonthIndex).toBe(6);
    expect(intel.currentMonth?.monthName).toBe("July");
  });

  it("computes best and worst month", () => {
    expect(intel.bestMonth?.monthName).toBe("January");
    expect(intel.worstMonth?.monthName).toBe("July");
  });

  it("computes win rate", () => {
    const jan = intel.monthly[0];
    expect(jan.winRate).toBe(1);
    const jul = intel.monthly[6];
    expect(jul.winRate).toBeLessThan(0.5);
  });

  it("computes median", () => {
    const jan = intel.monthly[0];
    // sorted [2,3,4,5] median = 3.5
    expect(jan.median).toBeCloseTo(3.5);
  });

  it("assigns historical rank 1 to best month", () => {
    expect(intel.monthly[0].historicalRank).toBe(1);
    expect(intel.monthly[6].historicalRank).toBe(12);
  });

  it("clamps seasonality score to 0..100", () => {
    for (const m of intel.monthly) {
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
    // seasonalityScore null returns 0
    expect(seasonalityScore(null, 0, null)).toBe(0);
  });

  it("computes probability of positive close equal to win rate", () => {
    for (const m of intel.monthly) expect(m.probPositive).toBe(m.winRate);
  });

  it("cell intel gives rank, zScore, vsAverage", () => {
    const c = intel.cell(2021, 0); // Jan 2021 = 5.0 (best in Jan)
    expect(c.value).toBe(5);
    expect(c.rankInMonth).toBe(1);
    expect(c.zScore).not.toBeNull();
    expect(c.vsAverage).not.toBeNull();
  });

  it("cell intel handles missing cell", () => {
    const c = intel.cell(1999, 0);
    expect(c.value).toBeNull();
    expect(c.rankInMonth).toBeNull();
  });

  it("trade suggestions never generate BUY/SELL signals", () => {
    for (const m of intel.monthly) {
      const s = tradeSuggestions(m).join(" ");
      expect(s).not.toMatch(/\bBUY\b|\bSELL\b/);
      expect(s).toMatch(/Research Only/);
    }
  });

  it("ai insight includes current month and safety disclaimer", () => {
    const s = aiInsight(intel);
    expect(s).toContain("July");
    expect(s).toMatch(/should not be used for trading decisions/i);
  });

  it("csv contains year header and each row", () => {
    const csv = toCsv(data, intel);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Year");
    expect(lines[0]).toContain("Jan");
    expect(lines.some((l) => l.startsWith("2024,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Score,"))).toBe(true);
  });

  it("month names length is 12", () => {
    expect(MONTH_NAMES.length).toBe(12);
  });
});