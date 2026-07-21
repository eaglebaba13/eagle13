// Phase 44A — Normalized instrument registry for the Multi-Asset Brief.
//
// This registry lists ONLY the canonical instruments; CoinDCX market symbols
// are resolved dynamically at runtime from the existing provider discovery
// (see `providers/coindcx/market-discovery.ts` — never hard-coded here).

export type BriefAssetClass =
  | "INDEX"
  | "METAL_SPOT"
  | "METAL_TOKENIZED"
  | "CRYPTO";

export type BriefSession = "NSE_INDEX" | "CRYPTO_24X7";

export interface BriefInstrument {
  /** Canonical, stable identifier used across the brief. */
  readonly id:
    | "NIFTY"
    | "BANKNIFTY"
    | "GOLD"
    | "SILVER"
    | "XAUUSD"
    | "XAGUSD"
    | "BTC"
    | "ETH";
  readonly displayName: string;
  readonly assetClass: BriefAssetClass;
  readonly session: BriefSession;
  /**
   * Preferred provider for prices/candles. `coindcx` is a *resolver hint*:
   * the actual CoinDCX pair is discovered at runtime, never assumed.
   */
  readonly provider: "upstox" | "coindcx";
  /**
   * Hints for the runtime symbol resolver. `bases` are candidate
   * `base_currency_short_name` values on CoinDCX; `quotes` are candidate
   * quote currencies in preference order. The resolver picks the first
   * (base, quote) combination that actually exists in the discovered market
   * list — otherwise it returns `null` and the instrument is marked
   * UNAVAILABLE in the brief.
   */
  readonly coindcxHint?: {
    readonly bases: readonly string[];
    readonly quotes: readonly string[];
  };
}

export const BRIEF_INSTRUMENTS: readonly BriefInstrument[] = [
  { id: "NIFTY",     displayName: "NIFTY 50",       assetClass: "INDEX",             session: "NSE_INDEX",  provider: "upstox" },
  { id: "BANKNIFTY", displayName: "BANKNIFTY",      assetClass: "INDEX",             session: "NSE_INDEX",  provider: "upstox" },
  { id: "GOLD",      displayName: "Gold (spot)",    assetClass: "METAL_SPOT",        session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["PAXG", "XAUT"], quotes: ["USDT", "USD"] } },
  { id: "SILVER",    displayName: "Silver (spot)",  assetClass: "METAL_SPOT",        session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["KAG", "XAG"],   quotes: ["USDT", "USD"] } },
  { id: "XAUUSD",    displayName: "XAU/USD",        assetClass: "METAL_TOKENIZED",   session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["PAXG", "XAUT"], quotes: ["USDT", "USD"] } },
  { id: "XAGUSD",    displayName: "XAG/USD",        assetClass: "METAL_TOKENIZED",   session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["KAG", "XAG"],   quotes: ["USDT", "USD"] } },
  { id: "BTC",       displayName: "Bitcoin",        assetClass: "CRYPTO",            session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["BTC"],          quotes: ["USDT", "INR", "USD"] } },
  { id: "ETH",       displayName: "Ethereum",       assetClass: "CRYPTO",            session: "CRYPTO_24X7",provider: "coindcx",
    coindcxHint: { bases: ["ETH"],          quotes: ["USDT", "INR", "USD"] } },
] as const;

export function getInstrument(id: BriefInstrument["id"]): BriefInstrument {
  const found = BRIEF_INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown brief instrument: ${id}`);
  return found;
}

/**
 * Resolve the canonical CoinDCX pair for an instrument using an already
 * discovered market list. Returns `null` when no candidate (base, quote)
 * combination exists — the instrument must then be marked UNAVAILABLE.
 *
 * Signature is intentionally minimal (`{ base, quote, pair }`) so callers
 * can pass either the raw provider payload or a projected list.
 */
export function resolveCoindcxPair(
  instrument: BriefInstrument,
  markets: readonly { base: string; quote: string; pair: string }[],
): { base: string; quote: string; pair: string } | null {
  const hint = instrument.coindcxHint;
  if (!hint) return null;
  for (const base of hint.bases) {
    for (const quote of hint.quotes) {
      const hit = markets.find(
        (m) => m.base.toUpperCase() === base && m.quote.toUpperCase() === quote,
      );
      if (hit) return { base: hit.base, quote: hit.quote, pair: hit.pair };
    }
  }
  return null;
}