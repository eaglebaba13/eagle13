// Phase 3F — Deterministic freshness classifier for CoinDCX (24×7 markets).

import type { MarketSourceStatus } from "./types";

export interface FreshnessPolicy {
  readonly liveMaxSec: number;
  readonly delayedMaxSec: number;
}

/** Crypto trades 24×7 — no market session gating. */
export const COINDCX_DEFAULT_FRESHNESS: FreshnessPolicy = {
  liveMaxSec: 30,
  delayedMaxSec: 300,
};

export function classifyCoindcxFreshness(
  ageSec: number,
  policy: FreshnessPolicy = COINDCX_DEFAULT_FRESHNESS,
): MarketSourceStatus {
  if (!Number.isFinite(ageSec) || ageSec < 0) return "UNAVAILABLE";
  if (ageSec <= policy.liveMaxSec) return "LIVE";
  if (ageSec <= policy.delayedMaxSec) return "DELAYED";
  return "STALE";
}
