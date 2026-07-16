// Instrument-master resolution for supported Upstox market-data symbols.
//
// This module ships a versioned, human-readable fallback map so the
// adapter is functional even before an on-demand instrument-master fetch
// is wired. Instrument keys are the officially documented Upstox
// `instrument_key` strings — they are NOT secrets.

import type { QuoteSymbol } from "../types";

export interface UpstoxInstrument {
  readonly instrumentKey: string;
  readonly exchange: string;
  readonly segment: string;
  readonly tradingSymbol: string;
  readonly name: string;
  readonly instrumentType: "INDEX" | "COMMODITY" | "CURRENCY" | "EQUITY" | "FNO";
  readonly lotSize: number | null;
  readonly tickSize: number | null;
  readonly expiry: string | null;
  readonly timezone: "Asia/Kolkata";
}

export const UPSTOX_INSTRUMENT_MASTER_VERSION = "fallback-2026-07-16";

// Instrument keys sourced from Upstox public instrument master.
// Only symbols with a known NSE/MCX listing are included. External assets
// like XAUUSD / BTC are intentionally omitted — see `resolveInstrument`.
const FALLBACK_MASTER: Readonly<Record<string, UpstoxInstrument>> = {
  NIFTY50: {
    instrumentKey: "NSE_INDEX|Nifty 50",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "NIFTY 50",
    name: "Nifty 50",
    instrumentType: "INDEX",
    lotSize: null,
    tickSize: null,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  BANKNIFTY: {
    instrumentKey: "NSE_INDEX|Nifty Bank",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "NIFTY BANK",
    name: "Nifty Bank",
    instrumentType: "INDEX",
    lotSize: null,
    tickSize: null,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  INDIA_VIX: {
    instrumentKey: "NSE_INDEX|India VIX",
    exchange: "NSE",
    segment: "INDEX",
    tradingSymbol: "INDIA VIX",
    name: "India VIX",
    instrumentType: "INDEX",
    lotSize: null,
    tickSize: null,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  GOLD: {
    instrumentKey: "MCX_FO|GOLD",
    exchange: "MCX",
    segment: "COM",
    tradingSymbol: "GOLD",
    name: "Gold Futures",
    instrumentType: "COMMODITY",
    lotSize: 100,
    tickSize: 1,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  SILVER: {
    instrumentKey: "MCX_FO|SILVER",
    exchange: "MCX",
    segment: "COM",
    tradingSymbol: "SILVER",
    name: "Silver Futures",
    instrumentType: "COMMODITY",
    lotSize: 30,
    tickSize: 1,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  CRUDEOIL: {
    instrumentKey: "MCX_FO|CRUDEOIL",
    exchange: "MCX",
    segment: "COM",
    tradingSymbol: "CRUDEOIL",
    name: "Crude Oil Futures",
    instrumentType: "COMMODITY",
    lotSize: 100,
    tickSize: 1,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  NATURAL_GAS: {
    instrumentKey: "MCX_FO|NATURALGAS",
    exchange: "MCX",
    segment: "COM",
    tradingSymbol: "NATURALGAS",
    name: "Natural Gas Futures",
    instrumentType: "COMMODITY",
    lotSize: 1250,
    tickSize: 0.1,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
  USDINR: {
    instrumentKey: "NSE_FO|USDINR",
    exchange: "NSE",
    segment: "CDS",
    tradingSymbol: "USDINR",
    name: "USD/INR",
    instrumentType: "CURRENCY",
    lotSize: 1000,
    tickSize: 0.0025,
    expiry: null,
    timezone: "Asia/Kolkata",
  },
};

export type UpstoxSupportedSymbol =
  | "NIFTY50"
  | "BANKNIFTY"
  | "INDIA_VIX"
  | "GOLD"
  | "SILVER"
  | "CRUDEOIL"
  | "NATURAL_GAS"
  | "USDINR";

export const UPSTOX_SUPPORTED_SYMBOLS: readonly UpstoxSupportedSymbol[] = [
  "NIFTY50",
  "BANKNIFTY",
  "INDIA_VIX",
  "GOLD",
  "SILVER",
  "CRUDEOIL",
  "NATURAL_GAS",
  "USDINR",
];

export function isUpstoxSupported(sym: string): sym is UpstoxSupportedSymbol {
  return (UPSTOX_SUPPORTED_SYMBOLS as readonly string[]).includes(sym);
}

export function resolveInstrument(
  sym: QuoteSymbol | string,
): UpstoxInstrument | null {
  if (typeof sym !== "string") return null;
  return FALLBACK_MASTER[sym] ?? null;
}

export function listInstruments(): readonly UpstoxInstrument[] {
  return Object.values(FALLBACK_MASTER);
}

/**
 * Optional network fetch of the official instrument master. This is a
 * deterministic pass-through for future wiring; today we return the
 * versioned fallback so consumers never receive an empty list.
 */
export interface InstrumentMasterCacheEntry {
  readonly version: string;
  readonly fetchedAt: string;
  readonly count: number;
}

export function instrumentMasterInfo(nowIso: string): InstrumentMasterCacheEntry {
  return {
    version: UPSTOX_INSTRUMENT_MASTER_VERSION,
    fetchedAt: nowIso,
    count: UPSTOX_SUPPORTED_SYMBOLS.length,
  };
}