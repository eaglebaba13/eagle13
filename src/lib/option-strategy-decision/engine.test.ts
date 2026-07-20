import { describe, it, expect } from "vitest";
import { computeOptionDecision } from "./engine";
import type { DecisionEngineInput } from "./types";

function baseInput(overrides: Partial<DecisionEngineInput> = {}): DecisionEngineInput {
  return {
    pcr: { combinedScore: 0.9, state: "STRONG_PE_FOCUS", available: true },
    breadth: { advances: 1800, declines: 200, netBreadth: 0.8, available: true },
    sector: { banking: "BULLISH", oilGas: "BULLISH", it: "BULLISH", available: true },
    oi: {
      highestCallOiStrike: 25000,
      highestPutOiStrike: 24500,
      atmStrike: 24800,
      totalCallChangeOi: -300000,
      totalPutChangeOi: 500000,
      buildUp: "LONG_BUILDUP",
      available: true,
    },
    maxPain: { value: 24900, spot: 24800, distance: 100, distancePct: -0.4, available: true },
    vix: 13,
    underlying: "NIFTY",
    generatedAt: "2026-07-20T05:00:00Z",
    ...overrides,
  };
}

describe("Option Strategy Decision Engine", () => {
  it("emits BUY_CALL on aligned bullish inputs", () => {
    const out = computeOptionDecision(baseInput());
    expect(out.action).toBe("BUY_CALL");
    expect(out.bullScore).toBeGreaterThan(out.bearScore);
    expect(out.strike.optionType).toBe("CE");
    expect(out.strike.strike).not.toBeNull();
    expect(out.confidence).toBeGreaterThan(0);
  });

  it("emits BUY_PUT on symmetric bearish inputs", () => {
    const out = computeOptionDecision(
      baseInput({
        pcr: { combinedScore: -0.9, state: "STRONG_CE_FOCUS", available: true },
        breadth: { advances: 200, declines: 1800, netBreadth: -0.8, available: true },
        sector: { banking: "BEARISH", oilGas: "BEARISH", it: "BEARISH", available: true },
        oi: {
          highestCallOiStrike: 25000,
          highestPutOiStrike: 24500,
          atmStrike: 24800,
          totalCallChangeOi: 500000,
          totalPutChangeOi: -300000,
          buildUp: "SHORT_BUILDUP",
          available: true,
        },
        maxPain: { value: 24600, spot: 24800, distance: 200, distancePct: 0.8, available: true },
        vix: 18,
      }),
    );
    expect(out.action).toBe("BUY_PUT");
    expect(out.strike.optionType).toBe("PE");
  });

  it("returns NO_TRADE when VIX above 25", () => {
    const out = computeOptionDecision(baseInput({ vix: 28 }));
    expect(out.action).toBe("NO_TRADE");
    expect(out.sizing.suggestedSizePct).toBe(0);
    expect(out.strike.strike).toBeNull();
  });

  it("waits when scores are close", () => {
    const out = computeOptionDecision(
      baseInput({
        pcr: { combinedScore: 0.1, state: "NEUTRAL", available: true },
        breadth: { advances: 1000, declines: 950, netBreadth: 0.02, available: true },
        sector: { banking: "BULLISH", oilGas: "BEARISH", it: "NEUTRAL", available: true },
        oi: {
          highestCallOiStrike: 25000,
          highestPutOiStrike: 24500,
          atmStrike: 24800,
          totalCallChangeOi: 100000,
          totalPutChangeOi: 110000,
          buildUp: null,
          available: true,
        },
      }),
    );
    expect(["WAIT", "NO_TRADE"]).toContain(out.action);
  });

  it("marks indicators UNAVAILABLE when input missing", () => {
    const out = computeOptionDecision(
      baseInput({
        pcr: { combinedScore: null, state: null, available: false },
        breadth: { advances: null, declines: null, netBreadth: null, available: false },
        sector: { banking: "UNAVAILABLE", oilGas: "UNAVAILABLE", it: "UNAVAILABLE", available: false },
        oi: {
          highestCallOiStrike: null,
          highestPutOiStrike: null,
          atmStrike: null,
          totalCallChangeOi: null,
          totalPutChangeOi: null,
          buildUp: null,
          available: false,
        },
        maxPain: { value: null, spot: null, distance: null, distancePct: null, available: false },
        vix: null,
      }),
    );
    expect(out.action).toBe("NO_TRADE");
    expect(out.indicators.every((i) => !i.available)).toBe(true);
  });

  it("recommends ATM strike when VIX low, OTM when medium", () => {
    const low = computeOptionDecision(baseInput({ vix: 12 }));
    const med = computeOptionDecision(baseInput({ vix: 17 }));
    expect(low.strike.moneyness).toBe("ATM");
    expect(med.strike.moneyness).toBe("OTM");
    expect(med.strike.strike!).toBeGreaterThan(low.strike.strike!);
  });

  it("is deterministic", () => {
    const a = computeOptionDecision(baseInput());
    const b = computeOptionDecision(baseInput());
    expect(a).toEqual(b);
  });

  it("weights sum to 1", () => {
    const out = computeOptionDecision(baseInput());
    const total = out.indicators.reduce((acc, i) => acc + i.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});