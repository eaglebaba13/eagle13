import { describe, it, expect } from "vitest";
import { computeEma, computeEmaSeries, tip } from "./ema-engine";

describe("ema-engine", () => {
  it("EMA seeds with first value and propagates nulls", () => {
    const e = computeEma([null, null, 10, 12, 14], 3);
    expect(e[0]).toBeNull();
    expect(e[2]).toBe(10);
    expect(e[3]).toBeGreaterThan(10);
    expect(e[4]).toBeGreaterThan(e[3] as number);
  });
  it("series produces slope = fast - slow", () => {
    const s = computeEmaSeries([0, 10, 20, 30, 40, 50, 60, 70, 80]);
    const last = s.slope[s.slope.length - 1];
    expect(last).not.toBeNull();
    expect(last as number).toBeGreaterThan(0);
  });
  it("tip computes slope change and zero cross", () => {
    const s = computeEmaSeries([0, -10, -20, -10, 10, 30, 40]);
    const t = tip(s);
    expect(t.slope).not.toBeNull();
    expect(t.slopeChange).not.toBeNull();
  });
  it("detects zero cross when slope flips sign", () => {
    const series = { fast: [-1, 1], slow: [0, 0], slope: [-1, 1] };
    const t = tip(series);
    expect(t.zeroCross).toBe(true);
  });
});