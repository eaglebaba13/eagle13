// Deterministic, client-safe normalization + validation for Upstox
// candle payloads. Never fabricates data — invalid rows are rejected.

import type { HistoricalCandle } from "../types";
import type { UpstoxCandleRaw } from "./upstox-types";

export interface NormalizeResult {
  readonly candles: readonly HistoricalCandle[];
  readonly rejected: readonly RejectedRow[];
}

export interface RejectedRow {
  readonly index: number;
  readonly reason: string;
  readonly row: unknown;
}

// Upstox V3 historical response: `data.candles` is an array of tuples
// ordered as [timestamp, open, high, low, close, volume, openInterest?].
export type UpstoxCandleTuple = readonly [
  string,
  number,
  number,
  number,
  number,
  number,
  number?,
];

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function parseUpstoxCandles(raw: unknown): UpstoxCandleTuple[] | null {
  if (!raw || typeof raw !== "object") return null;
  const anyRaw = raw as { data?: { candles?: unknown } };
  const candles = anyRaw.data?.candles;
  if (!Array.isArray(candles)) return null;
  return candles as UpstoxCandleTuple[];
}

export function tupleToRaw(t: UpstoxCandleTuple): UpstoxCandleRaw | null {
  if (!Array.isArray(t) || t.length < 6) return null;
  const [time, open, high, low, close, volume, oi] = t;
  if (typeof time !== "string") return null;
  return {
    time,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
    openInterest: typeof oi === "number" ? oi : undefined,
  };
}

function isFutureIso(iso: string, nowMs: number, toleranceMs = 60_000): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return t > nowMs + toleranceMs;
}

export function normalizeCandles(
  rows: readonly UpstoxCandleRaw[],
  nowMs: number,
): NormalizeResult {
  const rejected: RejectedRow[] = [];
  const accepted: HistoricalCandle[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    if (!isFiniteNumber(row.open) || !isFiniteNumber(row.high) ||
        !isFiniteNumber(row.low) || !isFiniteNumber(row.close)) {
      rejected.push({ index, reason: "non-finite OHLC", row });
      return;
    }
    if (row.high < Math.max(row.open, row.close, row.low)) {
      rejected.push({ index, reason: "high < max(open,close,low)", row });
      return;
    }
    if (row.low > Math.min(row.open, row.close, row.high)) {
      rejected.push({ index, reason: "low > min(open,close,high)", row });
      return;
    }
    if (!isFiniteNumber(row.volume) || row.volume < 0) {
      rejected.push({ index, reason: "invalid volume", row });
      return;
    }
    if (typeof row.time !== "string" || Number.isNaN(Date.parse(row.time))) {
      rejected.push({ index, reason: "invalid timestamp", row });
      return;
    }
    if (isFutureIso(row.time, nowMs)) {
      rejected.push({ index, reason: "future candle", row });
      return;
    }
    if (seen.has(row.time)) {
      rejected.push({ index, reason: "duplicate timestamp", row });
      return;
    }
    seen.add(row.time);
    accepted.push({
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      closed: true,
    });
  });

  // Enforce ascending order deterministically.
  const sorted = [...accepted].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return { candles: sorted, rejected };
}

export interface DataQualityReport {
  readonly requestedFrom: string;
  readonly requestedTo: string;
  readonly actualFrom: string | null;
  readonly actualTo: string | null;
  readonly candleCount: number;
  readonly duplicates: number;
  readonly invalidOhlc: number;
  readonly outOfOrder: number;
  readonly futureRows: number;
  readonly coveragePct: number;
  readonly timezone: "Asia/Kolkata";
  readonly provider: "UPSTOX_HISTORICAL_V1";
  readonly adjusted: "UNKNOWN";
  readonly insufficient: boolean;
}

export function computeDataQuality(
  requestedFrom: string,
  requestedTo: string,
  candles: readonly HistoricalCandle[],
  rejected: readonly RejectedRow[],
  expectedMin: number,
): DataQualityReport {
  const first = candles[0]?.time ?? null;
  const last = candles[candles.length - 1]?.time ?? null;
  const duplicates = rejected.filter((r) => r.reason === "duplicate timestamp").length;
  const invalidOhlc = rejected.filter((r) => r.reason.includes("OHLC") || r.reason.startsWith("high") || r.reason.startsWith("low")).length;
  const futureRows = rejected.filter((r) => r.reason === "future candle").length;
  const outOfOrder = 0; // ascending enforced during normalization
  const coveragePct = expectedMin <= 0 ? 100 : Math.min(100, (candles.length / expectedMin) * 100);
  return {
    requestedFrom,
    requestedTo,
    actualFrom: first,
    actualTo: last,
    candleCount: candles.length,
    duplicates,
    invalidOhlc,
    outOfOrder,
    futureRows,
    coveragePct: Math.round(coveragePct * 100) / 100,
    timezone: "Asia/Kolkata",
    provider: "UPSTOX_HISTORICAL_V1",
    adjusted: "UNKNOWN",
    insufficient: candles.length < expectedMin,
  };
}

/** Deduplicate candles across chunk boundaries, preserving order. */
export function mergeCandleChunks(
  chunks: readonly (readonly HistoricalCandle[])[],
): readonly HistoricalCandle[] {
  const seen = new Set<string>();
  const merged: HistoricalCandle[] = [];
  for (const chunk of chunks) {
    for (const c of chunk) {
      if (seen.has(c.time)) continue;
      seen.add(c.time);
      merged.push(c);
    }
  }
  merged.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return merged;
}