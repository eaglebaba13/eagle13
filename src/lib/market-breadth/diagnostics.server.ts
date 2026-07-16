// Phase 27 · Stage 3 — Admin diagnostics report for market breadth.

import { buildMockBreadthBundle } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import { classifyGti } from "./gti-classifier";
import { NIFTY50_REGISTRY_VERSION, NIFTY50_REGISTRY_EFFECTIVE_DATE } from "./nifty50-registry";
import { SECTOR_REGISTRY_VERSION, SECTOR_REGISTRY_EFFECTIVE_DATE } from "./sector-registry";

export interface MarketBreadthDiagnosticsReport {
  readonly generatedAt: string;
  readonly provider: string;
  readonly universeRequested: number;
  readonly universeReturned: number;
  readonly coverage: number;
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly unavailable: number;
  readonly nifty50RegistryVersion: string;
  readonly nifty50RegistryEffectiveDate: string;
  readonly sectorRegistryVersion: string;
  readonly sectorRegistryEffectiveDate: string;
  readonly weightRegistryVersion: string;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly latencyMs: number;
  readonly partialData: boolean;
  readonly lastError: string | null;
  readonly gti: {
    readonly inputReadiness: number;
    readonly pcrReadiness: boolean;
    readonly vixReadiness: boolean;
    readonly sectorReadiness: number;
    readonly conflictCodes: readonly string[];
    readonly confidenceBreakdown: unknown;
    readonly finalResearchState: string;
  };
}

export async function buildMarketBreadthDiagnostics(): Promise<MarketBreadthDiagnosticsReport> {
  const t0 = Date.now();
  const bundle = buildMockBreadthBundle({ scenario: "MIXED" });
  const vix = evaluateVixRegime({
    currentVix: null,
    previousVix: null,
    provider: "N/A",
    timestamp: new Date().toISOString(),
  });
  const pcr = adaptPcrConfirmation({ reading: null });
  const gti = classifyGti({
    broad: bundle.broad,
    nifty50: bundle.nifty50,
    topWeighted: bundle.topWeighted,
    banking: bundle.banking,
    it: bundle.it,
    oilGas: bundle.oilGas,
    auto: bundle.auto,
    pcr,
    vix,
    runId: `gti-diag-${Date.now().toString(36)}`,
  });
  const b = bundle.broad;
  const sectors = [bundle.banking, bundle.it, bundle.oilGas, bundle.auto];
  const sectorReadiness = sectors.filter((s) => s.dataQuality !== "FAILED").length / sectors.length;
  return {
    generatedAt: new Date().toISOString(),
    provider: "MOCK_BREADTH",
    universeRequested: b.totalSymbols,
    universeReturned: b.totalSymbols - b.unavailable,
    coverage: b.constituentCoverage ?? 0,
    advances: b.advances,
    declines: b.declines,
    unchanged: b.unchanged,
    unavailable: b.unavailable,
    nifty50RegistryVersion: NIFTY50_REGISTRY_VERSION,
    nifty50RegistryEffectiveDate: NIFTY50_REGISTRY_EFFECTIVE_DATE,
    sectorRegistryVersion: SECTOR_REGISTRY_VERSION,
    sectorRegistryEffectiveDate: SECTOR_REGISTRY_EFFECTIVE_DATE,
    weightRegistryVersion: NIFTY50_REGISTRY_VERSION,
    freshness: b.freshness,
    latencyMs: Date.now() - t0,
    partialData: b.dataQuality === "PARTIAL",
    lastError: null,
    gti: {
      inputReadiness:
        [bundle.broad, bundle.nifty50, bundle.topWeighted, ...sectors].filter((s) => s.dataQuality !== "FAILED")
          .length / 7,
      pcrReadiness: pcr.available,
      vixReadiness: vix.regime !== "UNKNOWN",
      sectorReadiness,
      conflictCodes: gti.conflicts.map((c) => c.code),
      confidenceBreakdown: gti.confidenceBreakdown,
      finalResearchState: gti.state,
    },
  };
}
