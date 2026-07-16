// Phase 24E · Dashboard health summary.
//
// Pure aggregation over per-dependency freshness results. No fetching.

import type { DashboardFreshnessMap, DashboardFreshnessDependency } from "./dashboard-freshness-adapter";
import type { FreshnessStatus, ProviderStatus } from "./data-freshness";

export type DashboardHealthSummary = {
  overall: FreshnessStatus;
  staleCount: number;
  unavailableCount: number;
  delayedCount: number;
  errorCount: number;
  blockedSignals: number;
  lastSuccessAt: number | null;
  providerStatus: ProviderStatus;
  methodologies: string[];
};

const CRITICAL: DashboardFreshnessDependency[] = ["MARKET_DATA", "GOLD_SILVER_RATIO"];

export function summarizeDashboardHealth(input: {
  freshness: DashboardFreshnessMap;
  providerStatus?: ProviderStatus;
  lastSuccessAt?: number | null;
  blockedSignals?: number;
  methodologies?: string[];
}): DashboardHealthSummary {
  const values = Object.values(input.freshness);
  const staleCount = values.filter((v) => v.status === "STALE").length;
  const unavailableCount = values.filter((v) => v.status === "UNAVAILABLE").length;
  const delayedCount = values.filter((v) => v.status === "DELAYED").length;
  const errorCount = values.filter((v) => v.status === "ERROR").length;

  let overall: FreshnessStatus = "LIVE";
  const criticals = CRITICAL.map((k) => input.freshness[k]);
  if (criticals.some((c) => c.status === "ERROR")) overall = "ERROR";
  else if (criticals.some((c) => c.status === "UNAVAILABLE")) overall = "UNAVAILABLE";
  else if (criticals.some((c) => c.status === "STALE")) overall = "STALE";
  else if (criticals.some((c) => c.status === "DELAYED")) overall = "DELAYED";
  else if (criticals.some((c) => c.status === "FRESH")) overall = "FRESH";
  else overall = "LIVE";

  return {
    overall,
    staleCount,
    unavailableCount,
    delayedCount,
    errorCount,
    blockedSignals: input.blockedSignals ?? 0,
    lastSuccessAt: input.lastSuccessAt ?? null,
    providerStatus: input.providerStatus ?? "UNKNOWN",
    methodologies: input.methodologies ?? [],
  };
}