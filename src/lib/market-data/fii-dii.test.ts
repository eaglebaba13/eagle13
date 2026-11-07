import { describe, it, expect } from "vitest";
import {
  parseNseDate,
  cleanNumber,
  classifySentiment,
  determineMarketStatus,
  readFiiDiiCache,
  getFiiDiiData,
} from "./fii-dii.server";

describe("fii-dii ingestion engine", () => {
  it("parses NSE date string formats accurately", () => {
    const res1 = parseNseDate("06-Nov-2026");
    expect(res1.iso).toBe("2026-11-06");
    expect(res1.label).toBe("06 Nov");

    const res2 = parseNseDate("3-Jul-2026");
    expect(res2.iso).toBe("2026-07-03");
    expect(res2.label).toBe("03 Jul");

    const res3 = parseNseDate("2026-11-06");
    expect(res3.iso).toBe("2026-11-06");
  });

  it("cleans and converts numeric strings safely", () => {
    expect(cleanNumber("12,450.80")).toBe(12450.8);
    expect(cleanNumber("-3,439.40")).toBe(-3439.4);
    expect(cleanNumber(5000.5)).toBe(5000.5);
    expect(cleanNumber("")).toBe(0);
    expect(cleanNumber(null)).toBe(0);
    expect(cleanNumber(undefined)).toBe(0);
    expect(cleanNumber("N/A")).toBe(0);
  });

  it("classifies institutional sentiment accurately", () => {
    // Strongly Bearish
    expect(classifySentiment(-100416, -577365, 13749)).toBe("BEARISH");
    // Mildly Bearish
    expect(classifySentiment(-10000, 10000, 0)).toBe("MILDLY_BEARISH");
    // Strongly Bullish
    expect(classifySentiment(30000, 50000, 2000)).toBe("BULLISH");
    // Mildly Bullish
    expect(classifySentiment(12000, -1000, -500)).toBe("MILDLY_BULLISH");
    // Neutral
    expect(classifySentiment(0, 0, 0)).toBe("NEUTRAL");
  });

  it("determines market status based on session timestamp", () => {
    // Any past date or weekend should return EOD_CONFIRMED
    const pastStatus = determineMarketStatus("2026-11-01");
    expect(pastStatus).toBe("EOD_CONFIRMED");
  });

  it("reads persistent EOD cache from config/fii-dii-cache.json", () => {
    const cache = readFiiDiiCache();
    expect(cache).not.toBeNull();
    expect(cache?.date).toBeDefined();
    expect(cache?.fii).toBeDefined();
    expect(typeof cache?.fii.buy).toBe("number");
    expect(typeof cache?.fii.sell).toBe("number");
    expect(typeof cache?.fii.net).toBe("number");
    expect(cache?.dii).toBeDefined();
    expect(typeof cache?.dii.buy).toBe("number");
    expect(typeof cache?.dii.sell).toBe("number");
    expect(typeof cache?.dii.net).toBe("number");
    expect(cache?.fno).toBeDefined();
    expect(typeof cache?.fno.fiiIndexFuturesNet).toBe("number");
    expect(typeof cache?.fno.fiiIndexOptionsNet).toBe("number");
    expect(cache?.fno.sentiment).toMatch(/BULLISH|BEARISH|NEUTRAL/);
    expect(cache?.history).toBeInstanceOf(Array);
    expect(cache?.history.length).toBeGreaterThan(0);
  });

  it("returns standardized contract payload from getFiiDiiData", async () => {
    const data = await getFiiDiiData();
    expect(data).toBeDefined();
    expect(typeof data.date).toBe("string");
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Standardized fii contract
    expect(data.fii).toBeDefined();
    expect(typeof data.fii.buy).toBe("number");
    expect(typeof data.fii.sell).toBe("number");
    expect(typeof data.fii.net).toBe("number");

    // Standardized dii contract
    expect(data.dii).toBeDefined();
    expect(typeof data.dii.buy).toBe("number");
    expect(typeof data.dii.sell).toBe("number");
    expect(typeof data.dii.net).toBe("number");

    // Standardized fno contract
    expect(data.fno).toBeDefined();
    expect(typeof data.fno.fiiIndexFuturesNet).toBe("number");
    expect(typeof data.fno.fiiIndexOptionsNet).toBe("number");
    expect(["BULLISH", "MILDLY_BULLISH", "NEUTRAL", "MILDLY_BEARISH", "BEARISH"]).toContain(
      data.fno.sentiment,
    );

    // Status contract
    expect(["LIVE", "EOD_CONFIRMED"]).toContain(data.status);

    // Rows for table display
    expect(data.rows).toBeInstanceOf(Array);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows[0].date).toBeDefined();
    expect(data.rows[0].fiiCash).toBeDefined();
    expect(data.rows[0].diiCash).toBeDefined();
    expect(data.rows[0].fiiFuture).toBeDefined();
  });
});
