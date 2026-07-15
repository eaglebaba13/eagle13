// Phase 21.4 · Stage 4C — Intraday history provider adapter contract.
// Pure, client-safe. Provider adapters MUST NOT synthesise intraday bars
// from daily data. Any unsupported (instrument, timeframe, range) tuple
// throws DATA_RANGE_UNAVAILABLE via SmcDataRangeUnavailableError.

import type {
  LoadSmcCandlesResult,
  SmcInstrument,
  SmcTimeframe,
} from "../smc-data-source";

export type IntradayProviderId =
  | "CSV"
  | "BROKER_CSV"
  | "YAHOO_INTRADAY";

export type IntradayFetchRequest = {
  instrument: SmcInstrument;
  timeframe: SmcTimeframe;
  from: string;
  to: string;
  timezone: "Asia/Kolkata" | "UTC";
  /** Only used by CSV-based adapters. */
  csv?: string;
};

export type IntradayProviderMetadata = {
  providerId: IntradayProviderId;
  providerLabel: string;
  requestedFrom: string;
  requestedTo: string;
  actualFrom: string | null;
  actualTo: string | null;
  timeframe: SmcTimeframe;
  timezone: "Asia/Kolkata" | "UTC";
  candleCount: number;
  dataHash: string;
};

export type IntradayHistoryProviderAdapter = {
  id: IntradayProviderId;
  label: string;
  supportedInstruments: readonly SmcInstrument[];
  supportedTimeframes: readonly SmcTimeframe[];
  /** Maximum allowed range in days per timeframe. */
  maxRangeByTimeframe: Readonly<Record<SmcTimeframe, number>>;
  timezone: "Asia/Kolkata" | "UTC";
  loadCandles(req: IntradayFetchRequest): Promise<LoadSmcCandlesResult>;
  validateRequest(req: IntradayFetchRequest): void;
  buildSourceMetadata(
    req: IntradayFetchRequest,
    result: LoadSmcCandlesResult,
  ): IntradayProviderMetadata;
};

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return -1;
  return Math.round((b - a) / 86400_000) + 1;
}

/** Shared request validation used by every adapter. */
export function assertProviderSupports(
  adapter: IntradayHistoryProviderAdapter,
  req: IntradayFetchRequest,
): void {
  if (!adapter.supportedInstruments.includes(req.instrument)) {
    throw new Error(
      `DATA_RANGE_UNAVAILABLE — provider ${adapter.id} does not support instrument ${req.instrument}`,
    );
  }
  if (!adapter.supportedTimeframes.includes(req.timeframe)) {
    throw new Error(
      `DATA_RANGE_UNAVAILABLE — provider ${adapter.id} does not support timeframe ${req.timeframe}`,
    );
  }
  const span = daysBetween(req.from, req.to);
  if (span < 0) {
    throw new Error(
      `DATA_RANGE_UNAVAILABLE — invalid range ${req.from} → ${req.to}`,
    );
  }
  const max = adapter.maxRangeByTimeframe[req.timeframe];
  if (span > max) {
    throw new Error(
      `DATA_RANGE_UNAVAILABLE — range ${span}d exceeds provider ${adapter.id} maximum ${max}d for ${req.timeframe}`,
    );
  }
}

export function buildDefaultMetadata(
  adapter: IntradayHistoryProviderAdapter,
  req: IntradayFetchRequest,
  result: LoadSmcCandlesResult,
): IntradayProviderMetadata {
  return {
    providerId: adapter.id,
    providerLabel: adapter.label,
    requestedFrom: req.from,
    requestedTo: req.to,
    actualFrom: result.actualFrom,
    actualTo: result.actualTo,
    timeframe: req.timeframe,
    timezone: req.timezone,
    candleCount: result.candles.length,
    dataHash: result.dataHash,
  };
}