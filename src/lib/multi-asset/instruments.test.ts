import { describe, it, expect } from "vitest";
import { BRIEF_INSTRUMENTS, getInstrument, resolveCoindcxPair } from "./instruments";

describe("BRIEF_INSTRUMENTS registry", () => {
  it("contains all 8 Phase 44 instruments", () => {
    expect(BRIEF_INSTRUMENTS.map((i) => i.id).sort()).toEqual(
      ["BANKNIFTY", "BTC", "ETH", "GOLD", "NIFTY", "SILVER", "XAGUSD", "XAUUSD"],
    );
  });

  it("routes NIFTY/BANKNIFTY to upstox and metals/crypto to coindcx", () => {
    expect(getInstrument("NIFTY").provider).toBe("upstox");
    expect(getInstrument("BANKNIFTY").provider).toBe("upstox");
    expect(getInstrument("BTC").provider).toBe("coindcx");
    expect(getInstrument("GOLD").provider).toBe("coindcx");
  });

  it("throws on unknown instrument id", () => {
    // @ts-expect-error — deliberately invalid.
    expect(() => getInstrument("FOO")).toThrow();
  });
});

describe("resolveCoindcxPair", () => {
  const markets = [
    { base: "BTC",  quote: "USDT", pair: "B-BTC_USDT" },
    { base: "BTC",  quote: "INR",  pair: "I-BTC_INR" },
    { base: "ETH",  quote: "USDT", pair: "B-ETH_USDT" },
    { base: "PAXG", quote: "USDT", pair: "B-PAXG_USDT" },
  ];

  it("resolves BTC to first hinted quote that exists (USDT before INR)", () => {
    const r = resolveCoindcxPair(getInstrument("BTC"), markets);
    expect(r).toEqual({ base: "BTC", quote: "USDT", pair: "B-BTC_USDT" });
  });

  it("resolves GOLD to a tokenized proxy when available", () => {
    const r = resolveCoindcxPair(getInstrument("GOLD"), markets);
    expect(r?.base).toBe("PAXG");
  });

  it("returns null when no candidate exists — instrument must be UNAVAILABLE", () => {
    const r = resolveCoindcxPair(getInstrument("SILVER"), markets);
    expect(r).toBeNull();
  });
});