// Phase 21.4 · Stage 4C — CSV intraday provider. Wraps loadSmcCandles CSV.

import {
  loadSmcCandles,
  SmcDataRangeUnavailableError,
  SMC_INSTRUMENTS,
  SMC_TIMEFRAMES,
} from "../smc-data-source";
import {
  assertProviderSupports,
  buildDefaultMetadata,
  type IntradayFetchRequest,
  type IntradayHistoryProviderAdapter,
} from "./intraday-provider";

export const csvIntradayProvider: IntradayHistoryProviderAdapter = {
  id: "CSV",
  label: "Manual CSV Import",
  supportedInstruments: SMC_INSTRUMENTS,
  supportedTimeframes: SMC_TIMEFRAMES,
  maxRangeByTimeframe: { "5m": 3650, "15m": 3650 },
  timezone: "Asia/Kolkata",
  validateRequest(req) {
    assertProviderSupports(this, req);
    if (!req.csv || req.csv.trim().length === 0) {
      throw new SmcDataRangeUnavailableError(
        "DATA_RANGE_UNAVAILABLE — CSV provider requires a non-empty csv payload",
      );
    }
  },
  async loadCandles(req: IntradayFetchRequest) {
    this.validateRequest(req);
    return loadSmcCandles({
      instrument: req.instrument,
      timeframe: req.timeframe,
      from: req.from,
      to: req.to,
      timezone: req.timezone,
      source: { kind: "csv", csv: req.csv!, provider: "Zerodha" },
    });
  },
  buildSourceMetadata(req, result) {
    return buildDefaultMetadata(this, req, result);
  },
};

export const brokerCsvIntradayProvider: IntradayHistoryProviderAdapter = {
  ...csvIntradayProvider,
  id: "BROKER_CSV",
  label: "Broker CSV (Zerodha/Upstox)",
};