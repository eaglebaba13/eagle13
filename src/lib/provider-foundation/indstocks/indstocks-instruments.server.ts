// INDstocks instrument master resolution.
// Tokens use REST format: SEGMENT_TOKEN (e.g. NSE_3045).
// NOT WebSocket format (SEGMENT:TOKEN).

import type { QuoteSymbol } from "../types";

export interface IndstocksInstrument {
  readonly scripCode: string; // REST format: SEGMENT_TOKEN (e.g. NSE_26000)
  readonly webSocketToken?: string; // WebSocket format: SEGMENT:TOKEN (e.g. NIDX:NIFTY_50) — future use only
  readonly exchange: string;
  readonly segment: string;
  readonly tradingSymbol: string;
  readonly name: string;
  readonly instrumentType: "INDEX" | "EQUITY" | "FNO";
  readonly timezone: "Asia/Kolkata";
}

export const INDSTOCKS_INSTRUMENT_MASTER_VERSION = "fallback-2026-09-06";

// INDstocks scrip codes for active markets.
// Source: INDstocks /market/instruments endpoint (equity + index sources).
// Only NIFTY50, BANKNIFTY, INDIA_VIX are active in Phase 2.
const FALLBACK_MASTER: Readonly<Record<string, IndstocksInstrument>> = {
  NIFTY50: {
    scripCode: "NSE_26000",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "NIFTY 50",
    name: "Nifty 50",
    instrumentType: "INDEX",
    timezone: "Asia/Kolkata",
  },
  BANKNIFTY: {
    scripCode: "NSE_26009",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "NIFTY BANK",
    name: "Nifty Bank",
    instrumentType: "INDEX",
    timezone: "Asia/Kolkata",
  },
  INDIA_VIX: {
    scripCode: "NSE_26017",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "INDIA VIX",
    name: "India VIX",
    instrumentType: "INDEX",
    timezone: "Asia/Kolkata",
  },
};

export type IndstocksSupportedSymbol = "NIFTY50" | "BANKNIFTY" | "INDIA_VIX";

export const INDSTOCKS_SUPPORTED_SYMBOLS: readonly IndstocksSupportedSymbol[] = [
  "NIFTY50",
  "BANKNIFTY",
  "INDIA_VIX",
];

export function isIndstocksSupported(sym: string): sym is IndstocksSupportedSymbol {
  return (INDSTOCKS_SUPPORTED_SYMBOLS as readonly string[]).includes(sym);
}

export function resolveIndstocksInstrument(sym: QuoteSymbol | string): IndstocksInstrument | null {
  if (typeof sym !== "string") return null;
  return FALLBACK_MASTER[sym] ?? null;
}

export function listIndstocksInstruments(): readonly IndstocksInstrument[] {
  return Object.values(FALLBACK_MASTER);
}

export interface IndstocksInstrumentMasterCacheEntry {
  readonly version: string;
  readonly fetchedAt: string;
  readonly count: number;
}

export function indstocksInstrumentMasterInfo(nowIso: string): IndstocksInstrumentMasterCacheEntry {
  return {
    version: INDSTOCKS_INSTRUMENT_MASTER_VERSION,
    fetchedAt: nowIso,
    count: INDSTOCKS_SUPPORTED_SYMBOLS.length,
  };
}
