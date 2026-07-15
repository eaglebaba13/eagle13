// Phase 21.4 · Stage 4C — Provider dispatcher.

import type { SmcInstrument, SmcTimeframe } from "../smc-data-source";
import {
  brokerCsvIntradayProvider,
  csvIntradayProvider,
} from "./csv.provider";
import type {
  IntradayHistoryProviderAdapter,
  IntradayProviderId,
} from "./intraday-provider";
import { yahooIntradayProvider } from "./yahoo-intraday.provider";

const REGISTRY: Readonly<
  Record<IntradayProviderId, IntradayHistoryProviderAdapter>
> = {
  CSV: csvIntradayProvider,
  BROKER_CSV: brokerCsvIntradayProvider,
  YAHOO_INTRADAY: yahooIntradayProvider,
};

export function getIntradayProvider(
  id: IntradayProviderId,
): IntradayHistoryProviderAdapter {
  const adapter = REGISTRY[id];
  if (!adapter) throw new Error(`Unknown intraday provider: ${id}`);
  return adapter;
}

export function listIntradayProviders(
  instrument?: SmcInstrument,
  timeframe?: SmcTimeframe,
): readonly IntradayHistoryProviderAdapter[] {
  return Object.values(REGISTRY).filter((a) => {
    if (instrument && !a.supportedInstruments.includes(instrument)) return false;
    if (timeframe && !a.supportedTimeframes.includes(timeframe)) return false;
    return true;
  });
}

export {
  csvIntradayProvider,
  brokerCsvIntradayProvider,
  yahooIntradayProvider,
};
export type {
  IntradayFetchRequest,
  IntradayHistoryProviderAdapter,
  IntradayProviderId,
  IntradayProviderMetadata,
} from "./intraday-provider";