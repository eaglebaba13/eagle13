import { describe, it, expect } from "vitest";
import { filterStrikes } from "./strike-filter";
import { makeStrike, type OptionChainSnapshot } from "./types";

const snap: OptionChainSnapshot = {
  instrument: "NIFTY",
  spotPrice: 24_190,
  timestamp: new Date().toISOString(),
  provider: "MOCK",
  expiry: "2025-01-16",
  availableExpiries: [],
  marketSession: "OPEN",
  dataQuality: "OK",
  strikes: [23_900, 24_000, 24_100, 24_200, 24_300, 24_400, 24_500].map((s) => makeStrike(s)),
};

describe("strike-filter", () => {
  it("splits included and excluded deterministically", () => {
    const r = filterStrikes(snap, "CUSTOM", 1);
    expect(r.included.map((s) => s.strike)).toEqual([24_100, 24_200, 24_300]);
    expect(r.excluded.map((s) => s.strike)).toEqual([23_900, 24_000, 24_400, 24_500]);
  });
  it("ATM selects only atm", () => {
    const r = filterStrikes(snap, "ATM");
    expect(r.included).toHaveLength(1);
    expect(r.atm).toBe(24_200);
  });
});