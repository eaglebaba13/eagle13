// Phase 31 (Decision wiring) · Capability states for the Decision engine.
//
// Pure enum + explainer. Replaces the generic "MISSING" label surfaced on
// the Decision matrix with an explicit failure state and a resolution hint.

export type ModuleCapability =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNSUPPORTED"
  | "AUTH_REQUIRED"
  | "NO_DATA"
  | "INVALID_RESPONSE"
  | "STALE"
  | "DATA_QUALITY_FAILURE"
  | "INVALID_EXPIRY"
  | "NO_STRIKES"
  | "PARTIAL_CHAIN";

export type CapabilityExplainer = {
  capability: ModuleCapability;
  module: string;      // e.g. "options" | "pcr"
  stage: string;       // pipeline stage where it failed / passed
  provider: string;    // provider id
  reason: string;      // short human-readable explanation
  suggestion: string;  // recovery suggestion
};

const REASONS: Record<ModuleCapability, { reason: string; suggestion: string }> = {
  SUPPORTED: {
    reason: "Live snapshot available and inside freshness threshold.",
    suggestion: "No action required.",
  },
  PARTIAL: {
    reason: "Snapshot returned but data quality is PARTIAL (missing legs or thin ATM coverage).",
    suggestion: "Retry during peak session; verify provider expiry and strike coverage.",
  },
  UNSUPPORTED: {
    reason: "Instrument is not enabled on the configured provider.",
    suggestion: "Route to a supported instrument (NIFTY / BANKNIFTY) or extend the provider registry.",
  },
  AUTH_REQUIRED: {
    reason: "Provider rejected the request with 401/403.",
    suggestion: "Refresh the Upstox access token secret and redeploy.",
  },
  NO_DATA: {
    reason: "Provider returned an empty payload.",
    suggestion: "Retry after a short delay; check provider status page.",
  },
  INVALID_RESPONSE: {
    reason: "Provider payload failed schema validation.",
    suggestion: "Inspect provider drift; extend the schema with `.passthrough()` if a benign field appeared.",
  },
  STALE: {
    reason: "Snapshot age exceeds the freshness threshold.",
    suggestion: "Verify network / provider latency; consider a lower cache TTL.",
  },
  DATA_QUALITY_FAILURE: {
    reason: "Snapshot legs present but many fields are null.",
    suggestion: "Contact the provider; likely a temporary upstream degradation.",
  },
  INVALID_EXPIRY: {
    reason: "Requested expiry is not in the provider's expiry list.",
    suggestion: "Refresh available expiries and re-select the nearest weekly.",
  },
  NO_STRIKES: {
    reason: "Provider returned an expiry with no strikes.",
    suggestion: "Try the next weekly expiry.",
  },
  PARTIAL_CHAIN: {
    reason: "ATM coverage below policy threshold.",
    suggestion: "Wait for full chain publication; retry near market open.",
  },
};

export function explainCapability(
  capability: ModuleCapability,
  meta: { module: string; stage: string; provider: string },
): CapabilityExplainer {
  const r = REASONS[capability];
  return { capability, ...meta, reason: r.reason, suggestion: r.suggestion };
}

/** True when the module is usable by downstream formulas. */
export function isCapabilityLive(cap: ModuleCapability): boolean {
  return cap === "SUPPORTED" || cap === "PARTIAL";
}