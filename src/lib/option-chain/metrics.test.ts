import { describe, it, expect } from "vitest";
import { computeStrikeMetrics, computeAllMetrics } from "./metrics";
import { makeStrike } from "./types";

describe("metrics", () => {
  it("computes OI/volume differences", () => {
    const m = computeStrikeMetrics(makeStrike(24_000, { oi: 100, volume: 300 }, { oi: 40, volume: 100 }));
    expect(m.oiDifference).toBe(60);
    expect(m.volumeDifference).toBe(200);
    expect(m.missing).not.toContain("call.oi");
  });
  it("propagates missing flags", () => {
    const m = computeStrikeMetrics(makeStrike(24_000));
    expect(m.oiDifference).toBeNull();
    expect(m.missing).toContain("call.oi");
    expect(m.missing).toContain("put.oi");
  });
  it("computeAll maps 1:1", () => {
    const arr = computeAllMetrics([makeStrike(1), makeStrike(2)]);
    expect(arr).toHaveLength(2);
  });
});