// Client-safe types shared across the Upstox adapter surface.
// No secrets, no runtime env access.

import type { Timeframe } from "../types";

export const UPSTOX_ADAPTER_ID = "UPSTOX_HISTORICAL_V1";
export const UPSTOX_ADAPTER_VERSION = "v1.0.0";
export const UPSTOX_CACHE_NAMESPACE = "upstox";

export type UpstoxErrorCode =
  | "UPSTOX_AUTH_REQUIRED"
  | "UPSTOX_RATE_LIMITED"
  | "UPSTOX_TIMEOUT"
  | "UPSTOX_SCHEMA_ERROR"
  | "UPSTOX_DATA_UNAVAILABLE"
  | "UPSTOX_UNSUPPORTED_RANGE"
  | "UPSTOX_UNSUPPORTED_TIMEFRAME"
  | "UPSTOX_NETWORK"
  | "UPSTOX_UNKNOWN";

export interface UpstoxError {
  readonly code: UpstoxErrorCode;
  readonly message: string;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
}

export interface UpstoxUnit {
  readonly unit: "minutes" | "hours" | "days";
  readonly interval: number;
}

export const TIMEFRAME_TO_UPSTOX: Readonly<Record<Timeframe, UpstoxUnit>> = {
  "1m": { unit: "minutes", interval: 1 },
  "3m": { unit: "minutes", interval: 3 },
  "5m": { unit: "minutes", interval: 5 },
  "15m": { unit: "minutes", interval: 15 },
  "1h": { unit: "hours", interval: 1 },
  "1d": { unit: "days", interval: 1 },
};

export interface UpstoxCandleRaw {
  readonly time: string; // ISO
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly openInterest?: number;
}