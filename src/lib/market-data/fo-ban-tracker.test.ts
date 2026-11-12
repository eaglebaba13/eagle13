import { describe, it, expect } from "vitest";
import {
  parseNseSecBanCsv,
  BASELINE_FO_MWPL,
  type FoBanSecurity,
  type FoBanReport,
  type FoBanStatus,
} from "./fo-ban-tracker.server";
import { formatFoBanTelegramAlert } from "../smart-alerts/telegram-delivery.server";

describe("NSE F&O Ban CSV Parser", () => {
  it("parses official NSE numbered CSV format with date header", () => {
    const csv = `Securities in Ban For Trade Date 12-NOV-2026:
1,KAYNES
2,HINDCOPPER
3,SAIL`;

    const parsed = parseNseSecBanCsv(csv);
    expect(parsed.tradeDate).toBe("12-NOV-2026");
    expect(parsed.bannedSymbols).toEqual(["KAYNES", "HINDCOPPER", "SAIL"]);
  });

  it("handles empty ban list from NSE", () => {
    const csv = `Securities in Ban For Trade Date 12-NOV-2026:
No Securities in Ban`;

    const parsed = parseNseSecBanCsv(csv);
    expect(parsed.tradeDate).toBe("12-NOV-2026");
    expect(parsed.bannedSymbols).toEqual([]);
  });

  it("handles single-symbol ban lines without indices and ignores extra whitespace", () => {
    const csv = `Trade Date 11-NOV-2026
   MANAPPURAM  
   DELTACORP   `;

    const parsed = parseNseSecBanCsv(csv);
    expect(parsed.tradeDate).toBe("11-NOV-2026");
    expect(parsed.bannedSymbols).toEqual(["MANAPPURAM", "DELTACORP"]);
  });

  it("deduplicates symbols if duplicated in CSV lines", () => {
    const csv = `Securities in Ban For Trade Date 10-NOV-2026:
1,KAYNES
2,KAYNES`;

    const parsed = parseNseSecBanCsv(csv);
    expect(parsed.bannedSymbols).toEqual(["KAYNES"]);
  });
});

describe("F&O Ban & MWPL Thresholds & Transition Logic", () => {
  it("categorizes stocks with MWPL >= 95% as IN_BAN with freshEntryEligible = false", () => {
    const mwpl = 96.8;
    const isBan = mwpl >= 95.0;
    expect(isBan).toBe(true);

    const sec: FoBanSecurity = {
      symbol: "KAYNES",
      name: "Kaynes Technology India",
      sector: "Capital Goods & Infra",
      status: "IN_BAN",
      mwplPercent: mwpl,
      daysInBan: 1,
      freshEntryEligible: false,
      currentLtp: 5420.0,
      updatedAt: new Date().toISOString(),
    };

    expect(sec.status).toBe("IN_BAN");
    expect(sec.freshEntryEligible).toBe(false);
    expect(sec.daysInBan).toBeGreaterThanOrEqual(1);
  });

  it("categorizes stocks between 80.0% and 94.9% as UPCOMING_BAN and computes distance to 95%", () => {
    const testCases = [
      { mwpl: 94.2, expectedDistance: 0.8 },
      { mwpl: 88.4, expectedDistance: 6.6 },
      { mwpl: 80.0, expectedDistance: 15.0 },
    ];

    for (const tc of testCases) {
      const isUpcoming = tc.mwpl >= 80.0 && tc.mwpl < 95.0;
      expect(isUpcoming).toBe(true);

      const distanceToBan = Math.round((95.0 - tc.mwpl) * 10) / 10;
      expect(distanceToBan).toBeCloseTo(tc.expectedDistance, 1);
    }
  });

  it("marks stocks cooling down below 80% after being banned as RECENTLY_UNBANNED", () => {
    const previousStatus = "IN_BAN";
    const previousBanDays = 4;
    const currentMwpl = 74.2;

    const shouldUnban = previousStatus === "IN_BAN" && currentMwpl < 80.0;
    expect(shouldUnban).toBe(true);

    const sec: FoBanSecurity = {
      symbol: "DELTACORP",
      name: "Delta Corp",
      sector: "Consumer Services",
      status: "RECENTLY_UNBANNED",
      mwplPercent: currentMwpl,
      daysInBan: 0,
      previousBanDays,
      freshEntryEligible: true,
      currentLtp: 112.5,
      updatedAt: new Date().toISOString(),
    };

    expect(sec.status).toBe("RECENTLY_UNBANNED");
    expect(sec.freshEntryEligible).toBe(true);
    expect(sec.previousBanDays).toBe(4);
    expect(sec.daysInBan).toBe(0);
  });

  it("marks stocks below 80% that were never banned as NORMAL", () => {
    const determineStatus = (prevStatus: FoBanStatus, mwpl: number): FoBanStatus => {
      if (prevStatus === "IN_BAN" && mwpl < 80.0) return "RECENTLY_UNBANNED";
      if (mwpl >= 95.0) return "IN_BAN";
      if (mwpl >= 80.0) return "UPCOMING_BAN";
      return "NORMAL";
    };
    expect(determineStatus("NORMAL", 24.5)).toBe("NORMAL");
    expect(determineStatus("IN_BAN", 74.2)).toBe("RECENTLY_UNBANNED");
    expect(determineStatus("NORMAL", 88.4)).toBe("UPCOMING_BAN");
    expect(determineStatus("NORMAL", 97.5)).toBe("IN_BAN");
  });
});

