// Phase 24B · Data Freshness Governance
//
// Single source of truth for how "fresh" a piece of dashboard data is.
// Pure and deterministic — accepts an optional `now` for tests.

export const DATA_FRESHNESS_VERSION = "DATA_FRESHNESS_V1";

export type FreshnessStatus =
  | "LIVE"
  | "FRESH"
  | "DELAYED"
  | "STALE"
  | "UNAVAILABLE"
  | "ERROR";

export type MarketSessionStatus = "OPEN" | "CLOSED" | "PREOPEN" | "POSTCLOSE" | "UNKNOWN";
export type ProviderStatus = "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type DataQualityStatus = "OK" | "MISSING" | "INVALID" | "STALE";

export type FreshnessInput = {
  providerTimestamp?: string | number | null;
  receivedTimestamp?: string | number | null;
  /** Expected time between successive updates, ms. */
  expectedUpdateMs: number;
  marketSession?: MarketSessionStatus;
  providerStatus?: ProviderStatus;
  dataQuality?: DataQualityStatus;
  now?: number;
};

export type FreshnessResult = {
  status: FreshnessStatus;
  ageMs: number | null;
  threshold: {
    live: number;
    fresh: number;
    delayed: number;
  };
  reason: string;
  nextExpectedAt: number | null;
  version: string;
};

function parseTs(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function classifyFreshness(input: FreshnessInput): FreshnessResult {
  const now = input.now ?? Date.now();
  const expected = Math.max(1_000, input.expectedUpdateMs);
  const threshold = {
    live: expected,
    fresh: expected * 3,
    delayed: expected * 10,
  };

  if (input.dataQuality === "INVALID") {
    return build("ERROR", null, threshold, "Data quality reported INVALID.", null);
  }
  if (input.providerStatus === "DOWN") {
    return build("UNAVAILABLE", null, threshold, "Provider reported DOWN.", null);
  }

  const ts = parseTs(input.providerTimestamp) ?? parseTs(input.receivedTimestamp);
  if (ts == null) {
    return build("UNAVAILABLE", null, threshold, "No timestamp available.", null);
  }

  const age = Math.max(0, now - ts);
  const nextExpectedAt = ts + expected;

  let status: FreshnessStatus;
  let reason: string;
  if (input.dataQuality === "STALE") {
    status = "STALE";
    reason = "Data quality reported STALE.";
  } else if (age <= threshold.live) {
    status = "LIVE";
    reason = "Within expected update interval.";
  } else if (age <= threshold.fresh) {
    status = "FRESH";
    reason = "Slightly older than expected but still usable.";
  } else if (age <= threshold.delayed) {
    status = "DELAYED";
    reason = "Update overdue by several intervals.";
  } else {
    status = "STALE";
    reason = "Data is stale — beyond delayed threshold.";
  }

  if (input.providerStatus === "DEGRADED" && (status === "LIVE" || status === "FRESH")) {
    status = "DELAYED";
    reason = "Provider reported DEGRADED.";
  }

  if (input.marketSession === "CLOSED" && (status === "STALE" || status === "DELAYED")) {
    // Market closed → old ticks are expected; downgrade severity to DELAYED but
    // never claim LIVE.
    if (status === "STALE") {
      status = "DELAYED";
      reason = "Market closed — quotes are last-traded.";
    }
  }

  return build(status, age, threshold, reason, nextExpectedAt);
}

function build(
  status: FreshnessStatus,
  ageMs: number | null,
  threshold: FreshnessResult["threshold"],
  reason: string,
  nextExpectedAt: number | null,
): FreshnessResult {
  return { status, ageMs, threshold, reason, nextExpectedAt, version: DATA_FRESHNESS_VERSION };
}

export function isActionableFreshness(status: FreshnessStatus): boolean {
  return status === "LIVE" || status === "FRESH";
}

export function formatAge(ageMs: number | null): string {
  if (ageMs == null) return "—";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  return `${Math.round(ageMs / 3_600_000)}h`;
}