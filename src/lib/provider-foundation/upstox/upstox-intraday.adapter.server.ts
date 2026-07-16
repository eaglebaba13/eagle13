// Current-day intraday candle adapter. Thin wrapper around the shared
// UpstoxHistoricalAdapter so tests and callers can import it separately.

import type { ProviderResult, HistoricalSeries, QuoteSymbol, Timeframe } from "../types";
import { UpstoxHistoricalAdapter, type UpstoxAdapterOptions } from "./upstox-historical.adapter.server";

export class UpstoxIntradayAdapter {
  private readonly impl: UpstoxHistoricalAdapter;
  constructor(opts: UpstoxAdapterOptions = {}) {
    this.impl = new UpstoxHistoricalAdapter(opts);
  }
  fetch(symbol: QuoteSymbol | string, tf: Timeframe, nowIso: string): Promise<ProviderResult<HistoricalSeries>> {
    return this.impl.fetchIntraday(symbol, tf, nowIso);
  }
}