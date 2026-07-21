import { describe, it, expect } from "vitest";
import { composeMorningReport, buildReportKey, buildReportId, MORNING_REPORT_VERSION } from "./report-composer";
import type { InstrumentBlock, IndiaContextBlock, FiiDiiBlock } from "./report-composer";
import type { MacroRatioResult } from "./macro-ratio";
import type { PanchangBundle } from "./panchang-bundle";

function iblock(id: string, name: string): InstrumentBlock {
  return { instrumentId: id, displayName: name, bundle: null, bias: null, livePrice: null, status: "UNAVAILABLE" };
}

const ratio: MacroRatioResult = {
  ratio: 82.5, macroBias: "BUY_SILVER", goldBias: "BEARISH_RELATIVE", silverBias: "BULLISH_RELATIVE",
  action: "OBSERVE", lowerThreshold: 55, upperThreshold: 80,
  normalizedGold: 2400, normalizedSilver: 29.1, quoteCurrency: "USD",
  normalizationMethod: "PRICE_PER_TROY_OUNCE", freshness: "LIVE",
  calculatedAt: "2026-07-22T02:30:00Z",
  goldSource: { price: 2400, timestamp: null, provider: "coindcx" },
  silverSource: { price: 29.1, timestamp: null, provider: "coindcx" },
  reason: "Ratio above 80", version: "MACRO_GS_RATIO_V44A",
};

const india: IndiaContextBlock = {
  indiaVix: 12.4, top5Bullish: [], top5Bearish: [], strongestSectors: [], weakestSectors: [],
  institutionalFlowProbability: null, marketStatus: "OPEN", latestTradeDate: "2026-07-21", status: "PARTIAL",
};
const fii: FiiDiiBlock = { tradeDate: null, fiiNet: null, diiNet: null, publicationStatus: "UNAVAILABLE", status: "UNAVAILABLE" };
const panchang: PanchangBundle = {
  date: "2026-07-22", tithi: "Panchami", paksha: "Shukla", nakshatra: "Hasta",
  yoga: "Siddhi", karana: "Bava", nextNewMoon: "2026-08-05", daysToNewMoon: 14,
  nextFullMoon: "2026-07-24", daysToFullMoon: 2, calculatedAt: "2026-07-22T02:45:00Z", timezone: "Asia/Kolkata",
};

function baseInput() {
  return {
    reportDate: "2026-07-22", generatedAt: "2026-07-22T02:45:00Z",
    reportId: buildReportId("2026-07-22"), panchang,
    nifty: iblock("NIFTY","NIFTY 50"), banknifty: iblock("BANKNIFTY","BANKNIFTY"),
    xauusd: iblock("XAUUSD","XAU/USD"), xagusd: iblock("XAGUSD","XAG/USD"),
    btc: iblock("BTC","Bitcoin"), eth: iblock("ETH","Ethereum"),
    ratio, indiaContext: india, fiiDii: fii, overallStatus: "PARTIAL" as const,
  };
}

describe("composeMorningReport", () => {
  it("emits 9 canonical sections in order", () => {
    const secs = composeMorningReport(baseInput());
    expect(secs.map((s) => s.id)).toEqual([
      "A_HEADER","B_PANCHANG","C_NIFTY","D_BANKNIFTY","E_METALS","F_CRYPTO","G_CONTEXT","H_FIIDII","Z_DISCLAIMER",
    ]);
  });
  it("always includes disclaimer body", () => {
    const d = composeMorningReport(baseInput()).find((s) => s.id === "Z_DISCLAIMER");
    expect(d?.body).toContain("EagleBABA is a research");
    expect(d?.protectFromTruncation).toBe(true);
  });
  it("renders configured 55/80 thresholds in metals", () => {
    const metals = composeMorningReport(baseInput()).find((s) => s.id === "E_METALS");
    expect(metals?.body).toContain("Lower Threshold: 55");
    expect(metals?.body).toContain("Upper Threshold: 80");
  });
});

describe("report key/id derivation", () => {
  it("is deterministic per date/version/timezone", () => {
    expect(buildReportKey("2026-07-22")).toBe(buildReportKey("2026-07-22"));
    expect(buildReportKey("2026-07-22")).toContain(MORNING_REPORT_VERSION);
    expect(buildReportKey("2026-07-22")).toContain("Asia/Kolkata");
  });
});