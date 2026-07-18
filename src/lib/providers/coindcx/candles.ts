// Phase 3F — Candle normalization. Pure — no fetch.

import type { CoindcxCandle } from "./types";

function asNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize candles payload from `/market_data/candles`. The public route
 * returns `[{ open, high, low, close, volume, time }, ...]` where `time`
 * is a Unix ms close time.
 */
export function parseCandles(raw: unknown): readonly CoindcxCandle[] {
  if (!Array.isArray(raw)) return [];
  const out: CoindcxCandle[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const o = asNum(r.open);
    const h = asNum(r.high);
    const l = asNum(r.low);
    const c = asNum(r.close);
    const time = asNum(r.time);
    if (o == null || h == null || l == null || c == null || time == null) continue;
    out.push({
      time: new Date(time).toISOString(),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: asNum(r.volume),
    });
  }
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}
