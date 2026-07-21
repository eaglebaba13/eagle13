import { describe, it, expect } from "vitest";
import { aggregateGlobalMarkets } from "./global-markets";

describe("global-markets", () => {
  it("computes contribution and composite bias", () => {
    const r = aggregateGlobalMarkets([
      { symbol: "N225", last: 40000, change: 400, changePct: 1.0 },
      { symbol: "HSI", last: 18000, change: -180, changePct: -1.0 },
      { symbol: "ES=F", last: 5000, change: 25, changePct: 0.5 },
    ]);
    const total = r.rows.reduce((s, x) => s + (x.contributionPct ?? 0), 0);
    expect(total).toBeCloseTo(1, 3);
    expect(r.compositeBiasPct).toBeGreaterThanOrEqual(-1);
    expect(r.compositeBiasPct).toBeLessThanOrEqual(1);
  });
  it("handles empty inputs", () => {
    const r = aggregateGlobalMarkets([]);
    expect(r.rows).toEqual([]);
    expect(r.compositeBiasPct).toBe(0);
  });
});