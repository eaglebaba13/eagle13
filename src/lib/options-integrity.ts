// Phase 16.1 — Options data integrity, source-status model, tradability gate,
// freshness classification, ATM coverage check, spot divergence check, and
// export-filename helper. Pure, deterministic, client-safe. Additive to the
// existing options-analytics module; no production formula is touched.

export type SourceStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "DEMO";

export type OptionsIntegrityMeta = {
  sourceStatus: SourceStatus;
  provider: string;
  fetchedAt: string; // when this app captured the snapshot
  providerTimestamp: string | null; // upstream-reported timestamp when available
  receivedAt: string; // when the client received / rendered
  dataAgeSeconds: number;
  expiry: string | null;
  underlying: number | null;
  strikeCount: number;
  validStrikeCount: number;
  missingFieldCount: number;
  isTradable: boolean;
  lastLiveFetchAt: string | null;
  cacheStatus: "LIVE" | "LAST_KNOWN_GOOD" | "DEMO" | "NONE";
  spotDivergence: number | null;
};

/** Freshness thresholds (seconds). Configurable per-provider by extending. */
export const FRESHNESS_THRESHOLDS = {
  freshMaxSec: 60,
  delayedMaxSec: 180,
} as const;

export type Freshness = "FRESH" | "DELAYED" | "STALE";

export function classifyFreshness(
  ageSeconds: number,
  t: { freshMaxSec: number; delayedMaxSec: number } = FRESHNESS_THRESHOLDS,
): Freshness {
  if (ageSeconds <= t.freshMaxSec) return "FRESH";
  if (ageSeconds <= t.delayedMaxSec) return "DELAYED";
  return "STALE";
}

/* ------------------------- Tradability gate ------------------------- */

export type TradabilityInputs = {
  demo: boolean;
  sourceStatus: SourceStatus;
  underlying: number | null;
  expiry: string | null;
  expiryValid: boolean;
  strikesBelowAtm: number;
  strikesAboveAtm: number;
  hasCallOi: boolean;
  hasPutOi: boolean;
  providerTimestampValid: boolean;
  marketOpen: boolean;
  minAtmCoverage?: number;
};

export type TradabilityResult = {
  isTradable: boolean;
  sourceStatus: SourceStatus;
  blockingReasons: string[];
  warnings: string[];
};

export function evaluateOptionsTradability(inp: TradabilityInputs): TradabilityResult {
  const min = inp.minAtmCoverage ?? 5;
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (inp.demo || inp.sourceStatus === "DEMO") {
    blocking.push("Demo mode — synthetic data cannot generate live recommendations");
  }
  if (inp.sourceStatus === "UNAVAILABLE") blocking.push("Live option-chain data unavailable");
  if (inp.sourceStatus === "STALE") blocking.push("Provider data is stale");
  if (inp.sourceStatus === "PARTIAL") blocking.push("Option chain missing critical strikes or fields");
  if (inp.sourceStatus === "DELAYED") warnings.push("Provider data is delayed");

  if (inp.underlying == null || !Number.isFinite(inp.underlying) || inp.underlying <= 0) {
    blocking.push("Underlying spot unavailable");
  }
  if (!inp.expiry || !inp.expiryValid) blocking.push("Selected expiry is invalid or expired");
  if (!inp.providerTimestampValid) warnings.push("Provider timestamp missing or invalid");

  if (inp.strikesBelowAtm < min) {
    blocking.push(`Insufficient strike coverage below ATM (${inp.strikesBelowAtm}/${min})`);
  }
  if (inp.strikesAboveAtm < min) {
    blocking.push(`Insufficient strike coverage above ATM (${inp.strikesAboveAtm}/${min})`);
  }
  if (!inp.hasCallOi) blocking.push("Call OI unavailable");
  if (!inp.hasPutOi) blocking.push("Put OI unavailable");

  if (!inp.marketOpen) warnings.push("Market is closed — showing previous-session snapshot");

  return {
    isTradable: blocking.length === 0,
    sourceStatus: inp.sourceStatus,
    blockingReasons: blocking,
    warnings,
  };
}

