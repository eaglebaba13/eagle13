// Phase 26 · Stage 4 — Map Upstox QuoteTick → dashboard IndexQuote.
// Pure module (no server-only imports) so it can be unit-tested and
// re-used from either side of the RPC boundary.

import type { QuoteTick, HistoricalCandle } from "./provider-foundation/types";
import type { IndexQuote, OHLC } from "./market.functions";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveUpstoxDailyChange(input: {
  lastPrice: number | null | undefined;
  change?: number | null;
  changePct?: number | null;
  prevClose?: number | null;
}): { change: number | null; changePct: number | null } {
  const validClose = typeof input.prevClose === "number" && Number.isFinite(input.prevClose) && input.prevClose > 0;
  if (typeof input.change === "number" && Number.isFinite(input.change) && input.change !== 0) {
    return {
      change: input.change,
      changePct: typeof input.changePct === "number" && Number.isFinite(input.changePct)
        ? input.changePct
        : validClose ? (input.change / input.prevClose!) * 100 : null,
    };
  }
  if (validClose && typeof input.lastPrice === "number" && Number.isFinite(input.lastPrice) && input.lastPrice > 0) {
    const change = input.lastPrice - input.prevClose!;
    return { change, changePct: (change / input.prevClose!) * 100 };
  }
  return { change: null, changePct: null };
}

function istDateFromIso(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  const base = Number.isFinite(t) ? t : Date.now();
  return new Date(base + 19800_000).toISOString().slice(0, 10);
}

function todayIst(): string {
  return new Date(Date.now() + 19800_000).toISOString().slice(0, 10);
}

export interface MapUpstoxQuoteInput {
  readonly symbol: string;
  readonly name: string;
  readonly tick: QuoteTick;
  readonly dailyCandles?: readonly HistoricalCandle[];
}

/**
 * Map Upstox quote + optional daily candles into the dashboard's
 * IndexQuote shape. Never fabricates values — when a field is missing we
 * fall back to a safe zero-derived value that still satisfies the shape
 * but is flagged by prevDay.date === "" for observability.
 */
export function mapUpstoxToIndexQuote(input: MapUpstoxQuoteInput): IndexQuote {
  const { tick, symbol, name, dailyCandles = [] } = input;
  const livePrice = round2(tick.last);

  const sorted = [...dailyCandles].sort((a, b) => (a.time < b.time ? -1 : 1));
  const today = todayIst();
  let prevIdx = sorted.length - 1;
  if (prevIdx >= 0 && istDateFromIso(sorted[prevIdx].time) === today) prevIdx -= 1;
  const prev = prevIdx >= 0 ? sorted[prevIdx] : null;
  const sessionBefore = prevIdx > 0 ? sorted[prevIdx - 1] : prev;

  const prevClose = prev?.close ?? tick.prevClose ?? tick.open ?? livePrice;
  // Daily deltas use the quote API baseline, never an intraday/historical candle.
  const daily = resolveUpstoxDailyChange({
    lastPrice: tick.last,
    change: tick.change,
    changePct: tick.changePct,
    prevClose: tick.prevClose,
  });

  const prevDay: OHLC = {
    open: round2(prev?.open ?? tick.open ?? prevClose),
    high: round2(prev?.high ?? tick.high ?? prevClose),
    low: round2(prev?.low ?? tick.low ?? prevClose),
    close: round2(prevClose),
    date: prev ? istDateFromIso(prev.time) : "",
  };

  const marketState: "OPEN" | "CLOSED" =
    tick.telemetry.marketSession === "REGULAR" ? "OPEN" : "CLOSED";

  return {
    symbol,
    name,
    livePrice,
    prevSessionClose: round2(sessionBefore?.close ?? prevClose),
    change: round2(daily.change ?? 0),
    changePct: round2(daily.changePct ?? 0),
    dailyQuote: { source: "UPSTOX", prevClose: tick.prevClose, ...daily },
    marketState,
    prevDay,
    updatedAt: tick.telemetry.receivedAt ?? new Date().toISOString(),
    providerTime: tick.telemetry.providerTime,
  };
}
