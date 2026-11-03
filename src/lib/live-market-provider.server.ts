import { IndstocksWsAdapter } from "./provider-foundation/indstocks/indstocks-ws-adapter.server";
import { UpstoxWsAdapter } from "./provider-foundation/upstox/upstox-ws-adapter.server";
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

export type LiveMarketProviderType = "INDSTOCKS" | "UPSTOX";

export const PRODUCTION_LIVE_PROVIDER = "INDSTOCKS" as const;

export function getActiveLiveMarketProvider(): LiveMarketProviderType {
  const env = process.env.LIVE_MARKET_PROVIDER?.trim().toUpperCase();
  if (env === "UPSTOX") return "UPSTOX";
  return "INDSTOCKS";
}

/**
 * Explicit provider selection via environment variable or explicit parameter.
 * Default remains INDSTOCKS unless LIVE_MARKET_PROVIDER is explicitly configured as UPSTOX.
 * Never an automatic provider fallback chain.
 */
export function createLiveMarketProvider(provider?: string): LiveMarketStreamProvider {
  const enabledEnv = process.env.LIVE_MARKET_PROVIDER?.trim().toUpperCase();

  // If called without arguments, inspect the active environment provider (default: INDSTOCKS)
  if (provider === undefined) {
    if (enabledEnv === "UPSTOX") {
      return new UpstoxWsAdapter();
    }
    return new IndstocksWsAdapter();
  }

  // If called with explicit provider argument
  const target = provider.trim().toUpperCase();
  if (target === "INDSTOCKS") {
    return new IndstocksWsAdapter();
  }
  if (target === "UPSTOX" && enabledEnv === "UPSTOX") {
    return new UpstoxWsAdapter();
  }

  // Any unverified or unactivated provider throws
  throw new Error("UNVERIFIED_LIVE_PROVIDER");
}
