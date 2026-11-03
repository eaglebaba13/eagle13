import { IndstocksWsAdapter } from "./provider-foundation/indstocks/indstocks-ws-adapter.server";
import type {
  MarketTick,
  WsConnectionSnapshot,
} from "./provider-foundation/indstocks/indstocks-ws-types";
import type { QuoteSymbol } from "./provider-foundation/types";
export interface LiveMarketStreamProvider {
  readonly id: string;
  connect(): void;
  close(): void;
  subscribe(symbol: QuoteSymbol): boolean;
  unsubscribe(symbol: QuoteSymbol): boolean;
  onTick(listener: (tick: MarketTick) => void): () => void;
  connectionSnapshot(): WsConnectionSnapshot;
  readonly isConnected: boolean;
}
// Explicit production selection, never a provider fallback chain.
export const PRODUCTION_LIVE_PROVIDER = "INDSTOCKS" as const;
export function createLiveMarketProvider(
  provider: string = PRODUCTION_LIVE_PROVIDER,
): LiveMarketStreamProvider {
  if (provider !== "INDSTOCKS") throw new Error("UNVERIFIED_LIVE_PROVIDER");
  return new IndstocksWsAdapter();
}
