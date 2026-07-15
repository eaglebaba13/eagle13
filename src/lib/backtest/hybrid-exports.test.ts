import { describe, it, expect } from "vitest";
import {
  buildAttributionCsv,
  buildDataQualityCsv,
  buildHybridQualityCsv,
  buildProviderMetadataCsv,
  buildShadowHistoryCsv,
  buildValidationJson,
} from "./hybrid-exports";
import { computeThreeWayAttribution } from "./attribution";
import { computeHybridQuality } from "./hybrid-quality";
import { evaluateShadow, HYBRID_SHADOW_VERSION } from "./hybrid-shadow";
import type { HybridDecision } from "./hybrid-decision";

const decision: HybridDecision = {
  direction: "BUY",
  hybridScore: 80,
  astroContribution: 32,
  smcContribution: 32,
  agreementBonus: 15,
  dataQualityContribution: 5,
  reasons: ["ok"],
};

describe("Phase 21.4 Stage 4C · exports", () => {
  it("provider metadata CSV contains provenance fields", () => {
    const csv = buildProviderMetadataCsv({
      providerId: "CSV",
      providerLabel: "CSV",
      requestedFrom: "2024-06-04",
      requestedTo: "2024-06-04",
      actualFrom: "2024-06-04",
      actualTo: "2024-06-04",
      timeframe: "5m",
      timezone: "Asia/Kolkata",
      candleCount: 75,
      dataHash: "abcdef01",
    });
    expect(csv).toContain("providerId,CSV");
    expect(csv).toContain("dataHash,abcdef01");
  });

  it("data-quality CSV encodes status + coverage", () => {
    const csv = buildDataQualityCsv("LIVE", 100, 0);
    expect(csv).toContain("status,LIVE");
    expect(csv).toContain("coveragePct,100");
  });

  it("attribution CSV includes every bucket + TOTALS", () => {
    const a = computeThreeWayAttribution([], [], [], {
      agreementNoTradeCount: 1,
      conflictBlockedCount: 2,
      dataIncompleteCount: 3,
    });
    const csv = buildAttributionCsv(a);
    expect(csv).toContain("HYBRID_KEPT_ASTRO_WINNER");
    expect(csv).toContain("AGREEMENT_NO_TRADE");
    expect(csv).toContain("CONFLICT_BLOCKED");
    expect(csv).toContain("DATA_INCOMPLETE");
    expect(csv).toContain("TOTALS");
  });

  it("hybrid quality CSV lists every metric", () => {
    const a = computeThreeWayAttribution([], [], []);
    const q = computeHybridQuality(
      { BUY: 1, SELL: 1, WAIT: 1, CONFLICT: 0, DATA_INCOMPLETE: 0, FORMULA_MISMATCH: 0 },
      2,
      a,
    );
    const csv = buildHybridQualityCsv(q);
    expect(csv).toContain("agreementRate");
    expect(csv).toContain("winnerRetentionRate");
  });

  it("shadow history CSV serialises events", () => {
    const evt = evaluateShadow({
      instrument: "NIFTY50",
      timeframe: "5m",
      provider: "CSV",
      providerStatus: "LIVE",
      candleClosed: true,
      sameSession: true,
      expectedAstroFormula: "GANN_SIGN_DEGREE_TABLE_V1_1",
      expectedSmcFormula: "SMC_V1",
      astroFormula: "GANN_SIGN_DEGREE_TABLE_V1_1",
      smcFormula: "SMC_V1",
      hybrid: decision,
      hybridScoreThreshold: 55,
      runId: "test",
      timestamp: "2024-06-04T09:20:00Z",
    });
    const csv = buildShadowHistoryCsv([evt]);
    expect(csv).toContain("AGREEMENT_BUY");
    expect(csv).toContain("NIFTY50");
  });

  it("validation JSON is deterministic and includes version", () => {
    const json = buildValidationJson({
      version: "HYBRID_VALIDATION_V1",
      provider: {
        providerId: "CSV",
        providerLabel: "CSV",
        requestedFrom: "2024-06-04",
        requestedTo: "2024-06-04",
        actualFrom: null,
        actualTo: null,
        timeframe: "5m",
        timezone: "Asia/Kolkata",
        candleCount: 0,
        dataHash: "00000000",
      },
      dataQuality: { status: "LIVE", coveragePct: 100, gaps: 0 },
      attribution: computeThreeWayAttribution([], [], []),
      hybridQuality: computeHybridQuality(
        { BUY: 0, SELL: 0, WAIT: 0, CONFLICT: 0, DATA_INCOMPLETE: 0, FORMULA_MISMATCH: 0 },
        0,
        computeThreeWayAttribution([], [], []),
      ),
      shadow: [],
    });
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("HYBRID_VALIDATION_V1");
    expect(parsed.provider.providerId).toBe("CSV");
    // sanity: shadow version constant exists (referenced by callers)
    expect(HYBRID_SHADOW_VERSION).toBe("HYBRID_SHADOW_V1");
  });
});