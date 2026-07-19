import { describe, it, expect } from "vitest";
import {
  GOLD_SILVER_BUY_GOLD_THRESHOLD,
  GOLD_SILVER_BUY_SILVER_THRESHOLD,
  classifyRatio,
  computeGoldSilverRatio,
  formatRatio,
  troyOuncesForToken,
  worstFreshness,
} from "./gold-silver-ratio";
import type { MetalQuoteInput } from "./types";

const NOW = Date.parse("2026-07-19T10:00:00Z");

function gold(overrides: Partial<MetalQuoteInput> = {}): MetalQuoteInput {
  return {
    instrument: "PAXG/USDT",
    classification: "TOKENIZED_GOLD",
    price: 2400,
    quoteCurrency: "USDT",
    troyOuncesPerUnit: 1,
    timestamp: new Date(NOW - 5_000).toISOString(),
    freshness: "LIVE",
    ...overrides,
  };
}
function silver(overrides: Partial<MetalQuoteInput> = {}): MetalQuoteInput {
  return {
    instrument: "KAG/USDT",
    classification: "TOKENIZED_SILVER",
    price: 30,
    quoteCurrency: "USDT",
    troyOuncesPerUnit: 1,
    timestamp: new Date(NOW - 5_000).toISOString(),
    freshness: "LIVE",
    ...overrides,
  };
}

describe("Phase 3F.2A · thresholds", () => {
  it("exports 50 / 80 thresholds", () => {
    expect(GOLD_SILVER_BUY_GOLD_THRESHOLD).toBe(50);
    expect(GOLD_SILVER_BUY_SILVER_THRESHOLD).toBe(80);
  });
  it("ratio above 80 → BUY_SILVER", () => expect(classifyRatio(80.01)).toBe("BUY_SILVER"));
  it("ratio below 50 → BUY_GOLD", () => expect(classifyRatio(49.99)).toBe("BUY_GOLD"));
  it("ratio exactly 80 → NEUTRAL", () => expect(classifyRatio(80)).toBe("NEUTRAL"));
  it("ratio exactly 50 → NEUTRAL", () => expect(classifyRatio(50)).toBe("NEUTRAL"));
  it("ratio between 50 and 80 → NEUTRAL", () => expect(classifyRatio(65)).toBe("NEUTRAL"));
});

describe("Phase 3F.2A · compute", () => {
  it("computes ratio for compatible tokenized pair", () => {
    const r = computeGoldSilverRatio({ gold: gold(), silver: silver(), now: NOW });
    expect(r.ratio).toBeCloseTo(80, 6);
    expect(r.signal).toBe("NEUTRAL");
    expect(r.normalizedUnit).toBe("TROY_OUNCE");
    expect(r.quoteCurrency).toBe("USDT");
    expect(r.isUnitCompatible).toBe(true);
    expect(r.isQuoteCompatible).toBe(true);
  });
  it("BUY_SILVER when ratio > 80", () => {
    const r = computeGoldSilverRatio({ gold: gold({ price: 2500 }), silver: silver({ price: 30 }), now: NOW });
    expect(r.signal).toBe("BUY_SILVER");
  });
  it("BUY_GOLD when ratio < 50", () => {
    const r = computeGoldSilverRatio({ gold: gold({ price: 2000 }), silver: silver({ price: 45 }), now: NOW });
    expect(r.signal).toBe("BUY_GOLD");
  });
  it("decimal ratio math is deterministic", () => {
    const r = computeGoldSilverRatio({
      gold: gold({ price: 2450.5 }),
      silver: silver({ price: 32.25 }),
      now: NOW,
    });
    expect(r.ratio).toBeCloseTo(2450.5 / 32.25, 6);
    expect(formatRatio(r.ratio)).toBe((2450.5 / 32.25).toFixed(2));
  });
  it("missing gold → UNAVAILABLE + reason", () => {
    const r = computeGoldSilverRatio({ gold: null, silver: silver(), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
    expect(r.reason).toMatch(/Gold instrument unavailable/);
  });
  it("missing silver → UNAVAILABLE + reason", () => {
    const r = computeGoldSilverRatio({ gold: gold(), silver: null, now: NOW });
    expect(r.reason).toMatch(/Silver instrument unavailable/);
  });
  it("zero silver price → UNAVAILABLE", () => {
    const r = computeGoldSilverRatio({ gold: gold(), silver: silver({ price: 0 }), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
  });
  it("negative gold price → UNAVAILABLE", () => {
    const r = computeGoldSilverRatio({ gold: gold({ price: -1 }), silver: silver(), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
  });
  it("different quote currencies → INCOMPATIBLE_QUOTE", () => {
    const r = computeGoldSilverRatio({ gold: gold({ quoteCurrency: "USD" }), silver: silver({ quoteCurrency: "INR" }), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
    expect(r.reason).toMatch(/incompatible quote currencies/);
  });
  it("incompatible units (missing troy oz) → INCOMPATIBLE_UNITS", () => {
    const r = computeGoldSilverRatio({ gold: gold({ troyOuncesPerUnit: null }), silver: silver(), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
    expect(r.reason).toMatch(/incompatible units/);
  });
  it("stale gold → UNAVAILABLE with stale freshness", () => {
    const r = computeGoldSilverRatio({ gold: gold({ freshness: "STALE" }), silver: silver(), now: NOW });
    expect(r.signal).toBe("UNAVAILABLE");
    expect(r.freshness).toBe("STALE");
  });
  it("stale silver → UNAVAILABLE with stale freshness", () => {
    const r = computeGoldSilverRatio({ gold: gold(), silver: silver({ freshness: "STALE" }), now: NOW });
    expect(r.freshness).toBe("STALE");
  });
  it("worst freshness propagation: LIVE + DELAYED → DELAYED", () => {
    const r = computeGoldSilverRatio({ gold: gold(), silver: silver({ freshness: "DELAYED" }), now: NOW });
    expect(r.freshness).toBe("DELAYED");
    expect(r.signal).not.toBe("UNAVAILABLE");
  });
  it("worstFreshness helper", () => {
    expect(worstFreshness("LIVE", "DELAYED")).toBe("DELAYED");
    expect(worstFreshness("STALE", "LIVE")).toBe("STALE");
    expect(worstFreshness("UNAVAILABLE", "STALE")).toBe("UNAVAILABLE");
  });
  it("token registry recognises PAXG / XAUT", () => {
    expect(troyOuncesForToken("PAXG")).toBe(1);
    expect(troyOuncesForToken("XAUT")).toBe(1);
    expect(troyOuncesForToken("UNKNOWN")).toBeNull();
  });
});