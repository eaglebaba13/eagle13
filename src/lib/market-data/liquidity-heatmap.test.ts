import { describe, expect, it } from "vitest";
import { heatmapColor, normalizeDepth, normalizeOptionChain } from "./liquidity-heatmap";
import { makeStrike, type OptionChainSnapshot } from "../option-chain/types";

describe("liquidity heatmap normalization", () => {
  it("aggregates valid depth into price-level notional", () => {
    const result = normalizeDepth("BTCUSDT", { bids: [["100", "2"], ["100", "1"], ["bad", "2"]], asks: [["101", "3"]] }, 1000);
    expect(result.levels).toEqual([{ timestamp: 1000, price: 100, intensity: 300, bid: 300, ask: 0, gex: null }, { timestamp: 1000, price: 101, intensity: 303, bid: 0, ask: 303, gex: null }]);
  });
  it("maps OI and available gamma without inventing missing Greeks", () => {
    const snapshot: OptionChainSnapshot = { instrument: "NIFTY", spotPrice: 100, timestamp: "2026-11-18T04:00:00.000Z", provider: "UPSTOX", expiry: "2026-11-19", availableExpiries: ["2026-11-19"], marketSession: "OPEN", dataQuality: "OK", strikes: [makeStrike(90, { oi: 10 }, { oi: 20 }), makeStrike(100, { oi: 30 }, { oi: 40 })] };
    const result = normalizeOptionChain("NIFTY50", snapshot);
    expect(result.levels[0]).toMatchObject({ price: 90, bid: 20, ask: 10, intensity: 30, gex: null });
    expect(result.maxPain).toBe(100);
  });
});
describe("heatmap color interpolation", () => {
  it("hits endpoints, clamps, and interpolates midpoint", () => {
    expect(heatmapColor(-1)).toBe("#090514");
    expect(heatmapColor(1)).toBe("#f59e0b");
    expect(heatmapColor(0.125)).toBe("#141030");
  });
});
