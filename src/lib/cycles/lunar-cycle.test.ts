// Unit Test Suite: EagleBABA ChronoWheel (Gann & Dynamic Lunar Cycle Engine)
// Verifies Moon-Sun Separation Angle, Tithi mapping, Historical Window Backtracking (T-1 to T-10),
// 200+ F&O Universe performance aggregation, and screener filtering.

import { describe, it, expect } from "vitest";
import {
  calculateSeparationAngle,
  getLunarPhaseDetails,
  findMatchingPhaseJD,
  mapHistoricalLunarWindows,
  getJulianDate,
  julianDateToDate,
} from "./lunar-cycle-engine.server";
import {
  FO_UNIVERSE,
  evaluateInstrumentCyclePerformance,
  executeChronoWheelScan,
} from "./cycle-performance.server";

describe("Dynamic Lunar-Solar Cycle Mapping Engine (Phase 36.4)", () => {
  it("computes exact Julian Date and bidirectional date conversion", () => {
    const testDate = new Date(Date.UTC(2026, 10, 10, 9, 15, 0)); // Nov 10, 2026
    const jd = getJulianDate(testDate);
    expect(jd).toBeGreaterThan(2460000);

    const reconstructed = julianDateToDate(jd);
    expect(Math.abs(reconstructed.getTime() - testDate.getTime())).toBeLessThan(1000);
  });

  it("calculates Moon-Sun longitudinal separation angle within [0, 360) range", () => {
    const testDate = new Date(Date.UTC(2026, 10, 10, 3, 45, 0));
    const jd = getJulianDate(testDate);
    const result = calculateSeparationAngle(jd);

    expect(result.phaseAngle).toBeGreaterThanOrEqual(0);
    expect(result.phaseAngle).toBeLessThan(360);
    expect(result.sunLon).toBeGreaterThanOrEqual(0);
    expect(result.sunLon).toBeLessThan(360);
    expect(result.moonLon).toBeGreaterThanOrEqual(0);
    expect(result.moonLon).toBeLessThan(360);
  });

  it("evaluates Lunar Phase Details, Tithi names, Paksha, and illumination", () => {
    const date = new Date(Date.UTC(2026, 10, 10, 9, 15, 0));
    const details = getLunarPhaseDetails(date);

    expect(details.tithiNumber).toBeGreaterThanOrEqual(1);
    expect(details.tithiNumber).toBeLessThanOrEqual(30);
    expect(typeof details.tithiName).toBe("string");
    expect(details.tithiName.length).toBeGreaterThan(3);
    expect(["Shukla", "Krishna"]).toContain(details.paksha);
    expect(details.illumination).toBeGreaterThanOrEqual(0);
    expect(details.illumination).toBeLessThanOrEqual(100);
  });

  it("finds matching lunar phase in historical year within tight tolerance (< 0.1°)", () => {
    // Current test date phase
    const refDate = new Date(Date.UTC(2025, 4, 15, 12, 0, 0));
    const refPhase = getLunarPhaseDetails(refDate);

    // Search matching phase in 2024
    const match = findMatchingPhaseJD(refPhase.phaseAngle, 2024, 5, 15);
    const matchedDate = julianDateToDate(match.jd);

    const matchedPhase = getLunarPhaseDetails(matchedDate);
    let diff = Math.abs(matchedPhase.phaseAngle - refPhase.phaseAngle);
    if (diff > 180) diff = 360 - diff;

    expect(diff).toBeLessThan(0.1);
  });

  it("maps 10 historical lunar windows with trading sessions and weekend adjustment", () => {
    const scan = mapHistoricalLunarWindows({
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      lookbackYears: 10,
    });

    expect(scan.historicalWindows).toHaveLength(10);
    expect(scan.lookbackYears).toBe(10);
    expect(scan.referenceWindow.startDate).toBe("2026-11-10");
    expect(scan.referenceWindow.endDate).toBe("2026-11-13");
    expect(scan.referenceWindow.durationDays).toBeGreaterThanOrEqual(1);

    // Check T-1 to T-10 progression
    for (let i = 0; i < 10; i++) {
      const hw = scan.historicalWindows[i];
      expect(hw.relativeYear).toBe(`T-${i + 1}`);
      expect(hw.year).toBe(2026 - (i + 1));
      expect(hw.tradingSessions).toBeGreaterThanOrEqual(1);
      expect(hw.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(hw.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(hw.phaseShiftToleranceDeg).toBeLessThan(1.0);
    }
  });

  it("supports 3-year and 5-year lookback depths correctly", () => {
    const scan3 = mapHistoricalLunarWindows({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      lookbackYears: 3,
    });
    expect(scan3.historicalWindows).toHaveLength(3);

    const scan5 = mapHistoricalLunarWindows({
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      lookbackYears: 5,
    });
    expect(scan5.historicalWindows).toHaveLength(5);
  });
});

describe("ChronoWheel Quantitative Screener & F&O Universe (Phase 36.4)", () => {
  it("FO_UNIVERSE contains over 200 liquid instruments across all key NSE sectors", () => {
    expect(FO_UNIVERSE.length).toBeGreaterThanOrEqual(200);

    const sectors = new Set(FO_UNIVERSE.map((inst) => inst.sector));
    expect(sectors).toContain("Banking");
    expect(sectors).toContain("Information Technology");
    expect(sectors).toContain("Automobiles");
    expect(sectors).toContain("Oil & Gas");
    expect(sectors).toContain("Metals & Mining");
    expect(sectors).toContain("Healthcare & Pharma");
    expect(sectors).toContain("FMCG & Consumer");
    expect(sectors).toContain("Capital Goods & Infra");
    expect(sectors).toContain("Real Estate & Cement");
    expect(sectors).toContain("Indices & ETFs");

    // Check critical symbols exist
    const symbols = new Set(FO_UNIVERSE.map((inst) => inst.symbol));
    expect(symbols.has("NIFTY50")).toBe(true);
    expect(symbols.has("BANKNIFTY")).toBe(true);
    expect(symbols.has("RELIANCE")).toBe(true);
    expect(symbols.has("HDFCBANK")).toBe(true);
    expect(symbols.has("TCS")).toBe(true);
    expect(symbols.has("INFY")).toBe(true);
    expect(symbols.has("TATAMOTORS")).toBe(true);
  });

  it("evaluates instrument multi-year return, win rate, volatility, and live IV context", () => {
    const scan = mapHistoricalLunarWindows({
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      lookbackYears: 10,
    });

    const reliance = FO_UNIVERSE.find((i) => i.symbol === "RELIANCE")!;
    const perf = evaluateInstrumentCyclePerformance(reliance, scan.historicalWindows);

    expect(perf.symbol).toBe("RELIANCE");
    expect(perf.totalWindows).toBe(10);
    expect(perf.positiveWindows + perf.negativeWindows).toBeLessThanOrEqual(10);
    expect(perf.winRate).toBeGreaterThanOrEqual(0);
    expect(perf.winRate).toBeLessThanOrEqual(100);
    expect(perf.yearlyBreakdown).toHaveLength(10);
    expect(perf.volatility).toBeGreaterThanOrEqual(0);
    expect(perf.liveIv).toBeGreaterThan(10);
    expect(perf.ivPercentile).toBeGreaterThanOrEqual(15);
    expect(perf.ivPercentile).toBeLessThanOrEqual(85);
    expect(["HIGH_BULLISH", "HIGH_BEARISH", "MODERATE_BULLISH", "MODERATE_BEARISH", "NEUTRAL"]).toContain(
      perf.confluenceBias,
    );
  });

  it("executes full ChronoWheel scan and correctly filters by direction, sector, and search query", () => {
    const scanResult = executeChronoWheelScan({
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      lookbackYears: 10,
      directionFilter: "ALL",
      sectorFilter: "ALL",
    });

    expect(scanResult.totalScanned).toBeGreaterThanOrEqual(200);
    expect(scanResult.results.length).toBe(scanResult.totalScanned);
    expect(scanResult.bullishCount + scanResult.bearishCount + scanResult.neutralCount).toBe(
      scanResult.totalScanned,
    );

    // Test Sector Filter
    const bankingScan = executeChronoWheelScan({
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      lookbackYears: 10,
      sectorFilter: "Banking",
    });
    expect(bankingScan.results.every((r) => r.sector === "Banking")).toBe(true);
    expect(bankingScan.results.length).toBeGreaterThan(5);

    // Test Search Filter
    const searchScan = executeChronoWheelScan({
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      lookbackYears: 10,
      searchQuery: "TATA",
    });
    expect(
      searchScan.results.every(
        (r) => r.symbol.includes("TATA") || r.name.toLowerCase().includes("tata"),
      ),
    ).toBe(true);
    expect(searchScan.results.length).toBeGreaterThan(1);
  });
});
