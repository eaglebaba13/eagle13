// Public entry for Upstox provider integration. Server-only surface is
// intentionally NOT re-exported from the top-level provider-foundation
// `index.ts` — consumers must import from
// `@/lib/provider-foundation/upstox` explicitly.

export {
  UpstoxHistoricalAdapter,
  buildUpstoxProviderAdapter,
  upstoxHistoricalCacheKey,
  type UpstoxAdapterOptions,
  type FetchHistoricalRangeInput,
} from "./upstox-historical.adapter.server";
export { UpstoxIntradayAdapter } from "./upstox-intraday.adapter.server";
export {
  UpstoxHttpClient,
  type UpstoxHttpConfig,
  type UpstoxHttpResult,
  redactUpstoxMessage,
} from "./upstox-http.server";
export {
  evaluateUpstoxTokenPolicy,
  redactedTokenStatus,
  type UpstoxTokenStatus,
  type UpstoxTokenSource,
  type UpstoxTokenExpiryStatus,
  type TokenPolicyEnv,
} from "./upstox-token-policy.server";
export {
  UPSTOX_SUPPORTED_SYMBOLS,
  UPSTOX_INSTRUMENT_MASTER_VERSION,
  isUpstoxSupported,
  listInstruments,
  resolveInstrument,
  instrumentMasterInfo,
  type UpstoxInstrument,
  type UpstoxSupportedSymbol,
  type InstrumentMasterCacheEntry,
} from "./upstox-instruments.server";
export {
  planRange,
  policyFor as upstoxRangePolicyFor,
  type RangePolicy,
  type RangeChunk,
  type RangeValidation,
} from "./upstox-range-policy";
export {
  normalizeCandles,
  mergeCandleChunks,
  computeDataQuality,
  parseUpstoxCandles,
  tupleToRaw,
  type NormalizeResult,
  type DataQualityReport,
  type UpstoxCandleTuple,
  type RejectedRow,
} from "./upstox-normalizer";
export {
  UPSTOX_ADAPTER_ID,
  UPSTOX_ADAPTER_VERSION,
  UPSTOX_CACHE_NAMESPACE,
  TIMEFRAME_TO_UPSTOX,
  type UpstoxErrorCode,
  type UpstoxError,
  type UpstoxCandleRaw,
  type UpstoxUnit,
} from "./upstox-types";