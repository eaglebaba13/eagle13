import { describe, it, expect } from "vitest";
import { computeInstitutionalFlow } from "./institutional-flow-engine";
import type { InstitutionalFlowEngineInput } from "./institutional-flow-engine";

function base(overrides: Partial<InstitutionalFlowEngineInput> = {}): InstitutionalFlowEngineInput {
  return {
    pcrIndices: [
      { index: "NIFTY", pcr: 1.18, weight: 0.6, available: true },
      { index: "BANKNIFTY", pcr: 1.05, weight: 0.4, available: true },
      { index: "SENSEX", pcr: null, weight: 0, available: false },
    ],
    combinedPcrValue: 1.13,
    combinedPcrScore: 0.5,
    combinedPcrBias: "BULLISH",
    spot: 24800,
    vwap: null,
    atmStrike: 24800,
    highestCallOiStrike: 25000,
    highestPutOiStrike: 24500,
    maxPain: 24700,
    oi: {
      totalCallChangeOi: -300000,
      totalPutChangeOi: 500000,
      priceChange: 50,
      buildUp: "LONG_BUILDUP",
      available: true,
    },
    breadthNet: 0.6,
    breadthAvailable: true,
    sectors: [
      { name: "Banking", bias: "BULLISH" },
      { name: "IT", bias: "NEUTRAL" },
      { name: "Oil & Gas", bias: "BULLISH" },
    ],
    vix: 13,
    vixRegime: "LOW",
    institutionalFlowBias: "BULLISH",
    institutionalFlowAvailable: true,
    decisionAction: "BUY_CALL",
    decisionConfidence: 78,
    strikeRecommended: {
      strike: 24800, type: "CE", moneyness: "ATM", available: true,
    },
    dataFreshness: "FRESH",
    providerHealth: "OK",
    generatedAt: "2026-07-20T05:00:00Z",
    ...overrides,
  };
}

describe("Institutional Flow & Probability Engine", () => {
  it("aggregates a bullish scenario", () => {
    const out = computeInstitutionalFlow(base());
    expect(out.combinedPcr.available).toBe(true);
    expect(out.combinedPcr.contributions.find((c) => c.index === "NIFTY")?.contributionPct).toBe(60);
    expect(out.combinedPcr.contributions.find((c) => c.index === "SENSEX")?.available).toBe(false);
    expect(out.oiClassifier.classification).toBe("LONG_BUILDUP");
    expect(out.institutionalFlow.bias).toBe("BULLISH");
    expect(out.tradeReadiness.total).toBe(12);
    expect(out.tradeReadiness.passed).toBeGreaterThan(0);
    expect(["VERY_STRONG", "STRONG"]).toContain(out.signalAgreement.level);
    expect(out.strikeAdvice.available).toBe(true);
    expect(out.confidence.value).toBeGreaterThan(0);
  });

  it("marks VWAP unavailable when feed missing", () => {
    const out = computeInstitutionalFlow(base());
    expect(out.vwap.available).toBe(false);
    const vwapItem = out.tradeReadiness.items.find((i) => i.key === "vwap");
    expect(vwapItem?.status).toBe("UNAVAILABLE");
  });

  it("degrades quality when critical inputs missing", () => {
    const out = computeInstitutionalFlow(base({
      combinedPcrBias: "UNAVAILABLE",
      combinedPcrValue: null,
      combinedPcrScore: null,
      oi: { totalCallChangeOi: null, totalPutChangeOi: null, priceChange: null, buildUp: null, available: false },
      sectors: [],
      breadthNet: null,
      institutionalFlowAvailable: false,
      institutionalFlowBias: "UNAVAILABLE",
      dataFreshness: "STALE",
      providerHealth: "DEGRADED",
      strikeRecommended: { strike: null, type: null, moneyness: null, available: false },
      decisionAction: "NO_TRADE",
    }));
    expect(out.dataQuality.overall === "WARNING" || out.dataQuality.overall === "POOR").toBe(true);
    expect(out.strikeAdvice.available).toBe(false);
  });

  it("detects breakout when spot exceeds resistance", () => {
    const out = computeInstitutionalFlow(base({ spot: 25100 }));
    expect(out.priceConfirmation.position).toBe("BREAKOUT");
  });

  it("computes high volatility regime when VIX high", () => {
    const out = computeInstitutionalFlow(base({ vix: 28, vixRegime: "HIGH" }));
    expect(out.regime).toBe("HIGH_VOLATILITY");
  });
});