// Phase 26 · Stage 5 — Option Chain data models.
//
// Immutable, provider-neutral types. No `any`. Missing values are
// explicit `null`. Consumed by every downstream option module
// (Combined PCR, Max Pain, Sentiment, OI Build-up, etc.).

export type OptionUnderlying = "NIFTY" | "BANKNIFTY";

/** NIFTY / BANKNIFTY are the only ACTIVE option-chain markets this stage. */
export const SUPPORTED_OPTION_UNDERLYINGS = ["NIFTY", "BANKNIFTY"] as const;

/** COMING LATER — surfaced by the registry but not fetched. */
export const COMING_LATER_OPTION_UNDERLYINGS = [
  "SENSEX",
  "FINNIFTY",
  "MIDCPNIFTY",
  "MCX",
  "CRYPTO",
] as const;

export type MarketSession = "PRE_OPEN" | "OPEN" | "CLOSED" | "UNKNOWN";

export type ProviderDataQuality = "OK" | "PARTIAL" | "STALE" | "FAILED";

export interface OptionGreeks {
  readonly delta: number | null;
  readonly gamma: number | null;
  readonly theta: number | null;
  readonly vega: number | null;
  readonly rho: number | null;
}

export interface OptionLeg {
  readonly oi: number | null;
  readonly changeOi: number | null;
  readonly volume: number | null;
  readonly iv: number | null;
  readonly ltp: number | null;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly greeks: OptionGreeks | null;
}

export interface OptionChainStrike {
  readonly strike: number;
  readonly call: OptionLeg;
  readonly put: OptionLeg;
}

export interface OptionChainSnapshot {
  readonly instrument: OptionUnderlying;
  readonly spotPrice: number | null;
  readonly timestamp: string;                // ISO
  readonly provider: string;                 // e.g. "UPSTOX", "MOCK"
  readonly expiry: string;                   // ISO date (yyyy-mm-dd)
  readonly availableExpiries: readonly string[];
  readonly marketSession: MarketSession;
  readonly dataQuality: ProviderDataQuality;
  readonly strikes: readonly OptionChainStrike[];
}

export const EMPTY_LEG: OptionLeg = {
  oi: null,
  changeOi: null,
  volume: null,
  iv: null,
  ltp: null,
  bid: null,
  ask: null,
  greeks: null,
};

export function makeStrike(strike: number, call?: Partial<OptionLeg>, put?: Partial<OptionLeg>): OptionChainStrike {
  return {
    strike,
    call: { ...EMPTY_LEG, ...(call ?? {}) },
    put: { ...EMPTY_LEG, ...(put ?? {}) },
  };
}

/** Explicit numeric guard — rejects NaN/Infinity/null. */
export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}