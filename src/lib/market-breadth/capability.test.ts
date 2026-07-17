import { describe, it, expect } from "vitest";
import { evaluateMarketBreadthCapability } from "./capability";
import type {
  MarketBreadthSnapshot,
  PcrConfirmation,
  VixRegimeReading,
} from "./types";

const nowIso = "2026-07-17T04:00:00Z";

function vix(currentVix: number | null, freshness: "FRESH" | "STALE" | "UNKNOWN" = "FRESH"): VixRegimeReading {
  return {
    currentVix,
    previousVix: null,
    regime: currentVix == null ? "UNKNOWN" : "BETWEEN_15_AND_20",
    previousRegime: "UNKNOWN",
    regimeChanged: false,
    rising: false,
    freshness,
    provider: currentVix != null ? "Market Data Provider" : "N/A",
    timestamp: nowIso,
  };
}

function pcr(available: boolean, freshness: "FRESH" | "STALE" | "UNKNOWN" = "FRESH", quality: PcrConfirmation["dataQuality"] = "OK"): PcrConfirmation {
  return {
    available,
    combinedScore: available ? 1.0 : null,
    confirmedState: available ? "CE_FOCUS" : "UNAVAILABLE",
    slope: null,
    slopeChange: null,
    freshness,
    dataQuality: quality,
    provider: "Options Provider",
    timestamp: nowIso,
  };
}

function snap(dataQuality: MarketBreadthSnapshot["dataQuality"]): MarketBreadthSnapshot {
  return {
    timestamp: nowIso, provider: "Breadth Provider", universe: "NIFTY50",
    totalSymbols: 50, advances: 30, declines: 20, unchanged: 0, unavailable: 0,
    advanceDeclineRatio: 1.5, advancePercentage: 60, declinePercentage: 40,
    netBreadth: 10, weightedBreadth: 0.2, weightedAdvance: null, weightedDecline: null,
    weightedUnchanged: null, totalWeight: null, freshness: "FRESH",
    dataQuality, constituentCoverage: 1, snapshotId: "s1", registryVersion: "v1", warnings: [],
  };
}

describe("evaluateMarketBreadthCapability", () => {
  const base = { nowIso, providerAlias: "Breadth Provider" as const };

  it("SUPPORTED when everything live + fresh", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") },
      breadthSource: "LIVE",
    });
    expect(c.status).toBe("SUPPORTED");
  });

  it("PARTIAL when breadth is research demo", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") },
      breadthSource: "RESEARCH_DEMO",
    });
    expect(c.status).toBe("PARTIAL");
    expect(c.notes).toContain("breadth-research-demo");
  });

  it("PARTIAL when VIX missing", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(null), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("PARTIAL");
    expect(c.failingStage).toBe("VIX");
  });

  it("PARTIAL when PCR unavailable", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(false, "UNKNOWN", "UNAVAILABLE"),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("PARTIAL");
    expect(c.failingStage).toBe("PCR");
  });

  it("STALE when only staleness present", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15, "STALE"), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("STALE");
  });

  it("DATA_QUALITY_FAILURE when all breadth failed", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(true),
      breadth: { broad: snap("FAILED"), nifty50: snap("FAILED") }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("DATA_QUALITY_FAILURE");
  });

  it("AUTH_REQUIRED when VIX error mentions auth", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(null), vixError: "AUTH required", pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("AUTH_REQUIRED");
  });

  it("PROVIDER_ERROR when hard error surfaced", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(null), pcr: pcr(false), hardError: "timeout",
      breadth: { broad: null, nifty50: null }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("PROVIDER_ERROR");
  });

  it("NO_DATA when nothing at all", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(null), pcr: pcr(false, "UNKNOWN", "UNAVAILABLE"),
      breadth: { broad: null, nifty50: null }, breadthSource: "LIVE",
    });
    expect(c.status).toBe("NO_DATA");
  });

  it("never returns a fake zero value in reason", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(null), pcr: pcr(false),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.reason).not.toMatch(/^0/);
    expect(c.reason.length).toBeGreaterThan(0);
  });

  it("provider alias is a safe label, not raw brand", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(c.providerAlias).not.toMatch(/yahoo|nseindia|upstox/i);
  });

  it("capability object is safe to serialize (no functions/Response)", () => {
    const c = evaluateMarketBreadthCapability({
      ...base, vix: vix(15), pcr: pcr(true),
      breadth: { broad: snap("OK"), nifty50: snap("OK") }, breadthSource: "LIVE",
    });
    expect(() => JSON.stringify(c)).not.toThrow();
  });
});