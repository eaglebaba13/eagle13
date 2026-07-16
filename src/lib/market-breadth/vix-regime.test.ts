import { describe, it, expect } from "vitest";
import { classifyVix, evaluateVixRegime } from "./vix-regime";

describe("VIX regime classifier", () => {
  it("classifies boundaries deterministically", () => {
    expect(classifyVix(null)).toBe("UNKNOWN");
    expect(classifyVix(14.99)).toBe("BELOW_15");
    expect(classifyVix(15)).toBe("BETWEEN_15_AND_20");
    expect(classifyVix(19.99)).toBe("BETWEEN_15_AND_20");
    expect(classifyVix(20)).toBe("ABOVE_20");
    expect(classifyVix(24.99)).toBe("ABOVE_20");
    expect(classifyVix(25)).toBe("ABOVE_25");
  });
  it("evaluate flags regime change and rising", () => {
    const r = evaluateVixRegime({ currentVix: 21, previousVix: 18, provider: "UPSTOX", timestamp: "2026-07-16T00:00:00Z" });
    expect(r.regime).toBe("ABOVE_20");
    expect(r.previousRegime).toBe("BETWEEN_15_AND_20");
    expect(r.regimeChanged).toBe(true);
    expect(r.rising).toBe(true);
  });
});
