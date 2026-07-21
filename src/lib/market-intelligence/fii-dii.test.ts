import { describe, it, expect } from "vitest";
import { aggregateFiiDii, classifyInstitutionalBias } from "./fii-dii";

describe("fii-dii", () => {
  it("classifies bias buckets", () => {
    expect(classifyInstitutionalBias(3000, 3000)).toBe("STRONG_BUY");
    expect(classifyInstitutionalBias(1000, 1000)).toBe("BUY");
    expect(classifyInstitutionalBias(100, 200)).toBe("NEUTRAL");
    expect(classifyInstitutionalBias(-1000, -1000)).toBe("SELL");
    expect(classifyInstitutionalBias(-3000, -3000)).toBe("STRONG_SELL");
    expect(classifyInstitutionalBias(null, null)).toBe("NEUTRAL");
  });
  it("aggregates latest and prior day change", () => {
    const r = aggregateFiiDii([
      { tradeDate: "2025-11-10", fiiBuy: 1, fiiSell: 1, fiiNet: 200, diiBuy: 1, diiSell: 1, diiNet: 300 },
      { tradeDate: "2025-11-11", fiiBuy: 1, fiiSell: 1, fiiNet: 800, diiBuy: 1, diiSell: 1, diiNet: 900 },
    ]);
    expect(r.latest?.tradeDate).toBe("2025-11-11");
    expect(r.dailyChange).toBe(1200);
    expect(r.institutionalBias).toBe("BUY");
  });
  it("handles empty", () => {
    const r = aggregateFiiDii([]);
    expect(r.latest).toBeNull();
    expect(r.institutionalBias).toBe("NEUTRAL");
  });
});