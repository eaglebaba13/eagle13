// Deterministic normalization + validation for INDstocks candle payloads.
// Never fabricates data — invalid rows are rejected.

import type { HistoricalCandle } from "../types";
import type { IndstocksCandleRaw } from "./indstocks-types";

export interface IndstocksNormalizeResult {
  readonly candles: readonly HistoricalCandle[];
  readonly rejected: readonly IndstocksRejectedRow[];
}

export interface IndstocksRejectedRow {
  readonly index: number;
  readonly reason: string;
  readonly row: unknown;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Parse INDstocks historical response candles.
 * Response shape: { success: true, data: { candles: [ { ts, o, h, l, c, v }, ... ] } }
 * ts is Unix epoch SECONDS.
 */
export function parseIndstocksCandles(raw: unknown): IndstocksCandleRaw[] | null {
  if (!raw || typeof raw !== "object") return null;
  const anyRaw = raw as { data?: { candles?: unknown } };
  const candles = anyRaw.data?.candles;
  if (!Array.isArray(candles)) return null;
  return candles as IndstocksCandleRaw[];
}

export function normalizeIndstocksCandles(
  rows: readonly IndstocksCandleRaw[],
  nowMs: number,
): IndstocksNormalizeResult {
  const rejected: IndstocksRejectedRow[] = [];
  const accepted: HistoricalCandle[] = [];
  const seen = new Set<number>();

  rows.forEach((row, index) => {
    // Validate timestamp (Unix seconds → ISO)
    if (!isFiniteNumber(row.ts) || row.ts <= 0) {
      rejected.push({ index, reason: "invalid timestamp", row });
      return;
    }
    // Reject duplicates
    if (seen.has(row.ts)) {
      rejected.push({ index, reason: "duplicate timestamp", row });
      return;
    }
    // Reject future candles (tolerance 60s)
    const rowMs = row.ts * 1000;
    if (rowMs > nowMs + 60_000) {
      rejected.push({ index, reason: "future candle", row });
      return;
    }
    // Validate OHLC
    if (
      !isFiniteNumber(row.o) ||
      !isFiniteNumber(row.h) ||
      !isFiniteNumber(row.l) ||
      !isFiniteNumber(row.c)
    ) {
      rejected.push({ index, reason: "non-finite OHLC", row });
      return;
    }
    if (row.h < Math.max(row.o, row.c, row.l)) {
      rejected.push({ index, reason: "high < max(open,close,low)", row });
      return;
    }
    if (row.l > Math.min(row.o, row.c, row.h)) {
      rejected.push({ index, reason: "low > min(open,close,high)", row });
      return;
    }
    // Volume can be 0 but must be finite and non-negative
    if (!isFiniteNumber(row.v) || row.v < 0) {
      rejected.push({ index, reason: "invalid volume", row });
      return;
    }

    seen.add(row.ts);
    accepted.push({
      time: new Date(rowMs).toISOString(),
      open: row.o,
      high: row.h,
      low: row.l,
      close: row.c,
      volume: row.v,
      closed: true,
    });
  });

  // Sort ascending by timestamp
  accepted.sort((a, b) => a.time.localeCompare(b.time));

  return { candles: accepted, rejected };
}

export interface IndstocksDataQualityReport {
  readonly requestedFrom: string;
  readonly requestedTo: string;
  readonly actualFrom: string | null;
  readonly actualTo: string | null;
  readonly candleCount: number;
  readonly duplicates: number;
  readonly invalidOhlc: number;
  readonly futureRows: number;
  readonly provider: "INDSTOCKS";
  readonly timezone: "Asia/Kolkata";
}

export function computeIndstocksDataQuality(
  from: string,
  to: string,
  candles: readonly HistoricalCandle[],
  rejected: readonly IndstocksRejectedRow[],
): IndstocksDataQualityReport {
  return {
    requestedFrom: from,
    requestedTo: to,
    actualFrom: candles.length > 0 ? candles[0].time : null,
    actualTo: candles.length > 0 ? candles[candles.length - 1].time : null,
    candleCount: candles.length,
    duplicates: rejected.filter((r) => r.reason === "duplicate timestamp").length,
    invalidOhlc: rejected.filter(
      (r) => r.reason.includes("OHLC") || r.reason.includes("high") || r.reason.includes("low"),
    ).length,
    futureRows: rejected.filter((r) => r.reason === "future candle").length,
    provider: "INDSTOCKS",
    timezone: "Asia/Kolkata",
  };
}

/**
 * Merge multiple candle chunks, deduplicating by timestamp and sorting ascending.
 */
export function mergeIndstocksCandleChunks(
  chunks: readonly (readonly HistoricalCandle[])[],
): readonly HistoricalCandle[] {
  const byTime = new Map<string, HistoricalCandle>();
  for (const chunk of chunks) {
    for (const c of chunk) {
      byTime.set(c.time, c);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}
