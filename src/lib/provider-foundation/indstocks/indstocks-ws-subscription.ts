// INDstocks WebSocket subscription manager.
// Provider-neutral subscription boundary.
// Prevents duplicates, tracks active subs, resubscribes after reconnect.

import type { QuoteSymbol } from "../types";
import type { WsPriceMode, WsInstrumentMapping, WsSubscribeMessage, WsUnsubscribeMessage } from "./indstocks-ws-types";

export interface SubscriptionEntry {
  readonly symbol: QuoteSymbol | string;
  readonly wsToken: string;
  readonly mode: WsPriceMode;
  readonly subscribedAt: string;
}

export interface SubscriptionSnapshot {
  readonly active: readonly SubscriptionEntry[];
  readonly count: number;
}

export class IndstocksWsSubscriptionManager {
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private readonly mappingResolver: (symbol: QuoteSymbol | string) => WsInstrumentMapping | null;

  constructor(mappingResolver: (symbol: QuoteSymbol | string) => WsInstrumentMapping | null) {
    this.mappingResolver = mappingResolver;
  }

  subscribe(symbol: QuoteSymbol | string, mode: WsPriceMode = "ltp"): WsSubscribeMessage | null {
    const key = this.key(symbol, mode);
    if (this.subscriptions.has(key)) return null; // duplicate

    const mapping = this.mappingResolver(symbol);
    if (!mapping || !mapping.verified) return null; // unresolved token

    const entry: SubscriptionEntry = {
      symbol,
      wsToken: mapping.wsToken,
      mode,
      subscribedAt: new Date().toISOString(),
    };
    this.subscriptions.set(key, entry);

    return {
      action: "subscribe",
      mode,
      instruments: [mapping.wsToken],
    };
  }

  unsubscribe(symbol: QuoteSymbol | string, mode: WsPriceMode = "ltp"): WsUnsubscribeMessage | null {
    const key = this.key(symbol, mode);
    const entry = this.subscriptions.get(key);
    if (!entry) return null;

    this.subscriptions.delete(key);
    return {
      action: "unsubscribe",
      mode,
      instruments: [entry.wsToken],
    };
  }

  /**
   * Returns subscribe messages for all active subscriptions.
   * Used after reconnect to restore state.
   */
  resubscribeAll(): WsSubscribeMessage[] {
    const byMode = new Map<string, string[]>();
    for (const entry of this.subscriptions.values()) {
      const tokens = byMode.get(entry.mode) ?? [];
      tokens.push(entry.wsToken);
      byMode.set(entry.mode, tokens);
    }
    const messages: WsSubscribeMessage[] = [];
    for (const [mode, instruments] of byMode) {
      messages.push({ action: "subscribe", mode: mode as WsPriceMode, instruments });
    }
    return messages;
  }

  snapshot(): SubscriptionSnapshot {
    return {
      active: [...this.subscriptions.values()],
      count: this.subscriptions.size,
    };
  }

  has(symbol: QuoteSymbol | string, mode: WsPriceMode = "ltp"): boolean {
    return this.subscriptions.has(this.key(symbol, mode));
  }

  clear(): void {
    this.subscriptions.clear();
  }

  private key(symbol: QuoteSymbol | string, mode: WsPriceMode): string {
    return `${symbol}::${mode}`;
  }
}
