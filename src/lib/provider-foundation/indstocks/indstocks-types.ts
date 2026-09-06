// INDstocks provider types and constants.
// Client-safe — no secrets, no runtime env access.

import type { Timeframe } from "../types";

export const INDSTOCKS_ADAPTER_ID = "INDSTOCKS_V1";
export const INDSTOCKS_ADAPTER_VERSION = "v1.0.0";
export const INDSTOCKS_CACHE_NAMESPACE = "indstocks";
export const INDSTOCKS_BASE_URL = "https://api.indstocks.com";

export type IndstocksErrorCode =
  | "INDSTOCKS_AUTH_REQUIRED"
  | "INDSTOCKS_FORBIDDEN"
  | "INDSTOCKS_RATE_LIMITED"
  | "INDSTOCKS_TIMEOUT"
  | "INDSTOCKS_SCHEMA_ERROR"
  | "INDSTOCKS_DATA_UNAVAILABLE"
  | "INDSTOCKS_UNSUPPORTED_RANGE"
  | "INDSTOCKS_UNSUPPORTED_TIMEFRAME"
  | "INDSTOCKS_NETWORK"
  | "INDSTOCKS_UNKNOWN";

export interface IndstocksError {
  readonly code: IndstocksErrorCode;
  readonly message: string;
  readonly retryAfterMs?: number;
  readonly httpStatus?: number;
}

export interface IndstocksInterval {
  readonly label: string;
  readonly maxWindowDays: number;
}

export const TIMEFRAME_TO_INDSTOCKS: Readonly<Record<Timeframe, IndstocksInterval>> = {
  "1m": { label: "1minute", maxWindowDays: 7 },
  "3m": { label: "3minute", maxWindowDays: 7 },
  "5m": { label: "5minute", maxWindowDays: 7 },
  "15m": { label: "15minute", maxWindowDays: 7 },
  "1h": { label: "60minute", maxWindowDays: 15 },
  "1d": { label: "1day", maxWindowDays: 365 },
};

export interface IndstocksCandleRaw {
  readonly ts: number; // Unix epoch SECONDS
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
}

export interface IndstocksHistoricalResponse {
  readonly success?: boolean;
  readonly data?: {
    readonly candles?: readonly IndstocksCandleRaw[];
  };
}

export interface IndstocksQuoteResponse {
  readonly success?: boolean;
  readonly data?: Record<
    string,
    {
      readonly last_price?: number;
      readonly ohlc?: {
        readonly open?: number;
        readonly high?: number;
        readonly low?: number;
        readonly close?: number;
      };
      readonly volume?: number;
      readonly prev_close?: number;
    }
  >;
}
