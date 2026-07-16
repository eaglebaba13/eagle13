import { describe, it, expect } from "vitest";
import {
  advanceConfirmation,
  classifyState,
  INITIAL_CONFIRMATION,
} from "./signal-engine";

describe("signal-engine", () => {
  it("classifies bands", () => {
    expect(classifyState({ score: -80, slope: 0 })).toBe("STRONG_CE_FOCUS");
    expect(classifyState({ score: -40, slope: 0 })).toBe("CE_FOCUS");
    expect(classifyState({ score: -40, slope: 5 })).toBe("BULLISH_WEAKENING");
    expect(classifyState({ score: 0, slope: 0 })).toBe("NO_TRADE");
    expect(classifyState({ score: 40, slope: 0 })).toBe("PE_FOCUS");
    expect(classifyState({ score: 40, slope: -5 })).toBe("BEARISH_WEAKENING");
    expect(classifyState({ score: 80, slope: 0 })).toBe("STRONG_PE_FOCUS");
    expect(classifyState({ score: null, slope: null })).toBe("NO_TRADE");
  });
  it("requires 2 consecutive candidates to confirm", () => {
    let s = INITIAL_CONFIRMATION;
    s = advanceConfirmation(s, "PE_FOCUS");
    expect(s.confirmed).toBe("NO_TRADE");
    s = advanceConfirmation(s, "PE_FOCUS");
    expect(s.confirmed).toBe("PE_FOCUS");
  });
  it("resets count on state change before confirmation", () => {
    let s = INITIAL_CONFIRMATION;
    s = advanceConfirmation(s, "PE_FOCUS");
    s = advanceConfirmation(s, "STRONG_PE_FOCUS");
    expect(s.confirmed).toBe("NO_TRADE");
    expect(s.count).toBe(1);
  });
});