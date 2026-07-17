import { describe, it, expect } from "vitest";
import { classifyActualOutcome, FLAT_GAP_TOLERANCE_PCT } from "./outcome-rules";

describe("classifyActualOutcome", () => {
  it("gap up beyond tolerance", () => {
    expect(classifyActualOutcome({ previousClose: 20000, nextOpen: 20100 }).outcome).toBe("ACTUAL_GAP_UP");
  });
  it("gap down beyond tolerance", () => {
    expect(classifyActualOutcome({ previousClose: 20000, nextOpen: 19900 }).outcome).toBe("ACTUAL_GAP_DOWN");
  });
  it("flat within tolerance", () => {
    const nextOpen = 20000 + 20000 * FLAT_GAP_TOLERANCE_PCT * 0.5;
    expect(classifyActualOutcome({ previousClose: 20000, nextOpen }).outcome).toBe("ACTUAL_FLAT");
  });
  it("OUTCOME_UNAVAILABLE when prices missing/invalid", () => {
    expect(classifyActualOutcome({ previousClose: null, nextOpen: 100 }).outcome).toBe("OUTCOME_UNAVAILABLE");
    expect(classifyActualOutcome({ previousClose: 100, nextOpen: null }).outcome).toBe("OUTCOME_UNAVAILABLE");
    expect(classifyActualOutcome({ previousClose: -1, nextOpen: 100 }).outcome).toBe("OUTCOME_UNAVAILABLE");
  });
});