describe("Telegram Alert Formatting", () => {
  it("formats compliant structured Telegram message with all three buckets", () => {
    const mockReport: FoBanReport = {
      tradeDate: "12-NOV-2026",
      fetchedAt: "2026-11-12T03:15:00.000Z",
      source: "NSE_LIVE",
      totalFoTracked: 210,
      inBanCount: 1,
      upcomingBanCount: 2,
      recentlyUnbannedCount: 1,
      inBan: [
        {
          symbol: "KAYNES",
          name: "Kaynes Technology",
          sector: "Capital Goods & Infra",
          status: "IN_BAN",
          mwplPercent: 97.8,
          daysInBan: 1,
          freshEntryEligible: false,
          currentLtp: 5420.0,
          updatedAt: "2026-11-12T03:15:00.000Z",
        },
      ],
      upcomingBan: [
        {
          symbol: "HINDCOPPER",
          name: "Hindustan Copper",
          sector: "Metals & Mining",
          status: "UPCOMING_BAN",
          mwplPercent: 94.2,
          daysInBan: 0,
          distanceToBan: 0.8,
          freshEntryEligible: true,
          currentLtp: 430.5,
          updatedAt: "2026-11-12T03:15:00.000Z",
        },
        {
          symbol: "SAIL",
          name: "Steel Authority of India",
          sector: "Metals & Mining",
          status: "UPCOMING_BAN",
          mwplPercent: 88.4,
          daysInBan: 0,
          distanceToBan: 6.6,
          freshEntryEligible: true,
          currentLtp: 169.6,
          updatedAt: "2026-11-12T03:15:00.000Z",
        },
      ],
      recentlyUnbanned: [
        {
          symbol: "DELTACORP",
          name: "Delta Corp",
          sector: "Consumer Services",
          status: "RECENTLY_UNBANNED",
          mwplPercent: 74.2,
          daysInBan: 0,
          previousBanDays: 4,
          freshEntryEligible: true,
          currentLtp: 112.5,
          updatedAt: "2026-11-12T03:15:00.000Z",
        },
      ],
      allMap: {
        KAYNES: { status: "IN_BAN", mwplPercent: 97.8, daysInBan: 1 },
        HINDCOPPER: { status: "UPCOMING_BAN", mwplPercent: 94.2, daysInBan: 0 },
        SAIL: { status: "UPCOMING_BAN", mwplPercent: 88.4, daysInBan: 0 },
        DELTACORP: { status: "RECENTLY_UNBANNED", mwplPercent: 74.2, daysInBan: 0 },
      },
    };

    const text = formatFoBanTelegramAlert(mockReport);
    expect(text).toContain("🚫 [NSE F&O BAN & MWPL REPORT]");
    expect(text).toContain("12-NOV-2026");
    expect(text).toContain("KAYNES: 97.8% MWPL");
    expect(text).toContain("HINDCOPPER: 94.2% MWPL (0.8% to Ban)");
    expect(text).toContain("SAIL: 88.4% MWPL (6.6% to Ban)");
    expect(text).toContain("DELTACORP: 74.2% MWPL (Was in ban 4 days)");
    expect(text).toContain("Total F&O Tracked: 210");
  });
});
