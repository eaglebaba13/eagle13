// Phase 2I-B — Gann Gap Outlook capability state.
// Provider-neutral. Consumed by the runtime-readiness evidence adapter.

export type GannGapCapabilityStatus =
  | "SUPPORTED"
  | "PENDING"
  | "PARTIAL"
  | "STALE"
  | "NO_DATA"
  | "INVALID_SESSION"
  | "DATA_QUALITY_FAILURE"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED"
  | "DISABLED";

export interface GannGapCapability {
  readonly status: GannGapCapabilityStatus;
  readonly reason: string;
  readonly observedAt: string;
  readonly latencyMs: number | null;
  readonly providerAlias: string;
  readonly source: "LIVE" | "MIXED" | "RESEARCH_DEMO" | "UNAVAILABLE";
  readonly freshness: "FRESH" | "STALE" | "UNKNOWN";
}

export function gannGapDisabled(nowIso: string): GannGapCapability {
  return {
    status: "DISABLED",
    reason: "Feature flag gann.gap.outlook is disabled",
    observedAt: nowIso,
    latencyMs: null,
    providerAlias: "MARKET_DATA",
    source: "UNAVAILABLE",
    freshness: "UNKNOWN",
  };
}

export function gannGapNoData(nowIso: string, reason = "Reference price unavailable"): GannGapCapability {
  return {
    status: "NO_DATA",
    reason,
    observedAt: nowIso,
    latencyMs: null,
    providerAlias: "MARKET_DATA",
    source: "UNAVAILABLE",
    freshness: "UNKNOWN",
  };
}