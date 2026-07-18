// Phase 3F — Ticker normalization. Pure — no fetch.

import type { CoindcxTicker } from "./types";

function asNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a single ticker row returned by `/exchange/ticker`. Missing
 * numeric fields become null — callers surface that as DELAYED/STALE via
 * meta rather than dropping the row.
 */
export function normalizeTickerRow(raw: unknown, nowIso: string): CoindcxTicker | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pair = typeof r.market === "string" ? r.market : "";
  const last = asNum(r.last_price);
  if (!pair || last == null) return null;
  const timestamp = typeof r.timestamp === "number"
    ? new Date(r.timestamp).toISOString()
    : typeof r.timestamp === "string"
      ? r.timestamp
      : nowIso;
  return {
    pair,
    last,
    bid: asNum(r.bid),
    ask: asNum(r.ask),
    high24h: asNum(r.high),
    low24h: asNum(r.low),
    change24hPct: asNum(r.change_24_hour) ?? asNum(r.change_24_hour_percentage),
    volume24h: asNum(r.volume),
    quoteVolume24h: asNum(r.total_volume) ?? asNum(r.base_volume),
    timestamp,
  };
}

/** Index a ticker array by pair. Unknown rows are dropped. */
export function indexTickers(rows: unknown, nowIso: string): Map<string, CoindcxTicker> {
  const out = new Map<string, CoindcxTicker>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const t = normalizeTickerRow(row, nowIso);
    if (t) out.set(t.pair, t);
  }
  return out;
}
