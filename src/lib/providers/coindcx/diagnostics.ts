// Phase 3F — CoinDCX diagnostics report builder. Pure — no fetch.

import { COINDCX_ENDPOINTS } from "./endpoints";
import type { CoindcxDiagnostics, CoindcxMarket } from "./types";
import { discoverySummary } from "./market-discovery";

export interface CoindcxDiagnosticsInput {
  readonly markets: readonly CoindcxMarket[];
  readonly lastDiscoveryAt: string | null;
  readonly lastDiscoveryLatencyMs: number | null;
  readonly lastError: string | null;
  readonly nowIso: string;
}

export function buildCoindcxDiagnostics(i: CoindcxDiagnosticsInput): CoindcxDiagnostics {
  const summary = discoverySummary(i.markets);
  return {
    providerId: "COINDCX",
    tradingEnabled: false,
    executionGuardActive: true,
    discoveredMarkets: summary.discoveredMarkets,
    cryptoMajors: summary.cryptoMajors,
    tokenizedMetals: summary.tokenizedMetals,
    lastDiscoveryAt: i.lastDiscoveryAt,
    lastDiscoveryLatencyMs: i.lastDiscoveryLatencyMs,
    lastError: i.lastError,
    endpointsAllowlisted: Object.values(COINDCX_ENDPOINTS),
    generatedAt: i.nowIso,
  };
}
