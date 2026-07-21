import { describe, it, expect } from "vitest";
import {
  computeMacroRatio,
  classifyMacroBias,
  hasCrossedThreshold,
  MACRO_LOWER_THRESHOLD,
  MACRO_UPPER_THRESHOLD,
  type MacroPriceInput,
} from "./macro-ratio";

const FIXED_NOW = Date.parse("2025-01-15T04:00:00Z");

function price(over: Partial<MacroPriceInput>): MacroPriceInput {
  return {
    price: 2000,
    quoteCurrency: "USD",
    troyOuncesPerUnit: 1,
    timestamp: "2025-01-15T03:59:00Z",
    freshness: "LIVE",
    provider: "test",
    ...over,
  };
}

describe("classifyMacroBias — Phase 44 thresholds 55/80", () => {
  it("ratio > 80 -> BUY_SILVER", () => {
    const r = classifyMacroBias(85);
    expect(r.macroBias).toBe("BUY_SILVER");
    expect(r.goldBias).toBe("BEARISH_RELATIVE");
    expect(r.silverBias).toBe("BULLISH_RELATIVE");
  });
  it("ratio < 55 -> BUY_GOLD", () => {
    const r = classifyMacroBias(40);
    expect(r.macroBias).toBe("BUY_GOLD");
    expect(r.goldBias).toBe("BULLISH_RELATIVE");
    expect(r.silverBias).toBe("BEARISH_RELATIVE");
  });
  it("boundary 55 inclusive -> NEUTRAL/WAIT", () => {
    const r = classifyMacroBias(MACRO_LOWER_THRESHOLD);
    expect(r.macroBias).toBe("NEUTRAL");
    expect(r.action).toBe("WAIT");
  });
  it("boundary 80 inclusive -> NEUTRAL/WAIT", () => {
    const r = classifyMacroBias(MACRO_UPPER_THRESHOLD);
    expect(r.macroBias).toBe("NEUTRAL");
    expect(r.action).toBe("WAIT");
  });
  it("mid-band 67 -> NEUTRAL", () => {
    expect(classifyMacroBias(67).macroBias).toBe("NEUTRAL");
  });
});

describe("computeMacroRatio", () => {
  it("normalizes per troy ounce and classifies BUY_SILVER above 80", () => {
    const r = computeMacroRatio({
      gold: price({ price: 2400, troyOuncesPerUnit: 1 }),
      silver: price({ price: 28, troyOuncesPerUnit: 1 }),
      now: FIXED_NOW,
    });
    expect(r.ratio).toBeCloseTo(85.71, 2);
    expect(r.macroBias).toBe("BUY_SILVER");
    expect(r.normalizationMethod).toBe("PRICE_PER_TROY_OUNCE");
  });

  it("handles per-token normalization (e.g. non-1 troyOuncesPerUnit)", () => {
    // Silver token that represents 5 oz per unit.
    const r = computeMacroRatio({
      gold: price({ price: 2000, troyOuncesPerUnit: 1 }),
      silver: price({ price: 200, troyOuncesPerUnit: 5 }), // -> 40 per oz
      now: FIXED_NOW,
    });
    expect(r.normalizedSilver).toBe(40);
    expect(r.ratio).toBe(50);
    expect(r.macroBias).toBe("BUY_GOLD");
  });

  it("rejects incompatible quote currencies", () => {
    const r = computeMacroRatio({
      gold: price({ quoteCurrency: "USD" }),
      silver: price({ quoteCurrency: "INR" }),
      now: FIXED_NOW,
    });
    expect(r.macroBias).toBe("UNAVAILABLE");
    expect(r.reason).toMatch(/quote currencies/i);
  });

  it("rejects stale inputs — never emits a bias from stale data", () => {
    const r = computeMacroRatio({
      gold: price({ freshness: "STALE" }),
      silver: price(),
      now: FIXED_NOW,
    });
    expect(r.macroBias).toBe("UNAVAILABLE");
    expect(r.freshness).toBe("STALE");
  });

  it("rejects missing prices", () => {
    const r = computeMacroRatio({
      gold: price({ price: null }),
      silver: price(),
      now: FIXED_NOW,
    });
    expect(r.macroBias).toBe("UNAVAILABLE");
  });
});

describe("hasCrossedThreshold", () => {
  it("returns false on identical bands", () => {
    expect(hasCrossedThreshold("NEUTRAL", "NEUTRAL")).toBe(false);
  });
  it("detects NEUTRAL -> BUY_SILVER", () => {
    expect(hasCrossedThreshold("NEUTRAL", "BUY_SILVER")).toBe(true);
  });
  it("detects BUY_SILVER -> BUY_GOLD", () => {
    expect(hasCrossedThreshold("BUY_SILVER", "BUY_GOLD")).toBe(true);
  });
  it("never emits when current is UNAVAILABLE", () => {
    expect(hasCrossedThreshold("BUY_GOLD", "UNAVAILABLE")).toBe(false);
  });
  it("does not emit on first observation (previous null)", () => {
    expect(hasCrossedThreshold(null, "BUY_GOLD")).toBe(false);
  });
});