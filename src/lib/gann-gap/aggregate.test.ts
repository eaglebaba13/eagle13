import { describe, it, expect } from "vitest";
import { aggregateConfirmations } from "./aggregate";
import type { GannGapConfirmation } from "./types";

function mk(id: string, alignment: GannGapConfirmation["alignment"], direction: GannGapConfirmation["direction"] = "UNKNOWN"): GannGapConfirmation {
  return { id, label: id, alignment, detail: "", direction };
}

describe("aggregateConfirmations", () => {
  it("counts alignment buckets and derives net direction", () => {
    const agg = aggregateConfirmations([
      mk("a", "SUPPORTS_UP", "BULLISH"),
      mk("b", "SUPPORTS_UP", "BULLISH"),
      mk("c", "CONFLICT", "BEARISH"),
      mk("d", "NEUTRAL", "NEUTRAL"),
      mk("e", "UNAVAILABLE", "UNKNOWN"),
    ], "SUPPORTS_UP");
    expect(agg.aligned).toBe(2);
    expect(agg.conflict).toBe(1);
    expect(agg.neutral).toBe(1);
    expect(agg.unavailable).toBe(1);
    expect(agg.netDirection).toBe("BULLISH");
  });
  it("UNKNOWN when all unavailable", () => {
    const agg = aggregateConfirmations([mk("a", "UNAVAILABLE"), mk("b", "UNAVAILABLE")], "SUPPORTS_UP");
    expect(agg.netDirection).toBe("UNKNOWN");
    expect(agg.coverageRatio).toBe(0);
  });
});