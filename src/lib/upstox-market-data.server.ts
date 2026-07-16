// Phase 26 · Stage 4 — Upstox → dashboard MARKET_DATA bridge.
//
// Uses the already-shipped Upstox historical adapter (Quote API + 1d
// candles). No new provider request patterns; both calls are wrapped in a
// single Promise.all per index. Returns null when Upstox is unavailable
// so callers can fall back cleanly — NEVER a mock value.

import { UpstoxHistoricalAdapter } from "./provider-foundation/upstox/upstox-historical.adapter.server";
import type { QuoteSymbol } from "./provider-foundation/types";
import { mapUpstoxToIndexQuote } from "./upstox-quote-mapper";
import type { IndexQuote } from "./market.functions";

export type UpstoxIndexSymbol = Extract<QuoteSymbol, "NIFTY50" | "BANKNIFTY" | "INDIA_VIX">;

const NAME_BY_SYMBOL: Record<UpstoxIndexSymbol, { name: string; label: string }> = {
  NIFTY50: { name: "NIFTY 50", label: "^NSEI" },
  BANKNIFTY: { name: "BANK NIFTY", label: "^NSEBANK" },
  INDIA_VIX: { name: "INDIA VIX", label: "^INDIAVIX" },
};

export interface UpstoxIndexQuoteResult {
  readonly ok: true;
  readonly quote: IndexQuote;
  readonly providerMetadata: {
    readonly name: "upstox-historical-v1";
    readonly status: string; // ProviderStatus from telemetry
    readonly receivedAt: string;
    readonly providerTime: string | null;
  };
}
export interface UpstoxIndexQuoteFailure {
  readonly ok: false;
  readonly reason: string;
  readonly detail?: string;
}

export async function fetchUpstoxIndexQuote(
  symbol: UpstoxIndexSymbol,
  nowIso: string = new Date().toISOString(),
  adapter: UpstoxHistoricalAdapter = new UpstoxHistoricalAdapter(),
): Promise<UpstoxIndexQuoteResult | UpstoxIndexQuoteFailure> {
  try {
    const [quoteRes, histRes] = await Promise.all([
      adapter.fetchQuote(symbol, nowIso),
      adapter
        .fetchHistorical(symbol, "1d", 5, nowIso)
        .catch(() => null),
    ]);
    if (!quoteRes.ok) {
      return { ok: false, reason: quoteRes.reason, detail: quoteRes.detail };
    }
    const meta = NAME_BY_SYMBOL[symbol];
    const candles =
      histRes && histRes.ok ? histRes.data.candles : [];
    const quote = mapUpstoxToIndexQuote({
      symbol: meta.label,
      name: meta.name,
      tick: quoteRes.data,
      dailyCandles: candles,
    });
    return {
      ok: true,
      quote,
      providerMetadata: {
        name: "upstox-historical-v1",
        status: quoteRes.data.telemetry.status,
        receivedAt: quoteRes.data.telemetry.receivedAt,
        providerTime: quoteRes.data.telemetry.providerTime,
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: "UNKNOWN",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}