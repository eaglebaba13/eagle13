import { describe, it, expect } from "vitest";
import { computeAtm, findAtmIndex } from "./atm-engine";
import { makeStrike } from "./types";

const strikes = [23_900, 24_000, 24_100, 24_200, 24_300, 24_400, 24_500].map((s) => makeStrike(s));

describe("atm-engine", () => {
  it("finds nearest strike", () => {
    expect(findAtmIndex(strikes.map((s) => s.strike), 24_150)).toBe(2);
    expect(findAtmIndex(strikes.map((s) => s.strike), 24_170)).toBe(3);
  });
  it("returns empty when spot missing", () => {
    const r = computeAtm(strikes, null, "ATM_5");
    expect(r.atm).toBeNull();
    expect(r.count).toBe(0);
  });
  it("ATM mode selects 1", () => {
    const r = computeAtm(strikes, 24_190, "ATM");
    expect(r.count).toBe(1);
    expect(r.atm).toBe(24_200);
  });
  it("ATM±5 clamps within available strikes", () => {
    const r = computeAtm(strikes, 24_190, "ATM_5");
    expect(r.firstStrike).toBe(23_900);
    expect(r.lastStrike).toBe(24_500);
  });
  it("CUSTOM radius", () => {
    const r = computeAtm(strikes, 24_190, "CUSTOM", 1);
    expect(r.selected).toEqual([24_100, 24_200, 24_300]);
  });
});