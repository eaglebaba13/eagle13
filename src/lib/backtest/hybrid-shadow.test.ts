import { describe, it, expect } from "vitest";
import {
  appendShadowEvent,
  clearShadowHistory,
  evaluateShadow,
  HYBRID_SHADOW_VERSION,
  loadShadowHistory,
  markEntryReady,
} from "./hybrid-shadow";
import type { HybridDecision } from "./hybrid-decision";

function decision(overrides: Partial<HybridDecision> = {}): HybridDecision {
  return {
    direction: "BUY",
    hybridScore: 80,
    astroContribution: 32,
    smcContribution: 32,
    agreementBonus: 15,
    dataQualityContribution: 5,
    reasons: ["AGREEMENT: astro=BUY smc=BUY"],
    ...overrides,
  };
}

function baseInput() {
  return {
    instrument: "NIFTY50",
    timeframe: "5m",
    provider: "CSV",
    providerStatus: "LIVE" as const,
    candleClosed: true,
    sameSession: true,
    expectedAstroFormula: "GANN_SIGN_DEGREE_TABLE_V1_1",
    expectedSmcFormula: "SMC_V1",
    astroFormula: "GANN_SIGN_DEGREE_TABLE_V1_1",
    smcFormula: "SMC_V1",
    hybrid: decision(),
    hybridScoreThreshold: 55,
    runId: "test-run",
    timestamp: "2024-06-04T09:20:00Z",
  };
}

describe("Phase 21.4 Stage 4C · hybrid shadow validator", () => {
  it("emits AGREEMENT_BUY on a clean pass", () => {
    const evt = evaluateShadow(baseInput());
    expect(evt.type).toBe("AGREEMENT_BUY");
    expect(evt.outcome).toBe("OPEN");
    expect(evt.version).toBe(HYBRID_SHADOW_VERSION);
  });

  it("blocks on stale provider status", () => {
    const evt = evaluateShadow({ ...baseInput(), providerStatus: "STALE" });
    expect(evt.type).toBe("DATA_INCOMPLETE");
  });

  it("blocks on unclosed candle", () => {
    const evt = evaluateShadow({ ...baseInput(), candleClosed: false });
    expect(evt.type).toBe("WAIT");
  });

  it("blocks on formula mismatch", () => {
    const evt = evaluateShadow({
      ...baseInput(),
      astroFormula: "GANN_LEGACY",
    });
    expect(evt.type).toBe("DATA_INCOMPLETE");
  });

  it("blocks on session mismatch", () => {
    const evt = evaluateShadow({ ...baseInput(), sameSession: false });
    expect(evt.type).toBe("WAIT");
  });

  it("blocks when hybrid score is below threshold", () => {
    const evt = evaluateShadow({
      ...baseInput(),
      hybrid: decision({ hybridScore: 30 }),
    });
    expect(evt.type).toBe("WAIT");
  });

  it("emits CONFLICT for direct directional disagreement", () => {
    const evt = evaluateShadow({
      ...baseInput(),
      hybrid: decision({ direction: "CONFLICT", hybridScore: 0 }),
    });
    expect(evt.type).toBe("CONFLICT");
  });

  it("markEntryReady upgrades AGREEMENT to ENTRY_READY_SHADOW", () => {
    const evt = evaluateShadow(baseInput());
    const ready = markEntryReady(evt);
    expect(ready.type).toBe("ENTRY_READY_SHADOW");
  });

  it("persists to injected storage and caps at 100 events", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    for (let i = 0; i < 120; i++) {
      appendShadowEvent(evaluateShadow(baseInput()), storage);
    }
    const hist = loadShadowHistory(storage);
    expect(hist.length).toBe(100);
    clearShadowHistory(storage);
    expect(loadShadowHistory(storage).length).toBe(0);
  });
});