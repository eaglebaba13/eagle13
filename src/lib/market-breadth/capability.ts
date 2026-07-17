// Phase 2E — Canonical Market Breadth capability model.
//
// Deterministic mapping from live-input signals (India VIX quality,
// canonical Combined PCR, breadth bundle source, breadth data-quality)
// to a single capability envelope. Pure function, safe to import
// anywhere. No provider fetches, no formulas, no broker/order paths.

import type {
  GtiResearchReading,
  MarketBreadthSnapshot,
  PcrConfirmation,
  VixRegimeReading,
} from "./types";

export type MarketBreadthCapabilityStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "STALE"
  | "AUTH_REQUIRED"
  | "NO_DATA"
  | "DATA_QUALITY_FAILURE"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED";

export type MarketBreadthFailingStage =
  | "NONE"
  | "VIX"
  | "PCR"
  | "BREADTH"
  | "AGGREGATION";

export type MarketBreadthSourceKind = "LIVE" | "RESEARCH_DEMO" | "MIXED";

export interface MarketBreadthCapability {
  readonly status: MarketBreadthCapabilityStatus;
  readonly reason: string;
  readonly providerAlias: string;
  readonly failingStage: MarketBreadthFailingStage;
  readonly retryable: boolean;
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
  readonly latencyMs: number | null;
  readonly observedAt: string;
  readonly source: MarketBreadthSourceKind;
  readonly notes: readonly string[];
}

export interface MarketBreadthCapabilityInput {
  readonly nowIso: string;
  readonly vix: VixRegimeReading;
  readonly vixError?: string | null;
  readonly vixLatencyMs?: number | null;
  readonly pcr: PcrConfirmation;
  readonly pcrError?: string | null;
  readonly pcrLatencyMs?: number | null;
  readonly breadth: {
    readonly broad: MarketBreadthSnapshot | null;
    readonly nifty50: MarketBreadthSnapshot | null;
  };
  readonly breadthSource: MarketBreadthSourceKind;
  readonly providerAlias: string;
  readonly latencyMs?: number | null;
  readonly hardError?: string | null;
}

function worstBreadthQuality(
  ...snaps: readonly (MarketBreadthSnapshot | null)[]
): "OK" | "PARTIAL" | "STALE" | "FAILED" | "MISSING" {
  let worst: "OK" | "PARTIAL" | "STALE" | "FAILED" | "MISSING" = "MISSING";
  const order: Record<string, number> = { OK: 0, PARTIAL: 1, STALE: 2, FAILED: 3, MISSING: 4 };
  for (const s of snaps) {
    const q = s ? s.dataQuality : "MISSING";
    if (order[q] > order[worst]) worst = q as typeof worst;
  }
  return worst;
}

export function evaluateMarketBreadthCapability(
  input: MarketBreadthCapabilityInput,
): MarketBreadthCapability {
  const notes: string[] = [];
  const observedAt = input.nowIso;
  const providerAlias = input.providerAlias;

  if (input.hardError) {
    return {
      status: "PROVIDER_ERROR",
      reason: input.hardError.slice(0, 200),
      providerAlias,
      failingStage: "AGGREGATION",
      retryable: true,
      freshness: "UNKNOWN",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  const vixOk = input.vix.currentVix != null && Number.isFinite(input.vix.currentVix);
  const vixStale = vixOk && input.vix.freshness === "STALE";
  const pcrOk = input.pcr.available && input.pcr.dataQuality !== "FAILED" && input.pcr.dataQuality !== "UNAVAILABLE";
  const pcrStale = pcrOk && input.pcr.freshness === "STALE";
  const bq = worstBreadthQuality(input.breadth.broad, input.breadth.nifty50);

  if (!vixOk) notes.push("vix-missing");
  if (vixStale) notes.push("vix-stale");
  if (!pcrOk) notes.push(`pcr-${input.pcr.dataQuality.toLowerCase()}`);
  if (pcrStale) notes.push("pcr-stale");
  if (input.breadthSource === "RESEARCH_DEMO") notes.push("breadth-research-demo");
  if (bq !== "OK") notes.push(`breadth-${bq.toLowerCase()}`);

  const vixAuth = (input.vixError ?? "").toLowerCase().includes("auth");
  const pcrAuth = (input.pcrError ?? "").toLowerCase().includes("auth");
  if (vixAuth || pcrAuth) {
    return {
      status: "AUTH_REQUIRED",
      reason: "Authentication required for a live input",
      providerAlias,
      failingStage: vixAuth ? "VIX" : "PCR",
      retryable: false,
      freshness: "UNKNOWN",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  if (bq === "FAILED") {
    return {
      status: "DATA_QUALITY_FAILURE",
      reason: "Breadth data quality failed for all universes",
      providerAlias,
      failingStage: "BREADTH",
      retryable: true,
      freshness: "UNKNOWN",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  if (!vixOk && !pcrOk && bq === "MISSING") {
    return {
      status: "NO_DATA",
      reason: "No live inputs available",
      providerAlias,
      failingStage: "AGGREGATION",
      retryable: true,
      freshness: "UNKNOWN",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  const anyStale = vixStale || pcrStale || bq === "STALE";
  const partial =
    !vixOk || !pcrOk || bq === "PARTIAL" || input.breadthSource !== "LIVE";

  if (anyStale && !partial) {
    return {
      status: "STALE",
      reason: "One or more inputs are stale",
      providerAlias,
      failingStage: vixStale ? "VIX" : pcrStale ? "PCR" : "BREADTH",
      retryable: true,
      freshness: "STALE",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  if (partial) {
    return {
      status: "PARTIAL",
      reason:
        input.breadthSource !== "LIVE"
          ? "Breadth constituents are research-demo; VIX/PCR live where possible"
          : "Some inputs missing or degraded",
      providerAlias,
      failingStage: !vixOk ? "VIX" : !pcrOk ? "PCR" : "BREADTH",
      retryable: true,
      freshness: anyStale ? "STALE" : "FRESH",
      latencyMs: input.latencyMs ?? null,
      observedAt,
      source: input.breadthSource,
      notes,
    };
  }

  return {
    status: "SUPPORTED",
    reason: "All canonical inputs live and fresh",
    providerAlias,
    failingStage: "NONE",
    retryable: false,
    freshness: "FRESH",
    latencyMs: input.latencyMs ?? null,
    observedAt,
    source: input.breadthSource,
    notes,
  };
}

export function capabilityFromReading(
  reading: GtiResearchReading,
  providerAlias: string,
  source: MarketBreadthSourceKind,
  nowIso: string,
  latencyMs: number | null,
): MarketBreadthCapability {
  return evaluateMarketBreadthCapability({
    nowIso,
    vix: reading.vix,
    pcr: reading.pcr,
    breadth: { broad: reading.breadth.broad, nifty50: reading.breadth.nifty50 },
    breadthSource: source,
    providerAlias,
    latencyMs,
  });
}