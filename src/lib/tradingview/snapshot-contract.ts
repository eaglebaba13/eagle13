// Phase 3F.2C — Client-safe types + pure snapshot builder for the
// TradingView Gold/Silver ratio collector adapter. No `process.env`, no
// server-only imports.

export type CollectorSignal = "BUY_GOLD" | "BUY_SILVER" | "NEUTRAL" | "UNAVAILABLE";
export type CollectorFreshness = "LIVE" | "STALE" | "UNAVAILABLE";

export const COLLECTOR_FORMULA_VERSION = "GS_RATIO_50_80_V1";
export const COLLECTOR_STALE_AFTER_MS = 120_000;
export const COLLECTOR_UNAVAILABLE_AFTER_MS = 600_000;

export interface CollectorSnapshot {
  readonly symbol: "TVC:GOLDSILVER";
  readonly ratio: number | null;
  readonly signal: CollectorSignal;
  readonly source: "TRADINGVIEW_UNOFFICIAL";
  readonly marketTimestamp: number | null;
  readonly receivedAt: string | null;
  readonly ageMs: number | null;
  readonly freshness: CollectorFreshness;
  readonly connectionStatus: string;
  readonly formulaVersion: string;
  readonly reason: string | null;
}

export function classifyCollectorSignal(ratio: number | null): CollectorSignal {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    return "UNAVAILABLE";
  }
  if (ratio < 50) return "BUY_GOLD";
  if (ratio > 80) return "BUY_SILVER";
  return "NEUTRAL";
}

export function computeCollectorFreshness(ageMs: number | null): CollectorFreshness {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "UNAVAILABLE";
  if (ageMs > COLLECTOR_UNAVAILABLE_AFTER_MS) return "UNAVAILABLE";
  if (ageMs > COLLECTOR_STALE_AFTER_MS) return "STALE";
  return "LIVE";
}

interface BuildInput {
  readonly symbol: "TVC:GOLDSILVER";
  readonly ratio: number | null;
  readonly marketTimestamp: number | null;
  readonly receivedAtMs: number | null;
  readonly now: number;
  readonly connectionStatus: string;
  readonly remoteFreshness?: CollectorFreshness;
  readonly remoteSignal?: CollectorSignal;
  readonly reason?: string | null;
}

export function buildSnapshot(input: BuildInput): CollectorSnapshot {
  const ratioValid =
    typeof input.ratio === "number" && Number.isFinite(input.ratio) && input.ratio > 0;
  const ageMs =
    input.receivedAtMs != null ? Math.max(0, input.now - input.receivedAtMs) : null;

  // Trust remote freshness when supplied AND compatible; recompute otherwise.
  const localFreshness = computeCollectorFreshness(ageMs);
  const freshness = input.remoteFreshness ?? localFreshness;

  // Never preserve an actionable signal after data becomes non-live.
  const signal =
    ratioValid && freshness === "LIVE"
      ? (input.remoteSignal && input.remoteSignal !== "UNAVAILABLE"
          ? input.remoteSignal
          : classifyCollectorSignal(input.ratio))
      : "UNAVAILABLE";

  return {
    symbol: "TVC:GOLDSILVER",
    ratio: ratioValid && freshness !== "UNAVAILABLE" ? input.ratio : null,
    signal,
    source: "TRADINGVIEW_UNOFFICIAL",
    marketTimestamp: input.marketTimestamp ?? null,
    receivedAt: input.receivedAtMs != null ? new Date(input.receivedAtMs).toISOString() : null,
    ageMs,
    freshness,
    connectionStatus: input.connectionStatus,
    formulaVersion: COLLECTOR_FORMULA_VERSION,
    reason: input.reason ?? null,
  };
}