import { describe, expect, it } from "vitest";
import { dateRangeError } from "./input-validation";
import { weightsFromPercent } from "./combined-pcr/pcr-math";
import { normalizeOptionLegs, computePCR, computeMaxPain } from "./options-analytics";

describe("Momentic input boundaries", () => {
  it.each(["", "-100", "990", "0100", "25.5", "Infinity", "invalid"])("normalizes percentage input %s", (raw) => {
    for (const edited of ["NIFTY", "BANKNIFTY"] as const) {
      const weights = weightsFromPercent(raw, edited);
      expect(weights.NIFTY).toBeGreaterThanOrEqual(0);
      expect(weights.BANKNIFTY).toBeGreaterThanOrEqual(0);
      expect(weights.NIFTY).toBeLessThanOrEqual(1);
      expect(weights.BANKNIFTY).toBeLessThanOrEqual(1);
      expect(weights.NIFTY + weights.BANKNIFTY).toBeCloseTo(1);
    }
    expect(weightsFromPercent("0100", "BANKNIFTY")).toEqual({ NIFTY: 0, BANKNIFTY: 1 });
    expect(weightsFromPercent("25.5", "NIFTY")).toEqual({ NIFTY: 0.255, BANKNIFTY: 0.745 });
  });
  it.each([["", "2026-11-16"], ["2026-11-16", "2026-11-15"], ["2026-02-30", "2026-03-01"]])("rejects invalid range %s to %s", (from, to) => expect(dateRangeError(from, to)).toBeTruthy());
  it("accepts valid same-day and leap-day ranges", () => {
    expect(dateRangeError("2024-02-29", "2024-02-29")).toBeNull();
  });
  it("normalizes missing provider numerics without changing valid contracts or producing nonfinite analytics", () => {
    const legs = normalizeOptionLegs([null, { strike: 25000, side: "CE", oi: null, iv: "bad" }, { strike: 25000, side: "PE", oi: 100, changeOi: -25 }, { strike: -1, side: "CE" }]);
    expect(legs).toHaveLength(2);
    expect(legs[0].iv).toBeNull();
    expect(legs[1].changeOi).toBe(-25);
    expect(Number.isFinite(computePCR(legs).pcrOi)).toBe(true);
    expect(Number.isFinite(computeMaxPain(legs).payout)).toBe(true);
  });
});