/* ---------------------- ATM coverage & divergence ---------------------- */

export function atmCoverage(strikes: number[], atm: number): { below: number; above: number } {
  let below = 0;
  let above = 0;
  for (const s of strikes) {
    if (s < atm) below++;
    else if (s > atm) above++;
  }
  return { below, above };
}

export type SpotDivergence = {
  primary: number | null;
  secondary: number | null;
  divergence: number;
  divergencePct: number;
  severe: boolean;
};

/** Severe when |a-b|/a exceeds `severePct` (default 0.5%). */
export function computeSpotDivergence(
  primary: number | null,
  secondary: number | null,
  severePct = 0.5,
): SpotDivergence {
  if (primary == null || secondary == null || !Number.isFinite(primary) || primary <= 0) {
    return { primary, secondary, divergence: 0, divergencePct: 0, severe: false };
  }
  const d = Math.abs(primary - secondary);
  const p = (d / primary) * 100;
  return { primary, secondary, divergence: d, divergencePct: p, severe: p > severePct };
}

/* --------------------------- Export helpers --------------------------- */

export function exportFilename(
  base: string,
  symbol: string,
  expiry: string,
  mode: "LIVE" | "DEMO",
  ext: string,
  now: Date = new Date(),
): string {
  const date = now.toISOString().slice(0, 10);
  const safeExpiry = expiry || "no-expiry";
  return `${symbol}_${base}_${mode}_${safeExpiry}_${date}.${ext}`;
}

/* --------------------------- Expiry validation --------------------------- */

export function isExpiryValid(expiry: string | null, providerExpiries: string[], now: Date = new Date()): boolean {
  if (!expiry) return false;
  if (!providerExpiries.includes(expiry)) return false;
  const t = new Date(expiry).getTime();
  if (!Number.isFinite(t)) return false;
  // Same trading day still valid (end-of-day expiries); reject only past dates.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return t >= today.getTime();
}

/* -------------------- Focus / alert confirmation guard -------------------- */

/**
 * Alert confirmation requires two consecutive snapshots from the same
 * symbol / expiry / provider, both LIVE, and monotonically-increasing
 * timestamps. Returns whether the current confirmation state should be
 * accepted or reset.
 */
export type AlertContext = {
  symbol: string;
  expiry: string;
  provider: string;
  sourceStatus: SourceStatus;
  snapshotTs: number;
  marketOpen: boolean;
};

export function shouldAcceptAlert(prev: AlertContext | null, curr: AlertContext): boolean {
  if (!prev) return false;
  if (!curr.marketOpen) return false;
  if (curr.sourceStatus !== "LIVE") return false;
  if (prev.sourceStatus !== "LIVE") return false;
  if (prev.symbol !== curr.symbol) return false;
  if (prev.expiry !== curr.expiry) return false;
  if (prev.provider !== curr.provider) return false;
  if (!(curr.snapshotTs > prev.snapshotTs)) return false;
  return true;
}

/* --------------------- Recommendation safety mapping --------------------- */

export type SafeRecommendationAction =
  | "BUY_CE"
  | "BUY_PE"
  | "WAIT"
  | "DATA_INCOMPLETE"
  | "MARKET_CLOSED";

/**
 * Map a raw scored action into the production-safe action set based on the
 * tradability gate. Never allows BUY_CE / BUY_PE when not tradable.
 */
export function safeRecommendationAction(
  rawAction: "BUY_CE" | "BUY_PE" | "WAIT",
  tradability: TradabilityResult,
  marketOpen: boolean,
): SafeRecommendationAction {
  if (!marketOpen) return "MARKET_CLOSED";
  if (!tradability.isTradable) {
    if (
      tradability.sourceStatus === "UNAVAILABLE" ||
      tradability.sourceStatus === "PARTIAL" ||
      tradability.sourceStatus === "STALE" ||
      tradability.sourceStatus === "DEMO"
    ) {
      return "DATA_INCOMPLETE";
    }
    return "WAIT";
  }
  return rawAction;
}