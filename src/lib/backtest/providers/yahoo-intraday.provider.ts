// Phase 21.4 · Stage 4C — Yahoo intraday provider. Reserves the id;
// throws DATA_RANGE_UNAVAILABLE (no daily→intraday fabrication).

import {
  SmcDataRangeUnavailableError,
  SMC_INSTRUMENTS,
  SMC_TIMEFRAMES,
} from "../smc-data-source";
import {
  assertProviderSupports,
  type IntradayHistoryProviderAdapter,
} from "./intraday-provider";

export const yahooIntradayProvider: IntradayHistoryProviderAdapter = {
  id: "YAHOO_INTRADAY",
  label: "Yahoo Finance (intraday)",
  supportedInstruments: SMC_INSTRUMENTS,
  supportedTimeframes: SMC_TIMEFRAMES,
  maxRangeByTimeframe: { "5m": 60, "15m": 60 },
  timezone: "Asia/Kolkata",
  validateRequest(req) {
    assertProviderSupports(this, req);
  },
  async loadCandles(req) {
    this.validateRequest(req);
    throw new SmcDataRangeUnavailableError(
      `DATA_RANGE_UNAVAILABLE — Yahoo intraday provider not wired for ${req.instrument} ${req.timeframe}. Use CSV import.`,
    );
  },
  buildSourceMetadata(req, result) {
    return {
      providerId: this.id,
      providerLabel: this.label,
      requestedFrom: req.from,
      requestedTo: req.to,
      actualFrom: result.actualFrom,
      actualTo: result.actualTo,
      timeframe: req.timeframe,
      timezone: req.timezone,
      candleCount: result.candles.length,
      dataHash: result.dataHash,
    };
  },
};